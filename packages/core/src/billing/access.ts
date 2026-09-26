import { createClient } from "../db/server";

/**
 * BILL-08 / BILL-38 -- who may buy, change or cancel a business's subscription: the
 * owners and admins of the account that owns the business (§63, §83). Every billing
 * action resolves this server-side from the session; a business id arriving from a form
 * or a URL is only ever a question, never an authorization.
 *
 * Two RLS-scoped reads: the business (invisible unless the caller belongs to its
 * account) and core.user_admin_account_ids() (the accounts where the caller is owner or
 * admin). An ordinary member sees the business but is not a billing manager.
 */
export type BillingManager = {
  userId: string;
  email: string | null;
  accountId: string;
  businessId: string;
  businessName: string;
};

export class BillingAccessError extends Error {
  constructor(message = "Only account owners and admins can manage billing.") {
    super(message);
    this.name = "BillingAccessError";
  }
}

export async function getBillingManager(businessId: string): Promise<BillingManager | null> {
  const supabase = await createClient({ schema: "core" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: business, error: businessError }, { data: adminAccounts, error: adminError }] = await Promise.all([
    supabase.from("businesses").select("id, name, account_id").eq("id", businessId).maybeSingle(),
    supabase.rpc("user_admin_account_ids"),
  ]);
  if (businessError) throw businessError;
  if (adminError) throw adminError;
  if (!business) return null;

  const adminIds = new Set(((adminAccounts ?? []) as unknown[]).map((row) => (typeof row === "string" ? row : String(Object.values(row as object)[0]))));
  if (!adminIds.has(business.account_id as string)) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    accountId: business.account_id as string,
    businessId: business.id as string,
    businessName: business.name as string,
  };
}

export async function requireBillingManager(businessId: string): Promise<BillingManager> {
  const manager = await getBillingManager(businessId);
  if (!manager) throw new BillingAccessError();
  return manager;
}
