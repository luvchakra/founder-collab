import { createAdminClient } from "../db/admin";

/** Upper bound on audit entries included, newest first -- enough for any real person's
 * history, and a cap on the size of one download. */
export const EXPORT_AUDIT_LIMIT = 5000;

/**
 * PRIV-2: everything the platform holds about one signed-in user *as a person*, as
 * structured JSON -- DPDP Act s.11 (a summary of personal data and how it's processed),
 * GDPR Art. 15 (access) and Art. 20 (portability).
 *
 * Covers the platform's own data about them: their sign-in identity, profile,
 * memberships, employee records that name them, and the actions the audit log
 * attributes to them. Records they created *for a business* (invoices, prospects,
 * contacts) belong to that business as data fiduciary/controller and are exported by the
 * business through each module's own export -- the privacy policy says so.
 *
 * Service role, because it spans every account and business the user belongs to. Only
 * ever called with the signed-in user's own id (the route resolves it from the session),
 * and every query is filtered on that id.
 */
export async function buildPersonalDataExport(userId: string): Promise<Record<string, unknown>> {
  const admin = createAdminClient({ schema: "core" });
  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const user = authUser.user;
  if (!user || user.id !== userId) throw new Error("User not found.");

  const rows = async (query: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  };

  // PLATFORM-P1-09.4: the user's acceptances of the Terms and Privacy Policy (platform schema).
  const platform = createAdminClient({ schema: "platform" });
  const [profile, accountMemberships, businessMemberships, employment, actions, policyAcceptances] = await Promise.all([
    rows(admin.from("user_profiles").select("full_name, email, phone, avatar_url, created_at, updated_at").eq("id", userId)),
    rows(admin.from("account_members").select("account_id, role, created_at, accounts(name)").eq("user_id", userId)),
    rows(admin.from("business_members").select("*, businesses(name)").eq("user_id", userId)),
    rows(
      admin
        .from("employees")
        .select("business_id, job_title, employment_type, is_active, hire_date, created_at, businesses(name)")
        .eq("user_id", userId),
    ),
    rows(
      admin
        .from("audit_log")
        .select("business_id, action, entity_type, entity_id, created_at")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(EXPORT_AUDIT_LIMIT),
    ),
    rows(
      platform
        .from("policy_acceptances")
        .select("method, accepted_at, legal_document_versions(document, version)")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false }),
    ),
  ]);

  return {
    generated_at: new Date().toISOString(),
    about: {
      what_this_is:
        "The personal data this platform holds about you as a user. Records you created for a business (its customers, invoices, prospects and so on) belong to that business and are exported from within each module.",
      storage_location: "Supabase, ap-south-1 (Mumbai, India)",
      audit_entries_included: `up to the ${EXPORT_AUDIT_LIMIT} most recent`,
    },
    account: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      sign_in_providers: (user.app_metadata?.providers as string[] | undefined) ?? [],
      profile_details: user.user_metadata ?? {},
      mfa_factors: (user.factors ?? []).map((f) => ({ type: f.factor_type, status: f.status, created_at: f.created_at })),
    },
    profile: profile[0] ?? null,
    account_memberships: accountMemberships,
    business_memberships: businessMemberships,
    employee_records: employment,
    actions_attributed_to_you: actions,
    policy_acceptances: policyAcceptances,
  };
}
