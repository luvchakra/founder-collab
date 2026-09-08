"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ClipboardList,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Shield,
  Truck,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useSidebar } from "./sidebar-context";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { ModuleSelector } from "./module-selector";
import type { ShellBusiness, ShellNavModule, ShellProduct, ShellUser } from "./types";

/**
 * Inventory's nav tree (Catalog & Inventory / Sales / Purchasing), per the reference
 * screenshots -- explicitly authorized to link to routes that don't exist yet (SP-7/SP-9
 * are what build them; these 404 until then). Slugs match this platform's own
 * business-scoped URL convention (/dashboard/businesses/[id]/inventory/<slug>), not
 * StockPilot's own org-scoped routing, since that's the shape SP-7 will actually build
 * into.
 */
const INVENTORY_NAV: { heading: string; items: { label: string; slug: string; icon: LucideIcon }[] }[] = [
  {
    heading: "Overview",
    items: [
      { label: "Dashboard", slug: "dashboard", icon: LayoutDashboard },
      { label: "Alerts", slug: "alerts", icon: Bell },
      { label: "Audit Log", slug: "audit-log", icon: History },
    ],
  },
  {
    heading: "Catalog & Inventory",
    items: [
      { label: "Products", slug: "products", icon: Package },
      { label: "Inventory", slug: "stock", icon: RefreshCw },
      { label: "Stock Transfers", slug: "transfers", icon: Truck },
      { label: "Warehouses", slug: "warehouses", icon: Warehouse },
    ],
  },
  {
    heading: "Sales",
    items: [
      { label: "Customers", slug: "customers", icon: Users },
      { label: "Sales Orders", slug: "sales-orders", icon: ShoppingCart },
      { label: "Sales Invoices", slug: "sales-invoices", icon: FileText },
      { label: "Sales Returns", slug: "sales-returns", icon: RotateCcw },
    ],
  },
  {
    heading: "Purchasing",
    items: [
      { label: "Suppliers", slug: "suppliers", icon: Truck },
      { label: "Purchase Orders", slug: "purchase-orders", icon: ClipboardList },
    ],
  },
  {
    heading: "Administration",
    items: [
      { label: "Team", slug: "team", icon: Shield },
      { label: "API Keys", slug: "api-keys", icon: KeyRound },
    ],
  },
];

/**
 * GST's own nav -- the 3 sections stockpilot-ai-ops had folded into its account/profile
 * settings page (GST profile, e-Way Bill credentials, e-Invoicing credentials), plus its
 * separate top-level GST Filing route, promoted to their own menu items under this
 * platform's `gst` module instead: per docs/plan/00-MASTER-PLAN.md §5's entity-
 * ownership map, "gst module: e-invoice, e-way bill, credentials, return workspaces" is
 * gst-owned, not a business-settings afterthought or an inventory-module page. Only
 * "GST Profile" has a real page as of this slice; the other 3 404 until their own
 * slices land, same "link now, build later" pattern INVENTORY_NAV already established.
 */
const GST_NAV: { label: string; slug: string; icon: LucideIcon }[] = [
  { label: "GST Profile", slug: "profile", icon: Receipt },
  { label: "e-Way Bill", slug: "eway-bill", icon: Truck },
  { label: "e-Invoicing", slug: "einvoicing", icon: FileText },
  { label: "GST Filing", slug: "filing", icon: ClipboardList },
];

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
}: {
  moduleKey: string;
  pathname: string | null;
  businesses: ShellBusiness[];
  effectiveBusinessId: string | null;
  businessHref: (businessId: string) => string;
  productsByBusiness?: Record<string, ShellProduct[]>;
  onCreateBusiness?: () => void;
  onNavigate: () => void;
}) {
  if (moduleKey === "discovery") {
    if (businesses.length === 0) return <CreateBusinessPrompt onCreateBusiness={onCreateBusiness} />;

    const products = effectiveBusinessId ? (productsByBusiness?.[effectiveBusinessId] ?? []) : [];
    return (
      <div className="flex flex-col gap-0.5 px-2 py-2">
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

  if (moduleKey === "inventory") {
    if (businesses.length === 0) return <CreateBusinessPrompt onCreateBusiness={onCreateBusiness} />;

    return (
      <div className="flex flex-col gap-3 px-2 pt-0 pb-2">
        {INVENTORY_NAV.map((group) => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <span className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.heading}
            </span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const href = `${businessHref(effectiveBusinessId!)}/inventory/${item.slug}`;
              const isActive = pathname === href;
              return (
                <a
                  key={item.slug}
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={navItemClassName(isActive)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  if (moduleKey === "gst") {
    if (businesses.length === 0) return <CreateBusinessPrompt onCreateBusiness={onCreateBusiness} />;

    return (
      <div className="flex flex-col gap-0.5 px-2 py-2">
        {GST_NAV.map((item) => {
          const Icon = item.icon;
          const href = `${businessHref(effectiveBusinessId!)}/gst/${item.slug}`;
          const isActive = pathname === href;
          return (
            <a
              key={item.slug}
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={navItemClassName(isActive)}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </a>
          );
        })}
      </div>
    );
  }

  return <p className="px-3 py-3 text-sm text-muted-foreground">Not available yet.</p>;
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
    if (fromUrl && modules.some((m) => m.key === fromUrl)) return fromUrl;
    const stored = readStoredModule();
    if (stored && modules.some((m) => m.key === stored)) return stored;
    return modules[0]?.key ?? "discovery";
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
    if (fromUrl && modules.some((m) => m.key === fromUrl)) {
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

  function handleSelectModule(key: string) {
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
