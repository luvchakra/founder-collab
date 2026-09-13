import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-14.1/14.2/14.3 ("Platform Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §18) -- CONFIG-ONLY, the same scope every prior `platform.*` policy file in this backlog
 * has used. See the migration's own docstring
 * (`20260912450000_platform_system_policies.sql`) for the full entity-ownership reasoning
 * (which fields mirror a real, already-enforced value elsewhere in this codebase --
 * `password_min_length`, `default_timezone`/`default_currency`, `rate_limit_api_per_minute`
 * -- and which are genuinely new, unconfigured ceilings) and for why the heavier
 * audited-RPC pattern (`platform.ai_feature_policies`'s own shape) was chosen over
 * `platform.notification_policies`'s lighter plain-RLS shape.
 *
 * No function here is read by `apps/web/app/(auth)/actions.ts`, `core.check_api_rate_limit()`,
 * `core.business_settings`'s own column defaults, or any attachment-upload/retention/webhook/
 * import/export/automation code path. This file records the policy; it enforces nothing.
 *
 * Same authorization shape as every other `platform.*` admin module: the request-scoped,
 * cookie-authenticated client, so `platform.system_policies`' own RLS (open SELECT, no direct
 * write grant to `authenticated` at all) is the authoritative enforcement layer.
 * `requireSuperadmin()` here is defense-in-depth, matching every sibling admin file --
 * `update_system_policies()` re-checks `platform.is_superadmin()` itself too, since
 * `SECURITY DEFINER` bypasses RLS.
 */

export type SystemPolicies = {
  sessionDurationMinutes: number | null;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  maxFileSizeMb: number | null;
  defaultTimezone: string;
  defaultCurrency: string;
  dataRetentionDefaultDays: number | null;
  auditRetentionDays: number | null;
  rateLimitApiPerMinute: number;
  rateLimitAiPerMinute: number | null;
  rateLimitWebhooksPerMinute: number | null;
  rateLimitImportsPerHour: number | null;
  rateLimitExportsPerHour: number | null;
  rateLimitAutomationPerMinute: number | null;
  updatedAt: string;
  updatedBy: string | null;
};

type SystemPoliciesRow = {
  session_duration_minutes: number | null;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_number: boolean;
  password_require_symbol: boolean;
  max_file_size_mb: number | null;
  default_timezone: string;
  default_currency: string;
  data_retention_default_days: number | null;
  audit_retention_days: number | null;
  rate_limit_api_per_minute: number;
  rate_limit_ai_per_minute: number | null;
  rate_limit_webhooks_per_minute: number | null;
  rate_limit_imports_per_hour: number | null;
  rate_limit_exports_per_hour: number | null;
  rate_limit_automation_per_minute: number | null;
  updated_at: string;
  updated_by: string | null;
};

function toSystemPolicies(row: SystemPoliciesRow): SystemPolicies {
  return {
    sessionDurationMinutes: row.session_duration_minutes,
    passwordMinLength: row.password_min_length,
    passwordRequireUppercase: row.password_require_uppercase,
    passwordRequireNumber: row.password_require_number,
    passwordRequireSymbol: row.password_require_symbol,
    maxFileSizeMb: row.max_file_size_mb,
    defaultTimezone: row.default_timezone,
    defaultCurrency: row.default_currency,
    dataRetentionDefaultDays: row.data_retention_default_days,
    auditRetentionDays: row.audit_retention_days,
    rateLimitApiPerMinute: row.rate_limit_api_per_minute,
    rateLimitAiPerMinute: row.rate_limit_ai_per_minute,
    rateLimitWebhooksPerMinute: row.rate_limit_webhooks_per_minute,
    rateLimitImportsPerHour: row.rate_limit_imports_per_hour,
    rateLimitExportsPerHour: row.rate_limit_exports_per_hour,
    rateLimitAutomationPerMinute: row.rate_limit_automation_per_minute,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** The one singleton system-policy row. */
export async function getSystemPolicies(): Promise<SystemPolicies> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("system_policies").select("*").eq("id", true).single();
  if (error) throw error;
  return toSystemPolicies(data as SystemPoliciesRow);
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Empty string (an unset numeric field) normalizes to `null`; otherwise must be a positive
 * integer, matching the table's own CHECK constraints. Mirrors
 * `platform-ai-feature-policies.ts`'s own `optionalPositiveNumberSchema` exactly. */
function optionalPositiveIntSchema(label: string) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || (Number.isInteger(Number(v)) && Number(v) > 0),
      `${label} must be a positive whole number.`,
    )
    .transform((v) => (v === null ? null : Number(v)));
}

/** Same as above but the field is required (backs a `not null` column) -- an empty string
 * is rejected rather than normalized to `null`. */
function requiredPositiveIntSchema(label: string) {
  return z
    .string()
    .trim()
    .refine((v) => Number.isInteger(Number(v)) && Number(v) > 0, `${label} must be a positive whole number.`)
    .transform((v) => Number(v));
}

export const updateSystemPoliciesSchema = z.object({
  sessionDurationMinutes: optionalPositiveIntSchema("Session duration"),
  passwordMinLength: requiredPositiveIntSchema("Password minimum length"),
  passwordRequireUppercase: z.boolean(),
  passwordRequireNumber: z.boolean(),
  passwordRequireSymbol: z.boolean(),
  maxFileSizeMb: optionalPositiveIntSchema("Max file size"),
  defaultTimezone: z.string().trim().min(1, "Default timezone is required.").max(100),
  defaultCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Default currency must be a 3-letter code (e.g. INR, USD)."),
  dataRetentionDefaultDays: optionalPositiveIntSchema("Data retention default"),
  auditRetentionDays: optionalPositiveIntSchema("Audit retention"),
  rateLimitApiPerMinute: requiredPositiveIntSchema("API rate limit"),
  rateLimitAiPerMinute: optionalPositiveIntSchema("AI rate limit"),
  rateLimitWebhooksPerMinute: optionalPositiveIntSchema("Webhooks rate limit"),
  rateLimitImportsPerHour: optionalPositiveIntSchema("Imports rate limit"),
  rateLimitExportsPerHour: optionalPositiveIntSchema("Exports rate limit"),
  rateLimitAutomationPerMinute: optionalPositiveIntSchema("Automation rate limit"),
  reason: reasonSchema,
});
export type UpdateSystemPoliciesInput = z.input<typeof updateSystemPoliciesSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function updateSystemPolicies(
  input: UpdateSystemPoliciesInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateSystemPoliciesSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_system_policies", {
    p_session_duration_minutes: parsed.data.sessionDurationMinutes,
    p_password_min_length: parsed.data.passwordMinLength,
    p_password_require_uppercase: parsed.data.passwordRequireUppercase,
    p_password_require_number: parsed.data.passwordRequireNumber,
    p_password_require_symbol: parsed.data.passwordRequireSymbol,
    p_max_file_size_mb: parsed.data.maxFileSizeMb,
    p_default_timezone: parsed.data.defaultTimezone,
    p_default_currency: parsed.data.defaultCurrency,
    p_data_retention_default_days: parsed.data.dataRetentionDefaultDays,
    p_audit_retention_days: parsed.data.auditRetentionDays,
    p_rate_limit_api_per_minute: parsed.data.rateLimitApiPerMinute,
    p_rate_limit_ai_per_minute: parsed.data.rateLimitAiPerMinute,
    p_rate_limit_webhooks_per_minute: parsed.data.rateLimitWebhooksPerMinute,
    p_rate_limit_imports_per_hour: parsed.data.rateLimitImportsPerHour,
    p_rate_limit_exports_per_hour: parsed.data.rateLimitExportsPerHour,
    p_rate_limit_automation_per_minute: parsed.data.rateLimitAutomationPerMinute,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
