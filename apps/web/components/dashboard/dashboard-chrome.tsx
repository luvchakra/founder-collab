"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@cofounderai/core/shell/dashboard-shell";
import type { ShellBusiness, ShellNavModule, ShellUser } from "@cofounderai/core/shell/types";
import { CreateBusinessModal } from "@cofounderai/module-discovery/components/tenancy/create-business-modal";
import { getActiveIdsFromPath } from "@cofounderai/module-discovery/lib/tenancy/active-path";
import { signOut } from "@/app/(auth)/actions";

/**
 * Client-side wrapper around the shared DashboardShell: derives the active business from
 * the URL (same /dashboard/businesses/[id]/... shape co-founder-ai's own Sidebar/
 * BusinessSelector agreed on), owns the "create business" modal's open state, and
 * threads a real sign-out action into the topbar. The layout (a Server Component)
 * fetches every other prop below and passes it straight through.
 */
export function DashboardChrome({
  modules,
  businesses,
  accountId,
  user,
  createBusinessAction,
  children,
}: {
  modules: ShellNavModule[];
  businesses: ShellBusiness[];
  accountId: string;
  user: ShellUser;
  createBusinessAction: (accountId: string, formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();
  const { businessId: activeBusinessId } = getActiveIdsFromPath(pathname ?? "");
  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) ?? businesses[0] ?? {
    id: "",
    name: "No business yet",
  };

  return (
    <>
      <DashboardShell
        modules={modules}
        business={activeBusiness}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        businessHref={(businessId) => `/dashboard/businesses/${businessId}`}
        onCreateBusiness={() => setCreating(true)}
        user={user}
        onSignOut={() => {
          void signOut();
        }}
      >
        {children}
      </DashboardShell>
      {creating ? (
        <CreateBusinessModal
          action={createBusinessAction.bind(null, accountId)}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}
