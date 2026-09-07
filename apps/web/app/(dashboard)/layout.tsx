import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@cofounderai/core/db/server";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  getAccountUsageAndProspects,
  getAccountWorkspaceEntries,
} from "@cofounderai/module-discovery/lib/dashboard/queries";
import { deriveAccountAlerts } from "@cofounderai/module-discovery/lib/alerts/derive";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";
import { moduleRegistry } from "@cofounderai/module-registry";
import { DashboardChrome } from "@/components/dashboard/dashboard-chrome";
import { createBusinessAction } from "@/app/(dashboard)/dashboard/actions";

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
  const alerts = deriveAccountAlerts({ entries, usageByWorkspace, prospects });

  // Same blend as co-founder-ai's own dashboard layout: total spend across every
  // workspace on the account against the free-tier limit times workspace count.
  const totalCost = Object.values(usageByWorkspace).reduce((sum, u) => sum + u.totalCost, 0);
  const creditsPercent = creditsUsedPercent(
    totalCost,
    FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(entries.length, 1),
  );

  const metadata = user.user_metadata ?? {};
  const displayName = (metadata.full_name || metadata.name || user.email || "Founder") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || undefined) as string | undefined;

  return (
    <DashboardChrome
      modules={moduleRegistry}
      businesses={businesses}
      productsByBusiness={productsByBusiness}
      creditsUsedPercent={creditsPercent}
      accountId={account?.id ?? ""}
      user={{ name: displayName, email: user.email ?? "", avatarUrl }}
      alerts={alerts}
      createBusinessAction={createBusinessAction}
    >
      {children}
    </DashboardChrome>
  );
}
