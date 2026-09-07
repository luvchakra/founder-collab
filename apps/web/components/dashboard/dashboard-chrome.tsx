"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@cofounderai/core/shell/dashboard-shell";
import type {
  ShellAlert,
  ShellBusiness,
  ShellNavModule,
  ShellProduct,
  ShellUser,
} from "@cofounderai/core/shell/types";
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
  businesses,
  productsByBusiness,
  accountId,
  user,
  alerts,
  createBusinessAction,
  children,
}: {
  modules: ShellNavModule[];
  businesses: ShellBusiness[];
  productsByBusiness?: Record<string, ShellProduct[]>;
  accountId: string;
  user: ShellUser;
  alerts?: ShellAlert[];
  createBusinessAction: (accountId: string, formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();
  const { businessId: activeBusinessId } = getActiveIdsFromPath(pathname ?? "");

  return (
    <>
      <DashboardShell
        modules={modules}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        businessHref={(businessId) => `/dashboard/businesses/${businessId}`}
        productsByBusiness={productsByBusiness}
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
