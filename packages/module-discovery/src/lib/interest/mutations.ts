import { createAdminClient } from "../../db/admin";

/**
 * Records a "Show Interest" email (CoFounderAI UI & CTA Enhancement doc §2-3). Anonymous
 * submissions have no session to authorize through RLS, so this is one of the few places
 * that uses the service-role admin client directly from a mutation rather than the
 * RLS-scoped server client -- see supabase/migrations/20260906040000_interest_signups_schema.sql.
 *
 * Returns whether the email was newly recorded (false for a repeat submission of the same
 * address) so the caller can skip re-notifying the founder on an accidental double-submit
 * -- the visitor sees the same success state either way.
 */
export async function recordInterestSignup(email: string): Promise<{ isNew: boolean }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("interest_signups")
    .insert({ email })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { isNew: false }; // unique violation -- already signed up
    throw error;
  }
  return { isNew: data !== null };
}
