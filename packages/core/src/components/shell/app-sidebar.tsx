"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Lock, Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { BRAND_NAME } from "../../lib/brand";
import { SELECTED_MODULE_STORAGE_KEY as MODULE_STORAGE_KEY } from "../../lib/module-selection";
import { useSidebar } from "./sidebar-context";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { BusinessSwitcher } from "./business-switcher";
import { LogoMark } from "./logo-mark";
import { ModuleIcon } from "./module-icon";
import type { ShellBusiness, ShellNavModule, ShellProduct, ShellUser } from "./types";

/**
 * Infers the active module from the URL for the routes that unambiguously indicate one
 * (/[businessSlug]/inventory/... and /[businessSlug]/compliance/...) -- everything else
 * (bare business page, discovery's own /discovery/... routes, non-module pages like
 * settings) returns null so the caller falls back to the last explicitly opened section.
 * Written locally rather than reusing module-discovery's `getActiveIdsFromPath` since
 * `packages/core` cannot depend on any module (lint:boundaries).
 *
 * The bare account-level /dashboard and /platform control-plane paths are excluded up
 * front: unlike the business-scoped shape below, they have no module section as their
 * *second* segment at all -- without this guard, "/dashboard" itself would parse as
 * segment[0]="dashboard" with no section, which the empty-section branch below would
 * misread as "discovery" (the same shape a bare business page like "/acme-hvac" has).
 */
function inferModuleFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/platform")) return null;
  const match = pathname.match(/^\/[^/]+(?:\/([^/]+))?/);
  if (!match) return null;
  const section = match[1];
  if (section === "inventory") return "inventory";
  if (section === "compliance") return "gst";
  if (!section || section === "discovery" || section === "business") return "discovery";
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

/** A leaf row in the rail: the module sub-items, and the account-level shortcuts under
 * them. Indented under its module header, muted until it's the current page. */
function NavLink({
  href,
  label,
  icon,
  isActive,
  onNavigate,
  indent,
}: {
  href: string;
  label: string;
  icon?: string;
  isActive: boolean;
  onNavigate: () => void;
  indent?: boolean;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 truncate rounded-lg px-3 py-2 text-sm transition-colors",
        indent && "ml-3.5 border-l border-sidebar-border pl-4",
        isActive
          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {icon ? <ModuleIcon name={icon} className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </a>
  );
}

/** The expanded module's own sub-navigation. Discovery is the one module whose real
 * content is live data (this business's offerings) rather than a static manifest tree,
 * so it renders its own shape; every other module renders its manifest nav groups. */
function ModuleNav({
  module,
  pathname,
  businessId,
  businessHref,
  productsByBusiness,
  onCreateBusiness,
  onNavigate,
  hasBusinesses,
}: {
  module: ShellNavModule;
  pathname: string | null;
  businessId: string | null;
  businessHref: (businessId: string) => string;
  productsByBusiness?: Record<string, ShellProduct[]>;
  onCreateBusiness?: () => void;
  onNavigate: () => void;
  hasBusinesses: boolean;
}) {
  if (!hasBusinesses || !businessId) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <p className="text-sm text-sidebar-muted">No businesses yet.</p>
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

  const base = businessHref(businessId);

  if (module.key === "discovery") {
    const products = productsByBusiness?.[businessId] ?? [];
    // Discovery's own module dashboard lives at /discovery/dashboard, the same
    // "<module>/dashboard" shape every other module uses. The business's own editable
    // profile (name/website/description) and offering list live one level up at
    // "Business" -- a separate item so "Dashboard" reads like every other module's
    // Dashboard link instead of doubling as an editor form.
    const dashboardHref = `${base}/discovery/dashboard`;
    const businessDetailHref = `${base}/business`;
    return (
      <div className="flex flex-col gap-0.5">
        <NavLink
          href={dashboardHref}
          label="Dashboard"
          icon="LayoutDashboard"
          isActive={pathname === dashboardHref}
          onNavigate={onNavigate}
          indent
        />
        <NavLink
          href={businessDetailHref}
          label="Business"
          icon="Building2"
          isActive={pathname === businessDetailHref}
          onNavigate={onNavigate}
          indent
        />
        <span className="mt-2 ml-7 text-[11px] font-medium tracking-wide text-sidebar-muted/70 uppercase">
          Business Offerings
        </span>
        {products.length === 0 ? (
          <p className="ml-7 py-1.5 text-sm text-sidebar-muted">No business offerings yet.</p>
        ) : (
          products.map((product) => {
            const href = `${base}/discovery/offerings/${product.id}`;
            return (
              <NavLink
                key={product.id}
                href={href}
                label={product.name}
                isActive={pathname === href || Boolean(pathname?.startsWith(`${href}/`))}
                onNavigate={onNavigate}
                indent
              />
            );
          })
        )}
      </div>
    );
  }

  if (module.nav.length === 0) {
    return <p className="px-3 py-2.5 text-sm text-sidebar-muted">Not available yet.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {module.nav.map((group, groupIndex) => (
        <div key={group.heading ?? groupIndex} className="flex flex-col gap-0.5">
          {group.heading ? (
            <span className="mt-2 ml-7 text-[11px] font-medium tracking-wide text-sidebar-muted/70 uppercase">
              {group.heading}
            </span>
          ) : null}
          {group.items.map((item) => {
            const href = item.slug
              ? `${base}${module.routePrefix}/${item.slug}`
              : `${base}${module.routePrefix}`;
            return (
              <NavLink
                key={item.slug || "root"}
                href={href}
                label={item.label}
                icon={item.icon}
                isActive={pathname === href}
                onNavigate={onNavigate}
                indent
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The platform's primary navigation: a persistent dark rail on desktop, the same rail as
 * a slide-over drawer below `lg` (docs/DESIGN.md). Every module the account can see is
 * listed at once, with the current one expanded to its own sub-navigation -- so the
 * founder can always tell both where they are and what else the platform does, which the
 * previous one-module-at-a-time drawer could not show.
 *
 * Unlicensed modules stay listed (with a lock) rather than disappearing: clicking one
 * routes to that business's not-licensed page, which is where a founder can actually
 * activate it, instead of the module silently not existing at all.
 */
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

  // Navigations inside the rail use plain <a> tags (deliberately, so they work the same
  // whether the target route exists yet or not), which reloads the page and remounts this
  // component. Persisting which section is open across that reload -- rather than always
  // resetting to modules[0] -- needs two sources, preferred in order: what the URL itself
  // indicates (most reliable, since it's exactly where the founder ended up), then the
  // last section they opened by hand, stashed in localStorage for pages whose URL
  // doesn't indicate a module (bare /dashboard, settings, etc).
  const [expandedModule, setExpandedModule] = useState<string | null>(() => {
    const fromUrl = inferModuleFromPath(pathname);
    if (fromUrl && modules.some((m) => m.key === fromUrl && m.licensed)) return fromUrl;
    const stored = readStoredModule();
    if (stored && modules.some((m) => m.key === stored && m.licensed)) return stored;
    return modules.find((m) => m.licensed)?.key ?? null;
  });

  // Client-side navigations (e.g. a <Link> elsewhere on the page) don't remount this
  // component, so re-derive from the URL whenever it changes too -- keeps the open
  // section in sync without waiting for the next full reload.
  useEffect(() => {
    const fromUrl = inferModuleFromPath(pathname);
    if (fromUrl && modules.some((m) => m.key === fromUrl && m.licensed)) {
      setExpandedModule(fromUrl);
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

  // "Selected in the switcher" with a fallback to the first business, per the explicit
  // ask -- the rail's module content always has *a* business to work from as long as one
  // exists, even before the founder has navigated into any business yet.
  const effectiveBusinessId = activeBusinessId ?? businesses[0]?.id ?? null;
  const closeDrawer = () => setOpen(false);

  function handleModuleClick(module: ShellNavModule) {
    // Every module is listed regardless of entitlement -- an unlicensed one routes
    // straight to that business's own not-licensed page (the same one the proxy's route
    // guard already rewrites direct URL access to) rather than expanding to nav it can't
    // actually open, so clicking a module the business doesn't have surfaces "activate
    // this" instead of either not existing or silently doing nothing.
    if (!module.licensed) {
      if (effectiveBusinessId) {
        setOpen(false);
        router.push(`${businessHref(effectiveBusinessId)}/not-licensed?module=${module.key}`);
      }
      return;
    }
    const next = expandedModule === module.key ? null : module.key;
    setExpandedModule(next);
    if (next) writeStoredModule(next);
  }

  const isExecutiveActive = pathname === "/dashboard";
  const isAdminActive = Boolean(pathname?.startsWith("/dashboard/settings"));

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      ) : null}

      <nav
        aria-label="Main"
        className={cn(
          // `invisible` (not just the off-screen transform) when the drawer is closed:
          // a translated-but-visible rail keeps its links in the tab order and the
          // accessibility tree, so a keyboard or screen-reader user would traverse a
          // whole navigation they can't see. The `lg:` variants win over both, so from
          // `lg` up the rail is simply always on screen.
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:visible lg:translate-x-0 print:hidden",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close sidebar"
          className="absolute top-3 right-3 z-10 rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-90 lg:hidden"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <a
          href="/dashboard"
          onClick={closeDrawer}
          aria-label={BRAND_NAME}
          className="flex shrink-0 items-center gap-2.5 px-5 py-5"
        >
          {/* The rail is dark in both themes, so the logo is pinned to its light-fill
              artwork here rather than following the theme like it does on light pages. */}
          <LogoMark onDark className="h-8 w-auto shrink-0" />
          <span className="min-w-0 truncate text-base font-semibold text-sidebar-foreground">
            {BRAND_NAME}
          </span>
        </a>

        <div className="px-3 pb-3">
          <BusinessSwitcher
            businesses={businesses}
            activeBusinessId={activeBusinessId}
            businessHref={businessHref}
            onCreateBusiness={onCreateBusiness}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {modules.map((module) => {
            const isExpanded = module.licensed && expandedModule === module.key;
            return (
              <div key={module.key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => handleModuleClick(module)}
                  aria-expanded={module.licensed ? isExpanded : undefined}
                  title={module.licensed ? undefined : `${module.name} isn't licensed for this business`}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isExpanded
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <ModuleIcon name={module.icon} className="size-4.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{module.name}</span>
                  {!module.licensed ? (
                    <Lock className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  ) : (
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        isExpanded ? "rotate-0" : "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
                {isExpanded ? (
                  <ModuleNav
                    module={module}
                    pathname={pathname}
                    businessId={effectiveBusinessId}
                    businessHref={businessHref}
                    productsByBusiness={productsByBusiness}
                    onCreateBusiness={onCreateBusiness}
                    onNavigate={closeDrawer}
                    hasBusinesses={businesses.length > 0}
                  />
                ) : null}
              </div>
            );
          })}

          <div className="my-2 border-t border-sidebar-border" />

          <NavLink
            href="/dashboard"
            label="Executive Dashboard"
            icon="LayoutGrid"
            isActive={isExecutiveActive}
            onNavigate={closeDrawer}
          />
          <NavLink
            href="/dashboard/settings"
            label="Admin"
            icon="Shield"
            isActive={isAdminActive}
            onNavigate={closeDrawer}
          />
        </div>

        {creditsUsedPercent !== undefined ? (
          <a
            href="/dashboard/settings/usage"
            onClick={closeDrawer}
            className="mx-3 mb-3 flex flex-col gap-1.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-sidebar-accent"
          >
            <div className="flex items-center justify-between text-xs text-sidebar-muted">
              <span>AI Usage</span>
              <span className="font-medium text-sidebar-foreground">{creditsUsedPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-accent">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  creditsUsedPercent >= 100 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${Math.min(creditsUsedPercent, 100)}%` }}
              />
            </div>
          </a>
        ) : null}

        <SidebarAccountMenu user={user} onSignOut={onSignOut} onNavigate={closeDrawer} />
      </nav>
    </>
  );
}
