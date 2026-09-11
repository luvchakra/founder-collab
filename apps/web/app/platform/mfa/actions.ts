"use server";

import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";

export type MfaVerifyState = { error: string } | null;

/**
 * PLATFORM-P0-18.1: the verify half of the enroll/verify TOTP flow, mirroring
 * `apps/web/app/(auth)/actions.ts`'s server-action/`useActionState` convention (a
 * `(prevState, formData) => state | null` action, `redirect()` on success, an `{ error }`
 * object otherwise) rather than inventing a new form pattern for this one page.
 *
 * Handles both cases `mfa/page.tsx` can present this form for: a freshly enrolled,
 * still-unverified factor (first-time setup) and an already-verified factor whose
 * session simply hasn't been challenged yet (returning superadmin, still at AAL1) --
 * `challengeAndVerify` is the right single call for both, since it creates the challenge
 * and verifies the code in one round trip.
 */
export async function verifyMfaCode(
  _prevState: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!factorId) {
    return { error: "Missing MFA factor -- refresh the page and try again." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: error.message };
  }

  redirect("/platform");
}
