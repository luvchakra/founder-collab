import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@cofounderai/core/rbac/platform-admin";
import { createClient } from "@cofounderai/core/db/server";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { Badge } from "@cofounderai/core/ui/badge";

// Every /platform/* page is a per-request, authenticated control-plane view (session +
// cross-tenant admin queries) -- never a candidate for static prerendering. Forced here
// rather than relying on Next's dynamic-API auto-detection, since PLATFORM-P0-02's
// service-role queries (packages/core/src/admin/platform-dashboard-queries.ts) run before
// any cookies()/headers() call would otherwise trip that heuristic during the build's
// prerender pass, which fails hard in any environment without live Supabase env vars.
export const dynamic = "force-dynamic";

/**
 * PLATFORM-P0-01's control-plane shell -- a new top-level `apps/web/app/platform/`
 * segment, not nested inside `(dashboard)`, so it shares none of the customer app's
 * sidebar/topbar chrome (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §3: "must not be
 * implemented as a normal customer/business account with elevated UI permissions").
 *
 * `requireSuperadmin()` here is the real authorization boundary for every `/platform/*`
 * page (PLATFORM-P0-01.2: "every /platform/* route... must independently verify...
 * Never rely only on hiding navigation") -- redirecting a non-superadmin back to the
 * customer dashboard, same pattern `/dashboard/admin`'s own page already uses for its
 * narrower env-var-only gate. The header below is PLATFORM-P0-01.3's own requirement:
 * "the UI must clearly indicate Platform Administration / SUPERADMIN."
 *
 * Deliberately minimal beyond that -- no sidebar yet (PLATFORM-P0-19's own "Dedicated
 * Admin Layout" is a later, separate story in Phase 4; there is exactly one page to link
 * to today, so a full nav would be pure decoration).
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  try {
    await requireSuperadmin();
  } catch {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-wide">{BRAND_NAME} Platform Administration</span>
          <Badge variant="destructive">SUPERADMIN</Badge>
        </div>
        {user?.email ? <span className="text-xs text-zinc-400">{user.email}</span> : null}
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
