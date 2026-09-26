import { createClient } from "../db/server";

/**
 * BILL-08 / BILL-38 / RBAC-22 -- who may buy, change or cancel a business's subscription:
 * whoever holds billing.subscription.change in that business (owners always; anyone else
 * only if their role grants it -- docs/plan/15-MULTI-USER-RBAC-BACKLOG.md §33). Every
 * billing action resolves this server-side from the session; a business id arriving from a
 * form or a URL is only ever a question, never an authorization.
 */
export type BillingManager = {
  userId: string;
  email: string | null;
  accountId: string;
  businessId: string;
  businessName: string;
};

export class BillingAccessError extends Error {
  constructor(message = "You don't have permission to manage billing for this business.") {
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

  const [{ data: business, error: businessError }, { data: allowed, error: permissionError }] = await Promise.all([
    supabase.from("businesses").select("id, name, account_id").eq("id", businessId).maybeSingle(),
    supabase.rpc("has_permission", { p_business_id: businessId, p_key: "billing.subscription.change" }),
  ]);
  if (businessError) throw businessError;
  if (permissionError) throw permissionError;
  if (!business || !allowed) return null;

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
