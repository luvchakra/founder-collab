"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@cofounderai/core/db/server";

const SETTINGS_PATH = "/dashboard/settings/security";

export type EnrollmentState =
  | { error: string }
  | { factorId: string; qrCode: string; secret: string }
  | { done: true }
  | null;

/** Starts TOTP enrollment. Any earlier enrollment the user abandoned (an unverified
 * factor) is removed first -- Supabase refuses a second unverified factor, which would
 * otherwise leave the user stuck. */
export async function startTotpEnrollmentAction(): Promise<EnrollmentState> {
  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: listError.message };
  for (const factor of factors.all.filter((f) => f.status === "unverified")) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) return { error: error.message };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTotpEnrollmentAction(
  _prevState: EnrollmentState,
  formData: FormData,
): Promise<EnrollmentState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!factorId || !/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code didn't match -- try again with the current code." };
  revalidatePath(SETTINGS_PATH);
  return { done: true };
}

/** Supabase requires an AAL2 session to remove a verified factor -- which this session
 * always is by the time it reaches a dashboard page (the proxy holds AAL1 sessions at
 * the challenge). */
export async function removeMfaFactorAction(factorId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  revalidatePath(SETTINGS_PATH);
}
