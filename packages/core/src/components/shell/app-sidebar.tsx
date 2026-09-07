"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  FileText,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
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
];

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
 * Discovery lists the effective business's products (real routes); Inventory shows the
 * full nav tree (routes that 404 until SP-7 lands, by explicit instruction); every other
 * module is a flat "not available yet" placeholder, since nothing else has any real nav
 * to show. */
function ModuleContent({
  moduleKey,
  businesses,
  effectiveBusinessId,
  businessHref,
  productsByBusiness,
  onCreateBusiness,
  onNavigate,
}: {
  moduleKey: string;
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
    if (products.length === 0) {
      return <p className="px-3 py-3 text-sm text-muted-foreground">No products yet.</p>;
    }
    return (
      <div className="flex flex-col gap-0.5 px-2 py-2">
        {products.map((product) => (
          <a
            key={product.id}
            href={`${businessHref(effectiveBusinessId!)}/products/${product.id}`}
            onClick={onNavigate}
            className="truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            {product.name}
          </a>
        ))}
      </div>
    );
  }

  if (moduleKey === "inventory") {
    if (businesses.length === 0) return <CreateBusinessPrompt onCreateBusiness={onCreateBusiness} />;

    return (
      <div className="flex flex-col gap-3 px-2 py-2">
        {INVENTORY_NAV.map((group) => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <span className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.heading}
            </span>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.slug}
                  href={`${businessHref(effectiveBusinessId!)}/inventory/${item.slug}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2.5 truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
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
  const [selectedModule, setSelectedModule] = useState(modules[0]?.key ?? "discovery");

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
        <div className="flex items-center justify-end px-3 py-2.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
            className="text-muted-foreground transition-colors hover:text-foreground active:scale-90"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="border-t border-sidebar-border" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ModuleContent
            moduleKey={selectedModule}
            businesses={businesses}
            effectiveBusinessId={effectiveBusinessId}
            businessHref={businessHref}
            productsByBusiness={productsByBusiness}
            onCreateBusiness={onCreateBusiness}
            onNavigate={() => setOpen(false)}
          />
        </div>

        <ModuleSelector modules={modules} selectedKey={selectedModule} onSelect={handleSelectModule} />

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
