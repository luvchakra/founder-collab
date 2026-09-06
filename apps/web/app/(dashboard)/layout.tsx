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
  const alerts = deriveAccountAlerts({ entries, usageByWorkspace, prospects });

  const metadata = user.user_metadata ?? {};
  const displayName = (metadata.full_name || metadata.name || user.email || "Founder") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || undefined) as string | undefined;

  return (
    <DashboardChrome
      modules={moduleRegistry}
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
