import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { activateLicense } from "../licensing/lifecycle";
import type { ModuleKey } from "../licensing/types";
import type { OrgEnvironment } from "../lib/org-address";
import { isCheckoutReady, loadProviderConfigs } from "./provider-config";

/**
 * PLATFORM-P1-10.9 (Paid Environments), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40.
 * An owner buys an environment for their organization: the order is written first, then the
 * environment is set up, then the order is marked fulfilled. A failure marks the order failed
 * and says what went wrong -- never success for a failure.
 *
 * Owner decision 2026-10-13: test payments (no money moves, payment_mode 'test') until a
 * payment provider is ready for checkout. Once one is, test payments stop and this refuses
 * until real checkout for environments is built.
 */

export type OrderResult = { ok: true; message: string; slug: string | null } | { ok: false; error: string };

/** Test payments are allowed only while no provider can take a real checkout. */
export function testPaymentsAllowed(readyProviders: number, env: Record<string, string | undefined> = process.env): boolean {
  if (env.BILLING_TEST_PAYMENTS?.trim().toLowerCase() === "false") return false;
  return readyProviders === 0;
}

type Deps = {
  isOwner: (organizationId: string) => Promise<boolean>;
  userId: () => Promise<string | null>;
  readyProviders: () => Promise<number>;
  db: ReturnType<typeof createAdminClient>;
  core: ReturnType<typeof createAdminClient>;
  activate: (businessId: string, moduleKey: ModuleKey) => Promise<void>;
};

async function defaultDeps(): Promise<Deps> {
  const userCore = await createClient({ schema: "core" });
  return {
    isOwner: async (id) => {
      const { data, error } = await userCore.rpc("is_organization_owner", { p_business: id });
      return !error && data === true;
    },
    userId: async () => (await (await createClient()).auth.getUser()).data.user?.id ?? null,
    readyProviders: async () => (await loadProviderConfigs()).filter(isCheckoutReady).length,
    db: createAdminClient({ schema: "platform" }),
    core: createAdminClient({ schema: "core" }),
    activate: activateLicense,
  };
}

export async function orderEnvironment(organizationId: string, environment: OrgEnvironment, deps?: Deps): Promise<OrderResult> {
  const d = deps ?? (await defaultDeps());
  if (!["production", "development", "test", "staging"].includes(environment)) return { ok: false, error: "Choose production, development, test or staging." };
  const userId = await d.userId();
  if (!userId) return { ok: false, error: "Sign in again." };
  if (!(await d.isOwner(organizationId))) return { ok: false, error: "Only the organization's owner can add environments." };
  if (!testPaymentsAllowed(await d.readyProviders())) {
    return { ok: false, error: "Adding environments isn't available yet. Contact support." };
  }

  // 1. The order, first. One open order per organization and environment.
  const { data: order, error: orderError } = await d.db
    .from("environment_orders")
    .insert({ organization_id: organizationId, environment, payment_mode: "test", created_by: userId })
    .select("id")
    .single();
  if (orderError) {
    return { ok: false, error: orderError.code === "23505" ? "That environment is already being set up." : "The order couldn't be recorded. Nothing was set up." };
  }
  const fail = async (message: string): Promise<OrderResult> => {
    await d.db.from("environment_orders").update({ status: "failed", failure: message.slice(0, 1000) }).eq("id", order.id);
    return { ok: false, error: message };
  };

  // 2. The environment. The database checks the organization is active and the address free.
  const { data: envId, error: envError } = await d.db.rpc("create_business_environment", { p_actor: userId, p_parent: organizationId, p_environment: environment });
  if (envError) return fail(envError.message);

  // 3. The organization's modules.
  const { data: licenses, error: licenseError } = await d.core.from("licenses").select("module_key").eq("business_id", organizationId).eq("status", "active");
  if (licenseError) return fail("The environment was created, but its modules couldn't be read to switch them on. Contact support.");
  const failed: string[] = [];
  for (const l of licenses ?? []) {
    try {
      await d.activate(envId as string, l.module_key as ModuleKey);
    } catch {
      failed.push(l.module_key as string);
    }
  }
  if (failed.length) return fail(`The environment was created, but these modules couldn't be switched on: ${failed.join(", ")}. Contact support.`);

  // 4. Done.
  const { error: doneError } = await d.db
    .from("environment_orders")
    .update({ status: "fulfilled", environment_business_id: envId, fulfilled_at: new Date().toISOString() })
    .eq("id", order.id);
  const { data: settings } = await d.core.from("business_settings").select("slug").eq("business_id", envId as string).maybeSingle();
  const slug = (settings?.slug as string | undefined) ?? null;
  if (doneError) return { ok: true, message: "The environment is ready, but its order couldn't be marked complete. Support has the record.", slug };
  return { ok: true, message: "Test payment recorded (no money charged). The environment is ready.", slug };
}
