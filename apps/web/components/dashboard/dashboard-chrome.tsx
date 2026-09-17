"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@cofounderai/core/shell/dashboard-shell";
import { buildNavModules, licensedKeysFor } from "@cofounderai/core/licensing/nav-modules";
import type { NavigableModule } from "@cofounderai/core/licensing/nav-modules";
import type { ShellAlert, ShellBusiness, ShellUser } from "@cofounderai/core/shell/types";
import { CreateBusinessModal } from "@cofounderai/module-discovery/components/tenancy/create-business-modal";
import { AiChatWidget } from "@cofounderai/module-discovery/components/chat/ai-chat-widget";
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
  licensedByBusiness = {},
  businesses,
  accountId,
  user,
  alerts,
  createBusinessAction,
  children,
}: {
  modules: NavigableModule[];
  /** businessId -> module keys that business has licensed (active or in grace). */
  licensedByBusiness?: Record<string, string[]>;
  businesses: ShellBusiness[];
  accountId: string;
  user: ShellUser;
  alerts?: ShellAlert[];
  createBusinessAction: (accountId: string, formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();
  const { businessId: activeBusinessId } = getActiveIdsFromPath(pathname ?? "");
  // null (no business selected yet) links every module normally; an active business with
  // no licences upsells all of them. See licensing/nav-modules.ts.
  const navModules = buildNavModules(
    modules,
    licensedKeysFor(licensedByBusiness, activeBusinessId),
  );

  return (
    <>
      <DashboardShell
        modules={navModules}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        businessHref={(businessId) => `/dashboard/businesses/${businessId}`}
        onCreateBusiness={() => setCreating(true)}
        user={user}
        alerts={alerts}
        chatSlot={<AiChatWidget />}
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
