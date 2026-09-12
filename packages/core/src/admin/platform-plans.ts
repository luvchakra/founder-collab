import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { seedPlanModuleEntitlements } from "./platform-plan-modules";

/**
 * PLATFORM-P0-04.1 ("Plan Management", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8):
 * the platform-wide subscription/pricing catalog. `platform.plans` -- see the migration's
 * own docstring for why this is genuinely new (not a duplicate of anything in the
 * entity-ownership map) and why it lives in `platform`, not `core`.
 *
 * Same authorization shape as `platform-branding.ts`: the request-scoped,
 * cookie-authenticated client (not `createAdminClient`) for every read/write, so
 * `platform.plans`' own RLS policies (`platform.is_superadmin()`) are the authoritative
 * enforcement layer -- `requireSuperadmin()` is defense-in-depth on top, not a substitute.
 *
 * No delete function is exported here, on purpose: the migration grants no DELETE to
 * `authenticated` at all (see its own docstring on PLATFORM-P0-04.7's "do not delete plans
 * with historical subscribers" -- there is no subscriber concept yet, so this is the
 * simplest safe stance until PLATFORM-P0-05.4 wires `core.licenses` to a plan). A plan a
 * superadmin no longer wants offered is moved to `status: 'archived'`, never removed.
 */

export type PlanStatus = "draft" | "active" | "deprecated" | "archived";
const PLAN_STATUSES = ["draft", "active", "deprecated", "archived"] as const;

export type BillingInterval = "month" | "year";
const BILLING_INTERVALS = ["month", "year"] as const;

export type PlatformPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number;
  billingInterval: BillingInterval;
  currency: string;
  status: PlanStatus;
  displayOrder: number;
  marketingVisible: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type PlanRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number | string;
  billing_interval: BillingInterval;
  currency: string;
  status: PlanStatus;
  display_order: number;
  marketing_visible: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function toPlan(row: PlanRow): PlatformPlan {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    // Postgres `numeric` comes back through postgrest as a string in some client/driver
    // combinations -- coerced to a number here so callers never have to guess which shape
    // they got, matching how core.documents/core.payments' own callers already normalize
    // `numeric` columns at the boundary.
    price: typeof row.price === "string" ? Number(row.price) : row.price,
    billingInterval: row.billing_interval,
    currency: row.currency,
    status: row.status,
    displayOrder: row.display_order,
    marketingVisible: row.marketing_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Lists every plan, ordered the way the admin list and any future pricing page should
 * render them -- by `display_order`, not creation time. */
export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("plans").select("*").order("display_order", { ascending: true });
  if (error) throw error;
  return (data as PlanRow[]).map(toPlan);
}

export async function getPlatformPlan(id: string): Promise<PlatformPlan | null> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPlan(data as PlanRow) : null;
}

const planKey = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Plan key is required")
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, and underscores only, e.g. \"growth\"");
const planName = z.string().trim().min(1, "Plan name is required");
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));
const price = z.coerce.number().min(0, "Price cannot be negative");
const billingInterval = z.enum(BILLING_INTERVALS);
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. INR or USD");
const status = z.enum(PLAN_STATUSES);
const displayOrder = z.coerce.number().int("Display order must be a whole number");
const marketingVisible = z.coerce.boolean();

/** `key` is part of creation only -- see `updatePlatformPlanSchema` below, which omits it.
 * It's the stable identifier a future entitlement table references (mirroring
 * `core.modules.key`'s own role), so letting it change after creation would silently
 * detach a plan from whatever already points at it. */
export const createPlatformPlanSchema = z.object({
  key: planKey,
  name: planName,
  description: optionalText,
  price,
  billingInterval,
  currency,
  status,
  displayOrder,
  marketingVisible,
});
export type CreatePlatformPlanInput = z.input<typeof createPlatformPlanSchema>;

export const updatePlatformPlanSchema = createPlatformPlanSchema.omit({ key: true });
export type UpdatePlatformPlanInput = z.input<typeof updatePlatformPlanSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createPlatformPlan(
  input: CreatePlatformPlanInput,
): Promise<{ ok: true; plan: PlatformPlan } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();

  const parsed = createPlatformPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("plans")
    .insert({
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      billing_interval: parsed.data.billingInterval,
      currency: parsed.data.currency,
      status: parsed.data.status,
      display_order: parsed.data.displayOrder,
      marketing_visible: parsed.data.marketingVisible,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { key: "A plan with this key already exists." } };
    }
    throw error;
  }

  // PLATFORM-P0-04.3: a brand-new plan gets one plan_modules row per existing module,
  // enabled by default -- the same default the migration's own one-time seed gave every
  // plan that already existed, so no plan is ever left with silently missing module
  // entitlement rows. Not part of the plan_modules migration's own seed (that ran once,
  // at migration time, over the plans that existed then).
  await seedPlanModuleEntitlements(data.id as string);

  return { ok: true, plan: toPlan(data as PlanRow) };
}

export async function updatePlatformPlan(
  id: string,
  input: UpdatePlatformPlanInput,
): Promise<{ ok: true; plan: PlatformPlan } | { ok: false; fieldErrors: Record<string, string> } | { ok: false; error: string }> {
  await requireSuperadmin();

  const parsed = updatePlatformPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("plans")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      billing_interval: parsed.data.billingInterval,
      currency: parsed.data.currency,
      status: parsed.data.status,
      display_order: parsed.data.displayOrder,
      marketing_visible: parsed.data.marketingVisible,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "Plan not found." };

  return { ok: true, plan: toPlan(data as PlanRow) };
}
