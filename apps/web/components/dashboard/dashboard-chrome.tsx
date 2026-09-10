"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardShell } from "@cofounderai/core/shell/dashboard-shell";
import { readPinnedBusinessIds } from "@cofounderai/core/lib/pinned-businesses";
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
  createBusinessFromWebsiteAction,
  children,
}: {
  /** Straight from module-registry -- no `licensed` field yet, since that's a
   * per-business fact this component itself resolves below via
   * licensedModuleKeysByBusiness before handing modules on to DashboardShell. */
  modules: Omit<ShellNavModule, "licensed">[];
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
  createBusinessFromWebsiteAction: (accountId: string, formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { businessId: activeBusinessId } = getActiveIdsFromPath(pathname ?? "");

  // A fresh or duplicated tab (or a plain refresh) landing on the bare, business-agnostic
  // /dashboard URL -- the account-wide Executive Dashboard -- honors a pinned business
  // instead: if one exists, this bounces straight to that business's own Dashboard, same
  // as clicking it in the switcher would. `router.replace` (not `push`) so the Executive
  // Dashboard never lands in browser history as a page the founder has to back out of.
  //
  // Mount-only ([] deps), deliberately not re-running on every `pathname` change: this
  // component stays mounted across client-side navigations within the dashboard layout
  // (only `children` swaps), so a `[pathname, ...]` dependency array fired this same
  // check every time pathname became "/dashboard" again -- including a founder
  // deliberately clicking back to the Executive Dashboard from inside the app, bouncing
  // them straight back out and making that page unreachable whenever a pin was set. A
  // real fresh load (new tab, duplicate tab, refresh) is exactly what remounts this
  // component, so checking once here already covers every case the pin is meant for.
  useEffect(() => {
    if (pathname !== "/dashboard" || businesses.length === 0) return;
    const pinnedIds = readPinnedBusinessIds();
    const pinnedBusiness = businesses.find((b) => pinnedIds.includes(b.id));
    if (pinnedBusiness) router.replace(`/dashboard/businesses/${pinnedBusiness.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered per the *active* business, not the account as a whole -- switching
  // businesses (same URL shape the business switcher already navigates to) recomputes
  // this without a full page reload, same as activeBusinessId itself already does.
  // Falls back to the first business when none is active yet (bare /dashboard, before
  // navigating into one) -- mirrors AppSidebar's own effectiveBusinessId fallback so
  // the module list and the per-business content it renders always agree.
  const effectiveBusinessId = activeBusinessId ?? businesses[0]?.id ?? null;
  // Every module is always shown -- clicking an unlicensed one routes to the business's
  // own not-licensed page (see AppSidebar's handleSelectModule) rather than the module
  // silently not existing at all, so `licensed` is carried per module instead of
  // filtering the array down like this used to.
  const annotatedModules = useMemo(() => {
    const licensedKeys = new Set(effectiveBusinessId ? licensedModuleKeysByBusiness[effectiveBusinessId] ?? [] : []);
    return modules.map((m) => ({ ...m, licensed: licensedKeys.has(m.key) }));
  }, [modules, licensedModuleKeysByBusiness, effectiveBusinessId]);

  return (
    <>
      <DashboardShell
        modules={annotatedModules}
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
          fromWebsiteAction={createBusinessFromWebsiteAction.bind(null, accountId)}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}
