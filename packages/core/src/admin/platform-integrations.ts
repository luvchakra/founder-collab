import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-12.1/12.2/12.3/12.4 ("Global Integrations", docs/plan/09-PLATFORM-ADMIN-
 * PORTAL-BACKLOG.md §16). See the migration's own docstring
 * (`20260912430000_platform_integrations.sql`) for the full entity-ownership analysis and
 * why this is a genuinely new registry, not a duplicate of any existing credential table.
 *
 * `platform.integrations` is a fixed, seven-row catalog (one row per §16.1 category) --
 * there is no create/delete path, mirroring `platform.plans`' own closed-catalog stance.
 * `setIntegrationStatus()` is the ONE mutation path for `status`/`notes`, covering both
 * 12.2 ("Integration Status") and 12.3 ("Integration Kill Switch": `status = 'disabled'`)
 * -- `enabled` is a database-generated column derived from `status`, never independently
 * set, so there is no separate `setIntegrationEnabled()` export here at all (the same
 * "one real mutation path" shape `platform.modules`' own post-reconciliation
 * `setModuleStatus()` established).
 *
 * Same authorization shape as every other `platform.*` admin data-access module in this
 * backlog: the request-scoped, cookie-authenticated client (not `createAdminClient`), so
 * `platform.integrations`' own RLS (open SELECT for any authenticated user, no direct
 * write grant at all) is the authoritative enforcement layer -- `requireSuperadmin()` here
 * is defense-in-depth on the one write path, matching every sibling file.
 */

export type IntegrationKey = "ai" | "email" | "whatsapp" | "payments" | "government" | "analytics" | "storage";
export type IntegrationStatus = "connected" | "disconnected" | "error" | "needs_reauthorization" | "disabled";
export type IntegrationCredentialOwnership = "platform_owned" | "customer_owned" | "both";

const INTEGRATION_STATUSES = [
  "connected",
  "disconnected",
  "error",
  "needs_reauthorization",
  "disabled",
] as const satisfies readonly IntegrationStatus[];

export type IntegrationRegistryEntry = {
  integrationKey: IntegrationKey;
  displayName: string;
  credentialOwnership: IntegrationCredentialOwnership;
  status: IntegrationStatus;
  /** Derived from `status` (`status !== 'disabled'`) -- see this file's own docstring for
   * why there is no independent way to set this. */
  enabled: boolean;
  notes: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

type IntegrationRow = {
  integration_key: IntegrationKey;
  display_name: string;
  credential_ownership: IntegrationCredentialOwnership;
  status: IntegrationStatus;
  enabled: boolean;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export async function listIntegrationRegistry(): Promise<IntegrationRegistryEntry[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("integrations")
    .select("integration_key, display_name, credential_ownership, status, enabled, notes, updated_at, updated_by")
    .order("integration_key");
  if (error) throw error;

  return (data as IntegrationRow[]).map((row) => ({
    integrationKey: row.integration_key,
    displayName: row.display_name,
    credentialOwnership: row.credential_ownership,
    status: row.status,
    enabled: row.enabled,
    notes: row.notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

const integrationKeySchema = z.string().trim().min(1);

const setIntegrationStatusSchema = z.object({
  integrationKey: integrationKeySchema,
  status: z.enum(INTEGRATION_STATUSES),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .transform((v) => (v === "" ? null : v)),
  reason: z.string().trim().min(1, "A reason is required.").max(500, "Reason must be 500 characters or fewer."),
});

export type SetIntegrationStatusInput = {
  integrationKey: string;
  status: IntegrationStatus;
  notes: string;
  reason: string;
};

/** PLATFORM-P0-12.2/12.3 -- the ONE mutation path for `platform.integrations.status`/
 * `notes`, including the emergency kill-switch transition into/out of `disabled`. Calls
 * `platform.set_integration_status()` (the atomic, SECURITY DEFINER RPC that changes both
 * fields AND writes `platform.integration_status_events` together) rather than a plain
 * `.update()`, so a reason is structurally required for every transition, not merely
 * validated client-side -- the same bar `platform.modules`'s own kill switch/status set.
 * `requireSuperadmin()` here is defense-in-depth on top of the RPC's own internal
 * `platform.is_superadmin()` check. */
export async function setIntegrationStatus(
  input: SetIntegrationStatusInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = setIntegrationStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_integration_status", {
    p_integration_key: parsed.data.integrationKey,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
