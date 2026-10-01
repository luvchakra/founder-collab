import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the signed-in user has a verified MFA factor but the current session hasn't
 * completed it yet (AAL1 session, AAL2 available). Supabase reads both levels from the
 * session JWT locally -- no extra network round trip -- so this is cheap enough to run
 * in the proxy on every protected request, which is what makes MFA actually enforced
 * rather than a step the login form merely suggests: any session that skipped the
 * challenge (a password login, an OAuth callback, a magic link) is held at /login/mfa
 * until it completes one.
 */
export async function needsMfaStepUp(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export const MFA_CHALLENGE_PATH = "/login/mfa";
