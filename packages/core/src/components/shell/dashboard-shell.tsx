import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { SidebarProvider } from "./sidebar-context";
import type { ShellAlert, ShellBusiness, ShellNavModule, ShellUser } from "./types";

/**
 * The platform's dashboard shell (topbar + drawer + content), structurally ported from
 * co-founder-ai's app/(dashboard)/layout.tsx (docs/PORT-PROVENANCE.md) per the reference
 * mockup in docs/DESIGN.md. `modules`/`business`/`user` are supplied by the caller --
 * this component has no opinion on where that data comes from (module-registry, a
 * session, etc.).
 */
export function DashboardShell({
  modules,
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
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref?: (businessId: string) => string;
  onCreateBusiness?: () => void;
  user: ShellUser;
  alerts?: ShellAlert[];
  chatSlot?: ReactNode;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const hrefFor = businessHref ?? (() => "#");
  return (
    <SidebarProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <AppTopbar
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          businessHref={hrefFor}
          onCreateBusiness={onCreateBusiness}
          alerts={alerts}
          chatSlot={chatSlot}
        />
        <AppSidebar
          modules={modules}
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          businessHref={hrefFor}
          user={user}
          onSignOut={onSignOut}
        />
        <main className="flex-1 bg-background p-6">{children}</main>
      </div>
    </SidebarProvider>
  );
}
