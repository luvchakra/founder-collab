import { createAdminClient } from "../db/admin";
import { PRIVACY_NOTICE_VERSION } from "./notice";

/**
 * Everything the platform holds about one user as a person (GDPR Art. 15 access + Art.
 * 20 portability; DPDP s.11 summary of personal data), as structured JSON. Business
 * records the user created on a business's behalf (invoices, prospects) belong to that
 * business as controller and are exported by the business, not here -- only the user's
 * own identity, memberships, consents, requests and the actions attributed to them.
 *
 * Service role, because it spans every account/business the user belongs to; called
 * only for the signed-in user's own id.
 */
export async function buildPersonalDataExport(userId: string): Promise<Record<string, unknown>> {
  const admin = createAdminClient({ schema: "core" });
  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const user = authUser.user;

  const query = async (table: string, column: string, select = "*", limit?: number) => {
    let q = admin.from(table).select(select).eq(column, userId);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  };

  const [profile, accountMemberships, businessMemberships, consents, requests, actions, employment] = await Promise.all([
    query("user_profiles", "id"),
    query("account_members", "user_id", "account_id, role, created_at, accounts(name)"),
    query("business_members", "user_id", "business_id, role, created_at, businesses(name)"),
    query("consent_records", "user_id", "purpose, granted, notice_version, source, created_at"),
    query("data_subject_requests", "requester_user_id", "request_type, details, status, response, due_at, completed_at, created_at"),
    query("audit_log", "actor_id", "business_id, action, entity_type, entity_id, created_at", 5000),
    query("employees", "user_id", "business_id, job_title, employment_type, is_active, hire_date, created_at"),
  ]);

  return {
    generated_at: new Date().toISOString(),
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    account: {
      id: user.id,
      email: user.email,
      phone: user.phone || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      sign_in_providers: user.app_metadata?.providers ?? [],
      profile_metadata: user.user_metadata ?? {},
      mfa_factors: (user.factors ?? []).map((f) => ({ type: f.factor_type, status: f.status, created_at: f.created_at })),
    },
    profile: profile[0] ?? null,
    account_memberships: accountMemberships,
    business_memberships: businessMemberships,
    employment_records: employment,
    consents,
    privacy_requests: requests,
    actions_attributed_to_you: actions,
  };
}
