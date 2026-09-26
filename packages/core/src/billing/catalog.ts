import { createAdminClient } from "../db/admin";
import type { ModuleKey } from "../licensing/types";
import type { BillingEnvironment, BillingInterval, BillingProviderKey } from "./subscription-types";

/**
 * BILL-07 -- the plan catalogue as billing sees it (§16, §17): platform.plans stays the one
 * catalogue, platform.plan_modules decides which modules a plan licenses, and
 * platform.plan_prices maps a plan to the provider price that bills it. Prices are
 * created at the provider by the admin and recorded here -- never invented at checkout.
 *
 * Read with the service role because the webhook path has no signed-in user; every
 * caller on a user path has already authorized the business it is acting for.
 */

export type CatalogPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  /** The catalogue's list price. 0 marks the free plan (§12), which never needs a provider. */
  price: number;
  currency: string;
  billingInterval: string;
  status: string;
  displayOrder: number;
  marketingVisible: boolean;
};

export type PlanPrice = {
  id: string;
  planId: string;
  provider: BillingProviderKey;
  environment: BillingEnvironment;
  currency: string;
  billingInterval: BillingInterval;
  amount: number;
  providerProductId: string | null;
  providerPriceId: string;
  active: boolean;
};

type PlanRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number | string;
  currency: string;
  billing_interval: string;
  status: string;
  display_order: number;
  marketing_visible: boolean;
};

type PriceRow = {
  id: string;
  plan_id: string;
  provider: BillingProviderKey;
  environment: BillingEnvironment;
  currency: string;
  billing_interval: BillingInterval;
  amount: number | string;
  provider_product_id: string | null;
  provider_price_id: string;
  active: boolean;
};

const platformAdmin = () => createAdminClient({ schema: "platform" });

export function toPlan(row: PlanRow): CatalogPlan {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    billingInterval: row.billing_interval,
    status: row.status,
    displayOrder: row.display_order,
    marketingVisible: row.marketing_visible,
  };
}

export function toPlanPrice(row: PriceRow): PlanPrice {
  return {
    id: row.id,
    planId: row.plan_id,
    provider: row.provider,
    environment: row.environment,
    currency: row.currency,
    billingInterval: row.billing_interval,
    amount: Number(row.amount),
    providerProductId: row.provider_product_id,
    providerPriceId: row.provider_price_id,
    active: row.active,
  };
}

export const isFreePlan = (plan: Pick<CatalogPlan, "price">) => plan.price === 0;

const PLAN_COLUMNS = "id, key, name, description, price, currency, billing_interval, status, display_order, marketing_visible";
const PRICE_COLUMNS = "id, plan_id, provider, environment, currency, billing_interval, amount, provider_product_id, provider_price_id, active";

export async function getPlan(planId: string): Promise<CatalogPlan | null> {
  const { data, error } = await platformAdmin().from("plans").select(PLAN_COLUMNS).eq("id", planId).maybeSingle();
  if (error) throw error;
  return data ? toPlan(data as PlanRow) : null;
}

export async function getPlanByKey(key: string): Promise<CatalogPlan | null> {
  const { data, error } = await platformAdmin().from("plans").select(PLAN_COLUMNS).eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? toPlan(data as PlanRow) : null;
}

/** Plans a customer can pick: active and shown in marketing, in display order. */
export async function listPurchasablePlans(): Promise<CatalogPlan[]> {
  const { data, error } = await platformAdmin()
    .from("plans")
    .select(PLAN_COLUMNS)
    .eq("status", "active")
    .eq("marketing_visible", true)
    .order("display_order");
  if (error) throw error;
  return ((data ?? []) as PlanRow[]).map(toPlan);
}

export async function listActivePlanPrices(filter: { planId?: string; environment?: BillingEnvironment } = {}): Promise<PlanPrice[]> {
  let query = platformAdmin().from("plan_prices").select(PRICE_COLUMNS).eq("active", true);
  if (filter.planId) query = query.eq("plan_id", filter.planId);
  if (filter.environment) query = query.eq("environment", filter.environment);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as PriceRow[]).map(toPlanPrice);
}

/** The plan a provider price bills -- how a webhook learns which plan a subscription is
 * really on, instead of trusting metadata a checkout attached. Inactive prices still
 * resolve: a subscription created before the admin retired a price keeps its plan. */
export async function findPlanPriceByProviderId(
  provider: BillingProviderKey,
  environment: BillingEnvironment,
  providerPriceId: string,
): Promise<PlanPrice | null> {
  const { data, error } = await platformAdmin()
    .from("plan_prices")
    .select(PRICE_COLUMNS)
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("provider_price_id", providerPriceId)
    .maybeSingle();
  if (error) throw error;
  return data ? toPlanPrice(data as PriceRow) : null;
}

/** BILL-17 `resolvePlanEntitlements()` (§47): the modules a plan licenses. */
export async function resolvePlanEntitlements(planId: string): Promise<ModuleKey[]> {
  const { data, error } = await platformAdmin().from("plan_modules").select("module_key").eq("plan_id", planId).eq("enabled", true);
  if (error) throw error;
  return ((data ?? []) as { module_key: ModuleKey }[]).map((r) => r.module_key).sort();
}
