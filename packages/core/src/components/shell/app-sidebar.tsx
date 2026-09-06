"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
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
 * Business switching (the footer button) is a placeholder until Epic 2's C-5 wires real
 * business resolution; this only fixes what it looks like.
 */
export function AppSidebar({
  modules,
  business,
}: {
  modules: ShellNavModule[];
  business: ShellBusiness;
}) {
  const pathname = usePathname();

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
        <button
          type="button"
          className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-left text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {business.name}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-sidebar-foreground"
        >
          <Plus className="size-3.5" />
          Create new business
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
