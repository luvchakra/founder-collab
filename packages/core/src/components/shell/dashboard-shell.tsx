import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import type { ShellAlert, ShellBusiness, ShellNavModule, ShellUser } from "./types";

/**
 * The platform's dashboard shell (sidebar + topbar + content), per docs/DESIGN.md's
 * reference mockup. `modules`/`business`/`user` are supplied by the caller — this
 * component has no opinion on where that data comes from (module-registry, a session,
 * etc.), keeping it usable before Epic 2's real tenancy/session wiring lands.
 */
export function DashboardShell({
  modules,
  business,
  businesses,
  activeBusinessId,
  businessHref,
  onCreateBusiness,
  user,
  alerts,
  chatSlot,
  onSignOut,
  children,
}: {
  modules: ShellNavModule[];
  business: ShellBusiness;
  businesses?: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref?: (businessId: string) => string;
  onCreateBusiness?: () => void;
  user: ShellUser;
  alerts?: ShellAlert[];
  chatSlot?: ReactNode;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar
        modules={modules}
        business={business}
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        businessHref={businessHref}
        onCreateBusiness={onCreateBusiness}
      />
      <SidebarInset>
        <AppTopbar
          user={user}
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          businessHref={businessHref}
          onCreateBusiness={onCreateBusiness}
          alerts={alerts}
          chatSlot={chatSlot}
          onSignOut={onSignOut}
        />
        <main className="flex-1 bg-background p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
