import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { SidebarProvider } from "./sidebar-context";
import type { ShellAlert, ShellBusiness, ShellNavModule, ShellProduct, ShellUser } from "./types";

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
  productsByBusiness,
  creditsUsedPercent,
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
  productsByBusiness?: Record<string, ShellProduct[]>;
  /** % of AI credits used this month, blended across every workspace on the account. */
  creditsUsedPercent?: number;
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
          productsByBusiness={productsByBusiness}
          creditsUsedPercent={creditsUsedPercent}
          onCreateBusiness={onCreateBusiness}
          user={user}
          onSignOut={onSignOut}
        />
        {/* `overflow-x-hidden` is the platform-wide backstop for CLAUDE.md rule #12 (no
            page ever scrolls horizontally) -- any element that misbehaves and paints
            wider than the viewport (a chart's first frame, an unwrapped long string) gets
            clipped here instead of pushing the whole page into horizontal scroll. Doesn't
            affect the legitimate `overflow-x-auto` containers (tables, etc.) nested
            inside `children` -- those still scroll internally exactly as before. */}
        <main className="flex-1 overflow-x-hidden bg-background p-4 sm:p-6">{children}</main>
      </div>
    </SidebarProvider>
  );
}
