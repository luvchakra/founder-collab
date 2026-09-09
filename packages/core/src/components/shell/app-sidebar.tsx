"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSidebar } from "./sidebar-context";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { ModuleSelector } from "./module-selector";
import { ModuleIcon } from "./module-icon";
import type { ShellBusiness, ShellNavGroup, ShellNavModule, ShellProduct, ShellUser } from "./types";

const MODULE_STORAGE_KEY = "cofounderai:selected-module";

/**
 * Infers the active module from the URL for the routes that unambiguously indicate one
 * (/inventory/... and /gst/...) -- everything else (bare business page, discovery's own
 * /products/... routes, non-module pages like settings) returns null so the caller falls
 * back to the last explicitly selected module. Written locally rather than reusing
 * module-discovery's `getActiveIdsFromPath` since `packages/core` cannot depend on any
 * module (lint:boundaries).
 */
function inferModuleFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/\/businesses\/[^/]+(?:\/([^/]+))?/);
  if (!match) return null;
  const section = match[1];
  if (section === "inventory") return "inventory";
  if (section === "gst") return "gst";
  if (!section || section === "products") return "discovery";
  return null;
}

function readStoredModule(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(MODULE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredModule(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODULE_STORAGE_KEY, key);
  } catch {
    // Storage unavailable (private browsing, quota) -- selection just won't persist.
  }
}

function CreateBusinessPrompt({ onCreateBusiness }: { onCreateBusiness?: () => void }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <p className="text-sm text-muted-foreground">No businesses yet.</p>
      <button
        type="button"
        onClick={onCreateBusiness}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Create a business
      </button>
    </div>
  );
}

/** The selected module's content -- what the drawer's middle, scrollable area shows.
 * Discovery lists the effective business's products (real routes); Inventory and GST
 * each show their own nav tree (routes that 404 until built, by explicit instruction);
 * every other module is a flat "not available yet" placeholder, since nothing else has
 * any real nav to show. */
/** Shared styling for a drawer nav row -- an accent-tinted background, a left accent
 * bar, and a bolder foreground color when it's the current page, so the founder can
 * always tell what they're looking at without having to read every label. */
function navItemClassName(isActive: boolean, extra?: string) {
  return cn(
    "flex items-center gap-2.5 truncate rounded-md border-l-2 px-2 py-1.5 text-sm transition-colors",
    isActive
      ? "border-primary bg-sidebar-accent font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
    extra,
  );
}

function ModuleContent({
  moduleKey,
  pathname,
  businesses,
  effectiveBusinessId,
  businessHref,
  productsByBusiness,
  onCreateBusiness,
  onNavigate,
  routePrefix,
  navGroups,
}: {
  moduleKey: string;
  pathname: string | null;
  businesses: ShellBusiness[];
  effectiveBusinessId: string | null;
  businessHref: (businessId: string) => string;
  productsByBusiness?: Record<string, ShellProduct[]>;
  onCreateBusiness?: () => void;
  onNavigate: () => void;
  /** This module's own route prefix (e.g. "/fsm") -- unused for discovery, whose
   * content below is its live product list, not a nav tree. */
  routePrefix?: string;
  /** This module's own nav groups, straight from its manifest (module-registry, via
   * ShellNavModule) -- rendered generically for every module except discovery. */
  navGroups?: ShellNavGroup[];
}) {
  if (moduleKey === "discovery") {
    if (businesses.length === 0) return <CreateBusinessPrompt onCreateBusiness={onCreateBusiness} />;

    const products = effectiveBusinessId ? (productsByBusiness?.[effectiveBusinessId] ?? []) : [];
    const isDashboardActive = pathname === "/dashboard";
    return (
      <div className="flex flex-col gap-0.5 px-2 py-2">
        <a
          href="/dashboard"
          onClick={onNavigate}
          aria-current={isDashboardActive ? "page" : undefined}
          className={navItemClassName(isDashboardActive, "mb-1")}
        >
          <ModuleIcon name="LayoutDashboard" className="size-4 shrink-0" />
          Dashboard
        </a>
        <span className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Products
        </span>
        {products.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No products yet.</p>
        ) : (
          products.map((product) => {
            const href = `${businessHref(effectiveBusinessId!)}/products/${product.id}`;
            const isActive = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <a
                key={product.id}
                href={href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={navItemClassName(Boolean(isActive), "text-base")}
              >
                <span className="min-w-0 flex-1 truncate">{product.name}</span>
              </a>
            );
          })
        )}
      </div>
    );
  }

  if (!navGroups || navGroups.length === 0 || !routePrefix) {
    return <p className="px-3 py-3 text-sm text-muted-foreground">Not available yet.</p>;
  }

  if (businesses.length === 0) return <CreateBusinessPrompt onCreateBusiness={onCreateBusiness} />;

  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      {navGroups.map((group, groupIndex) => (
        <div key={group.heading ?? groupIndex} className="flex flex-col gap-0.5">
          {group.heading ? (
            <span className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.heading}
            </span>
          ) : null}
          {group.items.map((item) => {
            const base = `${businessHref(effectiveBusinessId!)}${routePrefix}`;
            const href = item.slug ? `${base}/${item.slug}` : base;
            const isActive = pathname === href;
            return (
              <a
                key={item.slug || "root"}
                href={href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={navItemClassName(isActive)}
              >
                <ModuleIcon name={item.icon} className="size-4 shrink-0" />
                {item.label}
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AppSidebar({
  modules,
  businesses,
  activeBusinessId,
  businessHref,
  productsByBusiness,
  creditsUsedPercent,
  onCreateBusiness,
  user,
  onSignOut,
}: {
  modules: ShellNavModule[];
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref: (businessId: string) => string;
  /** This business's discovery products, keyed by business id -- shown under the
   * Discovery section for whichever business is currently active. */
  productsByBusiness?: Record<string, ShellProduct[]>;
  /** % of AI credits used this month, blended across every workspace on the account. */
  creditsUsedPercent?: number;
  onCreateBusiness?: () => void;
  user: ShellUser;
  onSignOut?: () => void;
}) {
  const { open, setOpen } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  // Full navigations inside the drawer use plain <a> tags (deliberately, so they work the
  // same whether the target route exists yet or not), which reloads the page and remounts
  // this component. Persisting across that reload -- rather than always resetting to
  // modules[0] -- needs two sources, preferred in order: what the URL itself indicates
  // (most reliable, since it's exactly where the founder ended up), then the last module
  // explicitly picked from the selector, stashed in localStorage for pages whose URL
  // doesn't indicate a module (bare /dashboard, settings, etc).
  const [selectedModule, setSelectedModuleState] = useState<string>(() => {
    const fromUrl = inferModuleFromPath(pathname);
    if (fromUrl && modules.some((m) => m.key === fromUrl && m.licensed)) return fromUrl;
    const stored = readStoredModule();
    if (stored && modules.some((m) => m.key === stored && m.licensed)) return stored;
    // Every module is in this array regardless of entitlement now -- default to the
    // first *licensed* one so the drawer never opens straight into an unlicensed
    // module's real content with no redirect (that only happens on an explicit picker
    // click, via handleSelectModule below).
    return modules.find((m) => m.licensed)?.key ?? modules[0]?.key ?? "discovery";
  });

  function setSelectedModule(key: string) {
    setSelectedModuleState(key);
    writeStoredModule(key);
  }

  // Client-side navigations (e.g. the selector's own "Dashboard" link) don't remount this
  // component, so re-derive from the URL whenever it changes too -- keeps the drawer in
  // sync without waiting for the next full reload.
  useEffect(() => {
    const fromUrl = inferModuleFromPath(pathname);
    if (fromUrl && modules.some((m) => m.key === fromUrl && m.licensed)) {
      setSelectedModuleState(fromUrl);
      writeStoredModule(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  // "Selected in navbar" with a fallback to the first business, per the explicit ask --
  // the sidebar's module content always has *a* business to work from as long as one
  // exists, even before the founder has navigated into any business yet.
  const effectiveBusinessId = activeBusinessId ?? businesses[0]?.id ?? null;
  const selectedModuleManifest = modules.find((m) => m.key === selectedModule);

  function handleSelectModule(key: string) {
    // Every module is listed in the picker regardless of entitlement (DashboardChrome
    // no longer filters the array) -- an unlicensed one routes straight to that
    // business's own not-licensed page (the same one middleware's route guard already
    // rewrites direct URL access to) instead of switching the drawer to show it, so
    // clicking a module the business doesn't have surfaces "activate this" rather than
    // either not existing at all or silently doing nothing.
    const business = effectiveBusinessId ?? businesses[0]?.id;
    const licensed = modules.find((m) => m.key === key)?.licensed ?? true;
    if (!licensed && business) {
      setOpen(false);
      router.push(`${businessHref(business)}/not-licensed?module=${key}`);
      return;
    }

    setSelectedModule(key);
    // No business active yet (e.g. plain /dashboard) -- auto-select the first one by
    // navigating there, so the navbar's own business switcher picks it up too (it derives
    // the active business from the URL, same as this sidebar does).
    if (!activeBusinessId && businesses.length > 0) {
      router.push(businessHref(businesses[0]!.id));
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 top-14 z-30 bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <nav
        aria-label="Main"
        className="fixed top-14 bottom-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-base shadow-2xl"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close sidebar"
          className="absolute top-1.5 right-1.5 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground active:scale-90"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto bg-sidebar-accent/10">
          <ModuleContent
            moduleKey={selectedModule}
            pathname={pathname}
            businesses={businesses}
            effectiveBusinessId={effectiveBusinessId}
            businessHref={businessHref}
            productsByBusiness={productsByBusiness}
            onCreateBusiness={onCreateBusiness}
            onNavigate={() => setOpen(false)}
            routePrefix={selectedModuleManifest?.routePrefix}
            navGroups={selectedModuleManifest?.nav}
          />
        </div>

        <ModuleSelector
          modules={modules}
          selectedKey={selectedModule}
          onSelect={handleSelectModule}
          onNavigate={() => setOpen(false)}
        />

        {creditsUsedPercent !== undefined ? (
          <a
            href="/dashboard/settings/usage"
            onClick={() => setOpen(false)}
            className="flex flex-col gap-1.5 border-t border-sidebar-border px-3 py-2.5 hover:bg-sidebar-accent"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>AI credits used</span>
              <span className="font-medium text-foreground">{creditsUsedPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  creditsUsedPercent >= 100 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${creditsUsedPercent}%` }}
              />
            </div>
          </a>
        ) : null}

        <SidebarAccountMenu user={user} onSignOut={onSignOut} onNavigate={() => setOpen(false)} />
      </nav>
    </>
  );
}
