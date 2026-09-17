import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@cofounderai/core/db/server";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  getAccountUsageAndProspects,
  getAccountWorkspaceEntries,
} from "@cofounderai/module-discovery/lib/dashboard/queries";
import { deriveAccountAlerts } from "@cofounderai/module-discovery/lib/alerts/derive";
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
  const { businesses, entries } = account
    ? await getAccountWorkspaceEntries(account.id)
    : { businesses: [], entries: [] };
  const { usageByWorkspace, prospects } = account
    ? await getAccountUsageAndProspects(account.id)
    : { usageByWorkspace: {}, prospects: [] };

  // Licensing enforcement layer 4 (00-MASTER-PLAN.md): navigation is built from
  // module-registry filtered by entitlements. Loaded here for every business on the
  // account in one query -- DashboardChrome picks the active one out of the URL, so
  // switching business doesn't need a round trip. Mirrors the proxy.ts guard (layer 2) in
  // counting 'grace' as licensed: ADR-9's grace window keeps read access alive.
  const licensedByBusiness: Record<string, string[]> = {};
  if (businesses.length > 0) {
    const coreClient = await createClient({ schema: "core" });
    const { data: licenses } = await coreClient
      .from("licenses")
      .select("business_id, module_key")
      .in("business_id", businesses.map((business) => business.id))
      .in("status", ["active", "grace"]);
    for (const license of licenses ?? []) {
      (licensedByBusiness[license.business_id] ??= []).push(license.module_key);
    }
  }
  const alerts = deriveAccountAlerts({ entries, usageByWorkspace, prospects });

  const metadata = user.user_metadata ?? {};
  const displayName = (metadata.full_name || metadata.name || user.email || "Founder") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || undefined) as string | undefined;

  return (
    <DashboardChrome
      modules={moduleRegistry}
      licensedByBusiness={licensedByBusiness}
      businesses={businesses}
      accountId={account?.id ?? ""}
      user={{ name: displayName, email: user.email ?? "", avatarUrl }}
      alerts={alerts}
      createBusinessAction={createBusinessAction}
    >
      {children}
    </DashboardChrome>
  );
}
