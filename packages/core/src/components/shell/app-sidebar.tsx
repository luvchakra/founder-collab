"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSidebar } from "./sidebar-context";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { ModuleIcon } from "./module-icon";
import type { ShellBusiness, ShellNavModule, ShellProduct, ShellUser } from "./types";

/**
 * The platform's left nav -- a hamburger-triggered slide-in drawer, per the reference
 * layout (co-founder-ai's actual sidebar drawer): businesses listed flat right under
 * Dashboard, then each licensed module as its own collapsible section below. Only
 * Discovery is interactive today -- it's the only module with real routes (a business's
 * products) built so far; Inventory/Service/CRM/GST render as disabled placeholders
 * rather than linking anywhere, since their own UI routes don't exist yet (SP-7/SP-9).
 * Swap the `key === "discovery"` special-case below for real per-module nav once those
 * land -- don't invent nav entries for routes that don't exist yet in the meantime.
 */
export function AppSidebar({
  modules,
  businesses,
  activeBusinessId,
  businessHref,
  productsByBusiness,
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
  user: ShellUser;
  onSignOut?: () => void;
}) {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();
  const [expandedModule, setExpandedModule] = useState<string | null>("discovery");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const activeProducts = activeBusinessId ? (productsByBusiness?.[activeBusinessId] ?? []) : [];

  return (
    <>
      <div
        className="fixed inset-0 top-14 z-30 bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <nav
        aria-label="Main"
        className="fixed top-14 bottom-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-base shadow-2xl"
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Menu
          </span>
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

        <a
          href="/dashboard"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2.5 font-medium hover:bg-sidebar-accent",
            pathname === "/dashboard" && "bg-sidebar-accent",
          )}
        >
          Dashboard
        </a>

        <div className="flex flex-col divide-y divide-sidebar-border border-t border-b border-sidebar-border">
          {businesses.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No businesses yet.</p>
          ) : (
            businesses.map((business) => (
              <a
                key={business.id}
                href={businessHref(business.id)}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-sidebar-accent",
                  business.id === activeBusinessId && "bg-sidebar-accent font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{business.name}</span>
                {business.id === activeBusinessId ? (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </a>
            ))
          )}
        </div>

        <div className="flex flex-col py-1">
          {modules.map((module) => {
            if (module.key !== "discovery") {
              return (
                <div
                  key={module.key}
                  aria-disabled="true"
                  title={`${module.name} isn't available yet`}
                  className="flex cursor-not-allowed items-center gap-2.5 px-3 py-2.5 font-medium text-muted-foreground/50"
                >
                  <ModuleIcon name={module.icon} className="size-4 shrink-0" />
                  {module.name}
                </div>
              );
            }

            const isExpanded = expandedModule === module.key;
            return (
              <div key={module.key} className="flex flex-col">
                <div className="flex items-center pr-2">
                  <button
                    type="button"
                    onClick={() => setExpandedModule(isExpanded ? null : module.key)}
                    aria-label={isExpanded ? `Collapse ${module.name}` : `Expand ${module.name}`}
                    aria-expanded={isExpanded}
                    className="flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn("size-4 transition-transform duration-150", isExpanded && "rotate-90")}
                      aria-hidden="true"
                    />
                  </button>
                  <a
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex flex-1 items-center gap-2.5 rounded-md py-2 pr-1 font-medium hover:bg-sidebar-accent"
                  >
                    <ModuleIcon name={module.icon} className="size-4 shrink-0 text-muted-foreground" />
                    {module.name}
                  </a>
                </div>

                {isExpanded ? (
                  !activeBusinessId ? (
                    <p className="mt-1 mb-1 ml-9 pr-3 text-sm text-muted-foreground">
                      Select a business above to see its products.
                    </p>
                  ) : activeProducts.length === 0 ? (
                    <p className="mt-1 mb-1 ml-9 pr-3 text-sm text-muted-foreground">
                      No products yet.
                    </p>
                  ) : (
                    <div className="mt-1 mb-1 ml-9 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
                      {activeProducts.map((product) => {
                        const href = `${businessHref(activeBusinessId)}/products/${product.id}`;
                        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
                        return (
                          <a
                            key={product.id}
                            href={href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                              isActive && "bg-sidebar-accent font-medium text-foreground",
                            )}
                          >
                            {product.name}
                          </a>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col">
          <SidebarAccountMenu user={user} onSignOut={onSignOut} onNavigate={() => setOpen(false)} />
        </div>
      </nav>
    </>
  );
}
