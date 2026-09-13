import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-13.1/13.2/13.4 ("Country / Compliance Pack Administration",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §17). See the migration's own docstring
 * (`20260912440000_platform_compliance_registry.sql`) for the full entity-ownership
 * analysis: this is a platform-wide administrative registry of which countries/compliance
 * packs/pack features are administratively offered, sitting above `module-gst`'s own
 * compile-time `COUNTRY_CATALOG` ("what has engineering built") and above a business's own
 * tenant-scoped `gst.compliance_profiles` row ("what has this business registered under") --
 * never a duplicate of either. PLATFORM-P0-13.3 ("Rule Version") is deliberately NOT built
 * here -- see the migration's own docstring and this story's audit-log entry for the
 * genuine architecture/entity-ownership conflict with `gst.tax_rules` that this run stopped
 * and reported on instead of guessing at.
 *
 * Same authorization shape as `platform-plans.ts`: the request-scoped, cookie-authenticated
 * client (not `createAdminClient`) for every read/write, so each table's own RLS
 * (`platform.is_superadmin()`) is the authoritative enforcement layer --
 * `requireSuperadmin()` here is defense-in-depth on top, not a substitute. No delete
 * function is exported anywhere in this file, on purpose -- the migration grants no DELETE
 * to `authenticated` at all (mirrors `platform.plans`' own "disable, never remove" stance;
 * see that migration's own docstring for why).
 */

export type ComplianceCountry = {
  countryCode: string;
  name: string;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type ComplianceCountryRow = {
  country_code: string;
  name: string;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function toCountry(row: ComplianceCountryRow): ComplianceCountry {
  return {
    countryCode: row.country_code,
    name: row.name,
    enabled: row.enabled,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export type CompliancePack = {
  id: string;
  countryCode: string;
  regime: string;
  displayName: string;
  enabled: boolean;
  version: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type CompliancePackRow = {
  id: string;
  country_code: string;
  regime: string;
  display_name: string;
  enabled: boolean;
  version: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function toPack(row: CompliancePackRow): CompliancePack {
  return {
    id: row.id,
    countryCode: row.country_code,
    regime: row.regime,
    displayName: row.display_name,
    enabled: row.enabled,
    version: row.version,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export type CompliancePackFeature = {
  id: string;
  packId: string;
  featureKey: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type CompliancePackFeatureRow = {
  id: string;
  pack_id: string;
  feature_key: string;
  display_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function toPackFeature(row: CompliancePackFeatureRow): CompliancePackFeature {
  return {
    id: row.id,
    packId: row.pack_id,
    featureKey: row.feature_key,
    displayName: row.display_name,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** PLATFORM-P0-13.1 -- every country in the registry, alphabetically. */
export async function listComplianceCountries(): Promise<ComplianceCountry[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("compliance_countries").select("*").order("country_code");
  if (error) throw error;
  return (data as ComplianceCountryRow[]).map(toCountry);
}

/** PLATFORM-P0-13.2 -- every compliance pack, joined with its country for display. Ordered
 * by country then regime so the UI can group rows by country without a second query. */
export async function listCompliancePacks(): Promise<CompliancePack[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("compliance_packs")
    .select("*")
    .order("country_code")
    .order("regime");
  if (error) throw error;
  return (data as CompliancePackRow[]).map(toPack);
}

/** PLATFORM-P0-13.4 -- every feature flag belonging to one compliance pack. */
export async function listCompliancePackFeatures(packId: string): Promise<CompliancePackFeature[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("compliance_pack_features")
    .select("*")
    .eq("pack_id", packId)
    .order("feature_key");
  if (error) throw error;
  return (data as CompliancePackFeatureRow[]).map(toPackFeature);
}

export async function getCompliancePack(id: string): Promise<CompliancePack | null> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("compliance_packs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPack(data as CompliancePackRow) : null;
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a 2-letter ISO country code, e.g. IN or US");
const countryName = z.string().trim().min(1, "Country name is required");
const optionalNotes = z
  .string()
  .trim()
  .max(2000, "Notes must be 2000 characters or fewer.")
  .transform((v) => (v === "" ? null : v));
const enabledBool = z.coerce.boolean();

/** `countryCode` is part of creation only -- the stable identifier
 * `platform.compliance_packs.country_code` FKs into, so letting it change after creation
 * would silently detach every pack that already references it. */
export const createComplianceCountrySchema = z.object({
  countryCode,
  name: countryName,
  enabled: enabledBool,
  notes: optionalNotes,
});
export type CreateComplianceCountryInput = z.input<typeof createComplianceCountrySchema>;

export const updateComplianceCountrySchema = createComplianceCountrySchema.omit({ countryCode: true });
export type UpdateComplianceCountryInput = z.input<typeof updateComplianceCountrySchema>;

export async function createComplianceCountry(
  input: CreateComplianceCountryInput,
): Promise<{ ok: true; country: ComplianceCountry } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = createComplianceCountrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("compliance_countries")
    .insert({
      country_code: parsed.data.countryCode,
      name: parsed.data.name,
      enabled: parsed.data.enabled,
      notes: parsed.data.notes,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { countryCode: "A country with this code already exists." } };
    }
    throw error;
  }
  return { ok: true, country: toCountry(data as ComplianceCountryRow) };
}

export async function updateComplianceCountry(
  code: string,
  input: UpdateComplianceCountryInput,
): Promise<{ ok: true; country: ComplianceCountry } | { ok: false; fieldErrors: Record<string, string> } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = updateComplianceCountrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("compliance_countries")
    .update({
      name: parsed.data.name,
      enabled: parsed.data.enabled,
      notes: parsed.data.notes,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("country_code", code)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "Country not found." };
  return { ok: true, country: toCountry(data as ComplianceCountryRow) };
}

/** Instant-flip toggle for a country's own `enabled` -- mirrors
 * `module-entitlements-section.tsx`'s "single boolean, no separate save step" shape. */
export async function setComplianceCountryEnabled(
  code: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("compliance_countries")
    .update({ enabled, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("country_code", code);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const regimeKey = z.string().trim().min(1, "Regime is required");
const packDisplayName = z.string().trim().min(1, "Display name is required");
const optionalVersion = z
  .string()
  .trim()
  .max(100, "Version must be 100 characters or fewer.")
  .transform((v) => (v === "" ? null : v));

/** `countryCode`/`regime` are part of creation only -- together they're the stable identity
 * (`unique (country_code, regime)`) other rows (feature flags) hang off of via `pack_id`. */
export const createCompliancePackSchema = z.object({
  countryCode,
  regime: regimeKey,
  displayName: packDisplayName,
  enabled: enabledBool,
  version: optionalVersion,
  notes: optionalNotes,
});
export type CreateCompliancePackInput = z.input<typeof createCompliancePackSchema>;

export const updateCompliancePackSchema = createCompliancePackSchema.omit({ countryCode: true, regime: true });
export type UpdateCompliancePackInput = z.input<typeof updateCompliancePackSchema>;

export async function createCompliancePack(
  input: CreateCompliancePackInput,
): Promise<{ ok: true; pack: CompliancePack } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = createCompliancePackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("compliance_packs")
    .insert({
      country_code: parsed.data.countryCode,
      regime: parsed.data.regime,
      display_name: parsed.data.displayName,
      enabled: parsed.data.enabled,
      version: parsed.data.version,
      notes: parsed.data.notes,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { regime: "This country already has a pack for this regime." } };
    }
    if (error.code === "23503") {
      return { ok: false, fieldErrors: { countryCode: "Unknown country -- add it to the country registry first." } };
    }
    throw error;
  }
  return { ok: true, pack: toPack(data as CompliancePackRow) };
}

export async function updateCompliancePack(
  id: string,
  input: UpdateCompliancePackInput,
): Promise<{ ok: true; pack: CompliancePack } | { ok: false; fieldErrors: Record<string, string> } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = updateCompliancePackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("compliance_packs")
    .update({
      display_name: parsed.data.displayName,
      enabled: parsed.data.enabled,
      version: parsed.data.version,
      notes: parsed.data.notes,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "Compliance pack not found." };
  return { ok: true, pack: toPack(data as CompliancePackRow) };
}

const featureKey = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Feature key is required")
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, and underscores only, e.g. \"eway_bill\"");
const featureDisplayName = z.string().trim().min(1, "Display name is required");

export const createCompliancePackFeatureSchema = z.object({
  featureKey,
  displayName: featureDisplayName,
  enabled: enabledBool,
});
export type CreateCompliancePackFeatureInput = z.input<typeof createCompliancePackFeatureSchema>;

export async function createCompliancePackFeature(
  packId: string,
  input: CreateCompliancePackFeatureInput,
): Promise<{ ok: true; feature: CompliancePackFeature } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = createCompliancePackFeatureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("compliance_pack_features")
    .insert({
      pack_id: packId,
      feature_key: parsed.data.featureKey,
      display_name: parsed.data.displayName,
      enabled: parsed.data.enabled,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { featureKey: "This pack already has a feature with this key." } };
    }
    throw error;
  }
  return { ok: true, feature: toPackFeature(data as CompliancePackFeatureRow) };
}

/** Instant-flip toggle for one pack feature -- same "single boolean, no separate save
 * step" shape as `setComplianceCountryEnabled`/`ModuleEntitlementsSection`. */
export async function setCompliancePackFeatureEnabled(
  id: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("compliance_pack_features")
    .update({ enabled, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
