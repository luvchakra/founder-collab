"use client";

import { useMemo, useState } from "react";
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
  licensedModuleKeysByBusiness,
  businesses,
  productsByBusiness,
  creditsUsedPercent,
  accountId,
  user,
  alerts,
  createBusinessAction,
  children,
}: {
  modules: ShellNavModule[];
  /** Active-or-grace module keys per business (core.licenses, C-3), from
   * listLicensedModuleKeysByBusiness() -- CLAUDE.md's 4th licensing-enforcement layer
   * ("UI built from module-registry filtered by entitlements"). A business missing from
   * this map has no licensed modules at all, same as an empty array. */
  licensedModuleKeysByBusiness: Record<string, string[]>;
  businesses: ShellBusiness[];
  productsByBusiness?: Record<string, ShellProduct[]>;
  creditsUsedPercent?: number;
  accountId: string;
  user: ShellUser;
  alerts?: ShellAlert[];
  createBusinessAction: (accountId: string, formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();
  const { businessId: activeBusinessId } = getActiveIdsFromPath(pathname ?? "");

  // Filtered per the *active* business, not the account as a whole -- switching
  // businesses (same URL shape the business switcher already navigates to) recomputes
  // this without a full page reload, same as activeBusinessId itself already does.
  // Falls back to the first business when none is active yet (bare /dashboard, before
  // navigating into one) -- mirrors AppSidebar's own effectiveBusinessId fallback so
  // the module list and the per-business content it renders always agree.
  const effectiveBusinessId = activeBusinessId ?? businesses[0]?.id ?? null;
  const licensedModules = useMemo(() => {
    const licensedKeys = new Set(effectiveBusinessId ? licensedModuleKeysByBusiness[effectiveBusinessId] ?? [] : []);
    return modules.filter((m) => licensedKeys.has(m.key));
  }, [modules, licensedModuleKeysByBusiness, effectiveBusinessId]);

  return (
    <>
      <DashboardShell
        modules={licensedModules}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        businessHref={(businessId) => `/dashboard/businesses/${businessId}`}
        productsByBusiness={productsByBusiness}
        creditsUsedPercent={creditsUsedPercent}
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
