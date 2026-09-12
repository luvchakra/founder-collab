import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
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
 * Deliberately minimal beyond that -- no full sidebar yet (PLATFORM-P0-19's own
 * "Dedicated Admin Layout" is a later, separate story in Phase 4). PLATFORM-P0-03.1 adds
 * a second page (`/platform/branding`) alongside the dashboard, so a one-line nav strip
 * is added below the header -- enough to make both pages reachable without building out
 * the full left-nav shell §19 describes ahead of its own turn.
 */
const NAV_LINKS = [
  { href: "/platform", label: "Dashboard" },
  // PLATFORM-P0-03.4: labeled "Platform Branding", not just "Branding" -- this nav sits
  // only inside the SUPERADMIN-gated /platform shell, but the extra word costs nothing
  // and removes any doubt that this configures WonderArc's own global brand, not a
  // business's (no such business-level branding page exists anywhere in the app to
  // confuse it with today, but the label shouldn't rely on that always being true).
  { href: "/platform/branding", label: "Platform Branding" },
  // PLATFORM-P0-04.1: the subscription/pricing catalog admin screen.
  { href: "/platform/plans", label: "Plans" },
];

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
      <nav className="flex gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-sm sm:px-6">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-zinc-400 hover:text-zinc-100">
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
