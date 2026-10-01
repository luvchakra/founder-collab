import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { PRIVACY_NOTICE_VERSION, type ConsentPurpose } from "./notice";

type Source = "signup" | "settings" | "reconsent";

/** Records consent for the signed-in user (RLS: user_id must be auth.uid()). */
export async function recordConsent(userId: string, purpose: ConsentPurpose, granted: boolean, source: Source): Promise<void> {
  const supabase = await createClient({ schema: "core" });
  const { error } = await supabase.from("consent_records").insert({
    user_id: userId,
    purpose,
    granted,
    notice_version: PRIVACY_NOTICE_VERSION,
    source,
  });
  if (error) throw error;
}

/** Signup only: with email confirmation on, signUp() returns the new user's id but no
 * session yet, so the consent captured on the form is recorded with the service role,
 * against the id Supabase itself just returned (never a client-supplied one). */
export async function recordSignupConsents(userId: string, marketing: boolean): Promise<void> {
  const { error } = await createAdminClient({ schema: "core" })
    .from("consent_records")
    .insert([
      { user_id: userId, purpose: "terms_privacy", granted: true, notice_version: PRIVACY_NOTICE_VERSION, source: "signup" },
      { user_id: userId, purpose: "marketing_communications", granted: marketing, notice_version: PRIVACY_NOTICE_VERSION, source: "signup" },
    ]);
  if (error) throw error;
}

export async function getCurrentConsents(
  userId: string,
): Promise<Record<ConsentPurpose, { granted: boolean; notice_version: string; created_at: string } | undefined>> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("current_consents")
    .select("purpose, granted, notice_version, created_at")
    .eq("user_id", userId);
  if (error) throw error;
  const result: Record<string, { granted: boolean; notice_version: string; created_at: string }> = {};
  for (const row of data ?? []) result[row.purpose as string] = row;
  return result as Record<ConsentPurpose, { granted: boolean; notice_version: string; created_at: string } | undefined>;
}

/** True when the user has accepted the *current* notice version. */
export async function hasAcceptedCurrentNotice(userId: string): Promise<boolean> {
  const consents = await getCurrentConsents(userId);
  const terms = consents.terms_privacy;
  return Boolean(terms?.granted && terms.notice_version === PRIVACY_NOTICE_VERSION);
}
