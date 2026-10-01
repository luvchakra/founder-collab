import { createAdminClient } from "../db/admin";
import { cancelModuleSubscription } from "../billing/subscriptions";
import { emailHash } from "./suppression";

export type AccountErasureResult =
  | { ok: true; retainedBusinesses: string[] }
  | { ok: false; reason: string };

/**
 * Self-service account deletion (GDPR Art. 17; DPDP s.12(3)). Removes the person:
 * their auth identity (cascading memberships, profile, consents), avatar files, and any
 * account where they were the only member together with its businesses.
 *
 * Live module subscriptions in those accounts are cancelled at the provider first, so a
 * deleted user is never charged again.
 *
 * Two deliberate limits:
 * - An account other people still use isn't orphaned: if the user is its only
 *   owner/admin while other members remain, erasure stops and asks them to hand over
 *   ownership first (deleting would leave the others locked out of management).
 * - A business holding numbered/posted tax documents can't be deleted (financial
 *   controls; GST record retention -- CGST Act s.36, 8 years). Such a business is left
 *   with no members -- inaccessible to anyone through the app -- and its records are
 *   kept only for the legal retention period (GDPR Art. 17(3)(b); DPDP s.8(7)).
 *   Its name is returned so the user is told exactly what was retained and why.
 *
 * A completed erasure request is recorded first (with only the email hash) as evidence
 * the request was honoured. Service role; call only for the signed-in user's own id.
 */
export async function eraseOwnAccount(userId: string, email: string | null): Promise<AccountErasureResult> {
  const admin = createAdminClient({ schema: "core" });

  const { data: memberships, error: membershipError } = await admin
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", userId);
  if (membershipError) throw membershipError;

  const soleMemberAccounts: string[] = [];
  for (const membership of memberships ?? []) {
    const { data: others, error } = await admin
      .from("account_members")
      .select("role")
      .eq("account_id", membership.account_id)
      .neq("user_id", userId);
    if (error) throw error;
    if (!others || others.length === 0) {
      soleMemberAccounts.push(membership.account_id as string);
    } else if (
      ["owner", "admin"].includes(membership.role as string) &&
      !others.some((o) => o.role === "owner" || o.role === "admin")
    ) {
      return {
        ok: false,
        reason: "You're the only owner/admin of an account other people use. Make someone else an owner first, then delete your account.",
      };
    }
  }

  // Stop billing before anything is deleted: removing a business cascades its
  // core.subscriptions rows, but the subscription itself lives at Stripe/Razorpay and
  // would keep charging a deleted user. If a cancellation fails, nothing is deleted yet.
  if (soleMemberAccounts.length > 0) {
    const { data: liveSubs, error: subsError } = await admin
      .from("subscriptions")
      .select("business_id, module_key")
      .in("account_id", soleMemberAccounts)
      .in("status", ["incomplete", "active", "past_due"]);
    if (subsError) throw subsError;
    const seen = new Set<string>();
    for (const sub of liveSubs ?? []) {
      const key = `${sub.business_id}:${sub.module_key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await cancelModuleSubscription(sub.business_id as string, sub.module_key as string);
      } catch {
        return {
          ok: false,
          reason: "We couldn't cancel an active subscription, so nothing was deleted. Cancel it from Billing, then try again.",
        };
      }
    }
  }

  const retainedBusinesses: string[] = [];
  for (const accountId of soleMemberAccounts) {
    const { data: businesses, error } = await admin.from("businesses").select("id, name").eq("account_id", accountId);
    if (error) throw error;
    let retainedInAccount = 0;
    for (const business of businesses ?? []) {
      const { error: deleteError } = await admin.from("businesses").delete().eq("id", business.id);
      if (deleteError) {
        retainedBusinesses.push(business.name as string);
        retainedInAccount++;
      }
    }
    if (retainedInAccount === 0) {
      const { error: accountError } = await admin.from("accounts").delete().eq("id", accountId);
      if (accountError) throw accountError;
    }
  }

  const { data: avatars } = await admin.storage.from("avatars").list(userId);
  if (avatars?.length) {
    await admin.storage.from("avatars").remove(avatars.map((file) => `${userId}/${file.name}`));
  }

  const hash = email ? emailHash(email) : null;
  const { error: requestError } = await admin.from("data_subject_requests").insert({
    requester_user_id: userId,
    subject_email_hash: hash,
    request_type: "erasure",
    details: "Self-service account deletion",
    status: "completed",
    completed_at: new Date().toISOString(),
    response: retainedBusinesses.length
      ? `Account deleted. Retained under tax-law record retention, with all access closed: ${retainedBusinesses.join(", ")}.`
      : "Account and all associated data deleted.",
  });
  if (requestError) throw requestError;

  if (hash) {
    // Platform-wide do-not-contact: a deleted user gets no further platform email.
    const { error: suppressionError } = await admin
      .from("communication_suppressions")
      .insert({ business_id: null, email_hash: hash, reason: "erasure" });
    if (suppressionError && suppressionError.code !== "23505") throw suppressionError;
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) throw deleteUserError;
  return { ok: true, retainedBusinesses };
}
