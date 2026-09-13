import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey } from "../licensing/types";

/**
 * PLATFORM-P0-15.1/15.2/15.3/15.4 ("Global Announcements / Maintenance",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §19). See the migration's own docstring
 * (`20260912460000_platform_announcements.sql`) for the full entity-ownership reasoning
 * (distinct from `platform.email_templates`'s `system_announcements` delivery template and
 * from `platform.modules.status`'s per-module maintenance access-control state) and for
 * why every mutation goes through `platform.create_announcement()`/`update_announcement()`/
 * `delete_announcement()` -- there is no plain `.insert()`/`.update()`/`.delete()` path
 * anywhere in this file.
 *
 * **No runtime consumer reads this table yet.** No customer-facing banner/notice component
 * exists anywhere in `apps/web`'s dashboard; nothing evaluates `enabled`/the publish-expire
 * window/the maintenance window/`affectedModules` to actually show or gate anything. This
 * file records the catalog; a future, separate story builds real audience-resolution and
 * display.
 *
 * Same authorization shape as every other `platform.*` admin module: the request-scoped,
 * cookie-authenticated client, so `platform.announcements`' own RLS (open SELECT, no direct
 * write grant to `authenticated` at all) is the authoritative enforcement layer.
 * `requireSuperadmin()` here is defense-in-depth -- the three RPCs re-check
 * `platform.is_superadmin()` themselves too, since `SECURITY DEFINER` bypasses RLS.
 */

export type AnnouncementType = "information" | "warning" | "maintenance" | "critical";
export type AnnouncementAudienceType = "all_customers" | "all_users" | "specific_plan" | "specific_country";

export type Announcement = {
  id: string;
  type: AnnouncementType;
  title: string;
  message: string;
  audienceType: AnnouncementAudienceType;
  audiencePlan: { id: string; name: string } | null;
  audienceCountryCode: string | null;
  publishAt: string | null;
  expireAt: string | null;
  maintenanceStart: string | null;
  maintenanceEnd: string | null;
  affectedModules: ModuleKey[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type AnnouncementRow = {
  id: string;
  type: AnnouncementType;
  title: string;
  message: string;
  audience_type: AnnouncementAudienceType;
  audience_plan_id: string | null;
  audience_country_code: string | null;
  publish_at: string | null;
  expire_at: string | null;
  maintenance_start: string | null;
  maintenance_end: string | null;
  affected_modules: ModuleKey[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type PlanRow = { id: string; name: string };

async function listAllPlans(): Promise<PlanRow[]> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("plans").select("id, name").order("display_order");
  if (error) throw error;
  return data as PlanRow[];
}

async function listAllCountryCodes(): Promise<string[]> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("compliance_countries").select("country_code").order("country_code");
  if (error) throw error;
  return (data as { country_code: string }[]).map((r) => r.country_code);
}

async function listAllModules(): Promise<{ key: ModuleKey; name: string }[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("modules").select("key, name").order("key");
  if (error) throw error;
  return data as { key: ModuleKey; name: string }[];
}

function toAnnouncement(row: AnnouncementRow, plansById: Map<string, PlanRow>): Announcement {
  const plan = row.audience_plan_id ? plansById.get(row.audience_plan_id) : undefined;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    audienceType: row.audience_type,
    audiencePlan: row.audience_plan_id ? { id: row.audience_plan_id, name: plan?.name ?? row.audience_plan_id } : null,
    audienceCountryCode: row.audience_country_code,
    publishAt: row.publish_at,
    expireAt: row.expire_at,
    maintenanceStart: row.maintenance_start,
    maintenanceEnd: row.maintenance_end,
    affectedModules: row.affected_modules,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Every announcement, newest first -- callers group/filter as needed (the admin UI lists
 * them all in one table/card list). */
export async function listAnnouncements(): Promise<Announcement[]> {
  await requireSuperadmin();
  const [supabase, plans] = await Promise.all([createClient({ schema: "platform" }), listAllPlans()]);
  const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
  if (error) throw error;

  const plansById = new Map(plans.map((p) => [p.id, p]));
  return (data as AnnouncementRow[]).map((row) => toAnnouncement(row, plansById));
}

/** For the "New announcement" dialog's audience/affected-modules dropdowns. */
export async function listAnnouncementFormOptions(): Promise<{
  plans: { id: string; name: string }[];
  countryCodes: string[];
  modules: { key: ModuleKey; name: string }[];
}> {
  await requireSuperadmin();
  const [plans, countryCodes, modules] = await Promise.all([listAllPlans(), listAllCountryCodes(), listAllModules()]);
  return { plans, countryCodes, modules };
}

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(200, "Title must be 200 characters or fewer.");

const messageSchema = z
  .string()
  .trim()
  .min(1, "Message is required.")
  .max(5000, "Message must be 5000 characters or fewer.");

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Empty string (an unset date picker) normalizes to `null`; otherwise must be a value
 * `Date` can parse, forwarded as an ISO string for Postgres's `timestamptz` input. Mirrors
 * `platform-feature-flags.ts`'s own `optionalDateTimeSchema` exactly. */
const optionalDateTimeSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Not a valid date/time.")
  .transform((v) => (v === null ? null : new Date(v).toISOString()));

/** Comma-separated module keys -> a deduplicated, order-preserving list. */
const moduleListSchema = z.string().transform((value) => {
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
});

export const createAnnouncementSchema = z
  .object({
    type: z.enum(["information", "warning", "maintenance", "critical"]),
    title: titleSchema,
    message: messageSchema,
    audienceType: z.enum(["all_customers", "all_users", "specific_plan", "specific_country"]),
    audiencePlanId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
    audienceCountryCode: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? null : v)),
    publishAt: optionalDateTimeSchema,
    expireAt: optionalDateTimeSchema,
    maintenanceStart: optionalDateTimeSchema,
    maintenanceEnd: optionalDateTimeSchema,
    affectedModules: moduleListSchema,
    enabled: z.boolean(),
    reason: reasonSchema,
  })
  .superRefine((val, ctx) => {
    if (val.publishAt && val.expireAt && val.expireAt <= val.publishAt) {
      ctx.addIssue({ code: "custom", path: ["expireAt"], message: "Must be after the publish date/time." });
    }
    if (val.maintenanceStart && val.maintenanceEnd && val.maintenanceEnd <= val.maintenanceStart) {
      ctx.addIssue({ code: "custom", path: ["maintenanceEnd"], message: "Must be after the maintenance start." });
    }
    if (val.audienceType === "specific_plan" && !val.audiencePlanId) {
      ctx.addIssue({ code: "custom", path: ["audiencePlanId"], message: "Choose a plan for a plan-specific announcement." });
    }
    if (val.audienceType === "specific_country") {
      if (!val.audienceCountryCode) {
        ctx.addIssue({ code: "custom", path: ["audienceCountryCode"], message: "Choose a country for a country-specific announcement." });
      } else if (!/^[A-Z]{2}$/.test(val.audienceCountryCode)) {
        ctx.addIssue({ code: "custom", path: ["audienceCountryCode"], message: "Use a 2-letter ISO country code, e.g. \"IN\"." });
      }
    }
    if (val.type !== "maintenance" && (val.maintenanceStart || val.maintenanceEnd || val.affectedModules.length > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["affectedModules"],
        message: "Maintenance window and affected modules only apply to a Maintenance announcement.",
      });
    }
  });
export type CreateAnnouncementInput = z.input<typeof createAnnouncementSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.rpc("create_announcement", {
    p_type: parsed.data.type,
    p_title: parsed.data.title,
    p_message: parsed.data.message,
    p_audience_type: parsed.data.audienceType,
    p_audience_plan_id: parsed.data.audienceType === "specific_plan" ? parsed.data.audiencePlanId : null,
    p_audience_country_code: parsed.data.audienceType === "specific_country" ? parsed.data.audienceCountryCode : null,
    p_publish_at: parsed.data.publishAt,
    p_expire_at: parsed.data.expireAt,
    p_maintenance_start: parsed.data.type === "maintenance" ? parsed.data.maintenanceStart : null,
    p_maintenance_end: parsed.data.type === "maintenance" ? parsed.data.maintenanceEnd : null,
    p_affected_modules: parsed.data.type === "maintenance" ? parsed.data.affectedModules : [],
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export const updateAnnouncementSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["information", "warning", "maintenance", "critical"]),
    title: titleSchema,
    message: messageSchema,
    publishAt: optionalDateTimeSchema,
    expireAt: optionalDateTimeSchema,
    maintenanceStart: optionalDateTimeSchema,
    maintenanceEnd: optionalDateTimeSchema,
    affectedModules: moduleListSchema,
    enabled: z.boolean(),
    reason: reasonSchema,
  })
  .superRefine((val, ctx) => {
    if (val.publishAt && val.expireAt && val.expireAt <= val.publishAt) {
      ctx.addIssue({ code: "custom", path: ["expireAt"], message: "Must be after the publish date/time." });
    }
    if (val.maintenanceStart && val.maintenanceEnd && val.maintenanceEnd <= val.maintenanceStart) {
      ctx.addIssue({ code: "custom", path: ["maintenanceEnd"], message: "Must be after the maintenance start." });
    }
  });
export type UpdateAnnouncementInput = z.input<typeof updateAnnouncementSchema>;

/** Only `title`/`message`/the schedule/the maintenance window/`affectedModules`/`enabled`
 * are ever mutated -- `type` is passed through only to decide whether the maintenance
 * fields are kept or cleared; `audienceType`/`audiencePlanId`/`audienceCountryCode` cannot
 * be changed here at all -- see the migration's own docstring for why. */
export async function updateAnnouncement(
  input: UpdateAnnouncementInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_announcement", {
    p_id: parsed.data.id,
    p_title: parsed.data.title,
    p_message: parsed.data.message,
    p_publish_at: parsed.data.publishAt,
    p_expire_at: parsed.data.expireAt,
    p_maintenance_start: parsed.data.type === "maintenance" ? parsed.data.maintenanceStart : null,
    p_maintenance_end: parsed.data.type === "maintenance" ? parsed.data.maintenanceEnd : null,
    p_affected_modules: parsed.data.type === "maintenance" ? parsed.data.affectedModules : [],
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const deleteAnnouncementSchema = z.object({ id: z.string().uuid(), reason: reasonSchema });
export type DeleteAnnouncementInput = z.input<typeof deleteAnnouncementSchema>;

export async function deleteAnnouncement(
  input: DeleteAnnouncementInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = deleteAnnouncementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("delete_announcement", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Pure, unit-testable derivation of an announcement's *current* effective state from its
 * own stored `enabled`/`publishAt`/`expireAt` fields (CLAUDE.md development principle #9).
 * Mirrors `isFeatureFlagActive()` exactly. Deliberately **not** called from anywhere
 * outside the admin UI's own status badge this story -- no customer-facing banner
 * component exists yet (see this file's own top-of-file docstring).
 */
export function isAnnouncementActive(
  announcement: { enabled: boolean; publishAt: string | null; expireAt: string | null },
  now: Date = new Date(),
): boolean {
  if (!announcement.enabled) return false;
  if (announcement.publishAt && now < new Date(announcement.publishAt)) return false;
  if (announcement.expireAt && now > new Date(announcement.expireAt)) return false;
  return true;
}
