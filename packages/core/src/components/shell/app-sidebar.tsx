"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Check, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSidebar } from "./sidebar-context";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { ModuleIcon } from "./module-icon";
import type { ShellBusiness, ShellNavModule, ShellUser } from "./types";

/**
 * The platform's left nav -- a hamburger-triggered slide-in drawer (not a persistent
 * rail), ported structurally from co-founder-ai's components/tenancy/sidebar.tsx
 * (docs/PORT-PROVENANCE.md) per the reference mockup in docs/DESIGN.md: dismissible by
 * backdrop click, Escape, or navigating to a link inside it. Lists licensed modules
 * (co-founder-ai's own drawer only ever had one product to link to; the platform has
 * several) rather than a business/product drill-down, since modules aren't nested under
 * a business the way discovery's workspaces nest under a product. The account menu is
 * pinned to the very bottom, matching co-founder-ai's own layout, not the topbar.
 */
export function AppSidebar({
  modules,
  businesses,
  activeBusinessId,
  businessHref,
  user,
  onSignOut,
}: {
  modules: ShellNavModule[];
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref: (businessId: string) => string;
  user: ShellUser;
  onSignOut?: () => void;
}) {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

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

        <div className="flex flex-col py-1">
          {modules.map((module) => {
            const isActive = pathname === module.routePrefix || pathname?.startsWith(`${module.routePrefix}/`);
            return (
              <a
                key={module.key}
                href={module.routePrefix}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 font-medium hover:bg-sidebar-accent",
                  isActive && "bg-sidebar-accent",
                )}
              >
                <ModuleIcon name={module.icon} className="size-4 shrink-0 text-muted-foreground" />
                {module.name}
              </a>
            );
          })}
        </div>

        <div className="px-3 pt-3 pb-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Businesses
          </span>
        </div>

        <div className="flex flex-col divide-y divide-sidebar-border border-t border-sidebar-border">
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

        <div className="mt-auto flex flex-col">
          <SidebarAccountMenu user={user} onSignOut={onSignOut} onNavigate={() => setOpen(false)} />
        </div>
      </nav>
    </>
  );
}
