"use client";

import { usePathname } from "next/navigation";
import { Check, Plus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import { ModuleIcon } from "./module-icon";
import type { ShellBusiness, ShellNavModule } from "./types";

/**
 * The platform's left nav — visual chrome per docs/DESIGN.md's reference mockup.
 * `businesses`/`activeBusinessId`/`businessHref`/`onCreateBusiness` are optional so this
 * still renders sensibly (a disabled-looking placeholder) before a caller wires real
 * data — apps/web's dashboard layout is the only caller today.
 */
export function AppSidebar({
  modules,
  business,
  businesses,
  activeBusinessId,
  businessHref,
  onCreateBusiness,
}: {
  modules: ShellNavModule[];
  business: ShellBusiness;
  businesses?: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref?: (businessId: string) => string;
  onCreateBusiness?: () => void;
}) {
  const pathname = usePathname();
  const list = businesses ?? [business];
  const hrefFor = businessHref ?? (() => "#");

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 px-1">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            C
          </span>
          <span className="text-base font-semibold text-sidebar-foreground">CoFounderAI</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarMenu>
          {modules.map((module) => {
            const isActive = pathname === module.routePrefix || pathname?.startsWith(`${module.routePrefix}/`);
            return (
              <SidebarMenuItem key={module.key}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <a href={module.routePrefix}>
                    <ModuleIcon name={module.icon} />
                    <span>{module.name}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-sidebar-border p-3">
        <span className="px-1 text-xs font-medium text-muted-foreground">Businesses</span>
        <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-1 py-1 text-sm text-muted-foreground">No businesses yet.</p>
          ) : (
            list.map((b) => (
              <a
                key={b.id}
                href={hrefFor(b.id)}
                className="flex items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-left text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {b.id === activeBusinessId ? (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </a>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={onCreateBusiness}
          className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-sidebar-foreground"
        >
          <Plus className="size-3.5" />
          Create new business
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
