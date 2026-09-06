import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import type { ShellBusiness, ShellNavModule, ShellUser } from "./types";

/**
 * The platform's dashboard shell (sidebar + topbar + content), per docs/DESIGN.md's
 * reference mockup. `modules`/`business`/`user` are supplied by the caller — this
 * component has no opinion on where that data comes from (module-registry, a session,
 * etc.), keeping it usable before Epic 2's real tenancy/session wiring lands.
 */
export function DashboardShell({
  modules,
  business,
  user,
  children,
}: {
  modules: ShellNavModule[];
  business: ShellBusiness;
  user: ShellUser;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar modules={modules} business={business} />
      <SidebarInset>
        <AppTopbar user={user} />
        <main className="flex-1 bg-background p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
