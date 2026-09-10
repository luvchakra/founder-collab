import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@cofounderai/core/db/server";
import { isPlatformAdminEmail } from "@cofounderai/core/rbac/platform-admin";
import type { ShellAlert } from "@cofounderai/core/shell/types";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import {
  getAccountUsageAndProspects,
  getAccountWorkspaceEntries,
} from "@cofounderai/module-discovery/lib/dashboard/queries";
import { deriveAccountAlerts } from "@cofounderai/module-discovery/lib/alerts/derive";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";
import { listLicensedModuleKeysByBusiness } from "@cofounderai/core/licensing/queries";
import { moduleRegistry } from "@cofounderai/module-registry";
import { getAlerts as getInventoryAlerts } from "@cofounderai/module-inventory/contract/index";
import { getAlerts as getFsmAlerts } from "@cofounderai/module-fsm/contract/index";
import { getAlerts as getCrmAlerts } from "@cofounderai/module-crm/contract/index";
import { getAlerts as getGstAlerts } from "@cofounderai/module-gst/contract/index";
import { DashboardChrome } from "@/components/dashboard/dashboard-chrome";
import { createBusinessAction, createBusinessFromWebsiteAction } from "@/app/(dashboard)/dashboard/actions";

const OTHER_MODULE_ALERTS: Record<"inventory" | "fsm" | "crm" | "gst", (businessId: string) => Promise<{ ok: boolean; data?: ShellAlert[] }>> = {
  inventory: getInventoryAlerts,
  fsm: getFsmAlerts,
  crm: getCrmAlerts,
  gst: getGstAlerts,
};

/**
 * Item #13 of a UX pass: "expand the notification feature... to all modules" -- the
 * bell (AlertBell) previously only ever showed discovery-derived alerts
 * (deriveAccountAlerts), even though inventory/fsm/crm/gst each have their own
 * dashboard-worthy signals (low stock, overdue invoices, open tickets, GSTIN risk).
 * Each module's own `contract/index.ts#getAlerts` (mechanism 2, ADR-10) is the correct
 * cross-module call -- MODULE_NOT_LICENSED results are silently skipped, same as
 * buildOtherModuleSummaries' own reasoning for the AI chat's "consult all modules"
 * path, not duplicated logic here.
 */
async function getOtherModuleAlerts(
  businesses: { id: string }[],
  licensedModuleKeysByBusiness: Record<string, string[]>,
): Promise<ShellAlert[]> {
  const calls: Promise<ShellAlert[]>[] = [];
  for (const business of businesses) {
    const licensed = new Set(licensedModuleKeysByBusiness[business.id] ?? []);
    for (const key of Object.keys(OTHER_MODULE_ALERTS) as (keyof typeof OTHER_MODULE_ALERTS)[]) {
      if (!licensed.has(key)) continue;
      calls.push(
        OTHER_MODULE_ALERTS[key](business.id).then((result) => (result.ok ? result.data ?? [] : [])),
      );
    }
  }
  const results = await Promise.all(calls);
  return results.flat();
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  // Independent round trips (auth revalidation vs. an RLS-scoped accounts query keyed off
  // the session cookie, not off `user`) -- run them together instead of back to back.
  const [{ data: { user } }, account] = await Promise.all([
    supabase.auth.getUser(),
    getCurrentAccount(),
  ]);
  if (!user) redirect("/login");

  // cache()-wrapped by accountId, so the /dashboard page below reuses this exact result
  // instead of re-running its own full account scan in the same request.
  const { businesses, productsByBusiness, entries } = account
    ? await getAccountWorkspaceEntries(account.id)
    : { businesses: [], productsByBusiness: {}, entries: [] };
  const { usageByWorkspace, prospects } = account
    ? await getAccountUsageAndProspects(account.id)
    : { usageByWorkspace: {}, prospects: [] };
  const discoveryAlerts = deriveAccountAlerts({ entries, usageByWorkspace, prospects });

  // CLAUDE.md's 4th licensing-enforcement layer ("UI built from module-registry
  // filtered by entitlements") -- previously missing entirely here: this used to pass
  // the raw registry straight through with no license check (docs/testing/
  // EXECUTION-2026-09-08.md finding 5). One batched query for every business on the
  // account; DashboardChrome filters by whichever business is currently active.
  const licensedModuleKeysByBusiness = await listLicensedModuleKeysByBusiness(businesses.map((b) => b.id));
  const otherModuleAlerts = await getOtherModuleAlerts(businesses, licensedModuleKeysByBusiness);
  const alerts = [...discoveryAlerts, ...otherModuleAlerts].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1,
  );

  // Same blend as co-founder-ai's own dashboard layout: total spend across every
  // workspace on the account against the free-tier limit times workspace count. The
  // free-tier cap (and this percentage) only means anything while the account is
  // running on CoFounderAI's own included credit -- once BYOK is connected, usage bills
  // to the founder's own provider account with no cap from us, so the indicator is
  // hidden rather than shown pinned at some stale/misleading number (item #16).
  const aiConnection = account ? await getAiProviderConnection(account.id) : null;
  const totalCost = Object.values(usageByWorkspace).reduce((sum, u) => sum + u.totalCost, 0);
  const creditsPercent = aiConnection
    ? undefined
    : creditsUsedPercent(totalCost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(entries.length, 1));

  const metadata = user.user_metadata ?? {};
  const displayName = (metadata.full_name || metadata.name || user.email || "Founder") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || undefined) as string | undefined;

  return (
    <DashboardChrome
      modules={moduleRegistry}
      licensedModuleKeysByBusiness={licensedModuleKeysByBusiness}
      businesses={businesses}
      productsByBusiness={productsByBusiness}
      creditsUsedPercent={creditsPercent}
      accountId={account?.id ?? ""}
      user={{
        name: displayName,
        email: user.email ?? "",
        avatarUrl,
        isPlatformAdmin: isPlatformAdminEmail(user.email),
      }}
      alerts={alerts}
      createBusinessAction={createBusinessAction}
      createBusinessFromWebsiteAction={createBusinessFromWebsiteAction}
    >
      {children}
    </DashboardChrome>
  );
}
