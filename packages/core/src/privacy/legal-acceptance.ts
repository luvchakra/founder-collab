import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";

/**
 * PLATFORM-P1-09.4 (Policy Acceptance Tracking), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §31: which version of the Terms of Service and Privacy Policy the signed-in user has
 * accepted, and what they still have to. The rules (only active versions, only for
 * yourself, once) are in migration 20261010160000.
 */

export type LegalDocument = "terms" | "privacy";

export type LegalStatusRow = {
  document: LegalDocument;
  version_id: string;
  version: string;
  summary: string;
  published_at: string;
  requires_acceptance: boolean;
  accepted: boolean;
  ever_accepted: boolean;
};

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocument, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
};

/** Versions the user must accept before going on: the active one, unless they have accepted
 * it -- or it is a minor version (no re-acceptance) and they accepted an earlier one. */
export function pendingAcceptances(rows: LegalStatusRow[]): LegalStatusRow[] {
  return rows.filter((r) => !r.accepted && (r.requires_acceptance || !r.ever_accepted));
}

export async function getMyLegalStatus(): Promise<LegalStatusRow[]> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.rpc("my_legal_status");
  if (error) throw error;
  return (data as LegalStatusRow[] | null) ?? [];
}

export async function getPendingLegalAcceptances(): Promise<LegalStatusRow[]> {
  return pendingAcceptances(await getMyLegalStatus());
}

/** The signed-in user accepts these versions. Throws when one is no longer active. */
export async function acceptLegalVersions(versionIds: string[]): Promise<void> {
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("accept_legal_document_versions", { p_version_ids: versionIds });
  if (error) throw error;
}

/** Signup: the form says creating an account accepts the Terms and Privacy Policy, so a new
 * account accepts the active versions. Service role -- the user has no session yet. Only call
 * it for a genuinely new user, never for an address that already had an account. */
export async function recordSignupAcceptance(userId: string): Promise<void> {
  const { error } = await createAdminClient({ schema: "platform" }).rpc("record_signup_legal_acceptance", { p_user_id: userId });
  if (error) throw error;
}
