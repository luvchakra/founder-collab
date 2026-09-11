import { createClient } from "../db/server";

/**
 * Gate for the platform-admin tools under /dashboard/admin (currently just the demo
 * seed-data page). Deliberately separate from core.business_members' own role column --
 * those roles are scoped to a single business, while /admin can act across every
 * business on the platform, so it needs its own, narrower gate. Ported from
 * stockpilot-ai-ops's lib/admin-auth.ts.
 *
 * Access is controlled purely by the server-side PLATFORM_ADMIN_EMAILS env var (comma-
 * separated emails, matched case-insensitively). No DB table, no role to manage --
 * matches the original's own reasoning for keeping this a pure env-var check.
 */
function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Pure, side-effect-free check -- for a caller that already has the user's email on
 * hand (e.g. the dashboard layout's own auth.getUser() call) and just needs to decide
 * whether to render the admin nav link. Not itself a security boundary. */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  const admins = platformAdminEmails();
  return Boolean(email) && admins.length > 0 && admins.includes(email!.toLowerCase());
}

/** The actual security boundary -- every admin server action calls this first, so a
 * non-admin can't reach the seeding/deletion endpoints no matter what the client
 * renders. */
export async function requirePlatformAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPlatformAdminEmail(user?.email)) {
    throw new Error("Forbidden: this account does not have platform admin access.");
  }
}

/**
 * PLATFORM-P0-01's real, DB-backed SUPERADMIN role (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §5) -- the authorization boundary for every `/platform/*` route and mutation. Checks
 * the `PLATFORM_ADMIN_EMAILS` bootstrap list first (so the very first SUPERADMIN can
 * always get in before any `platform.admins` row exists, and an empty/misconfigured
 * table is never a lockout), then `platform.is_superadmin()` -- a SECURITY DEFINER SQL
 * function mirroring `core.has_permission()`'s exact shape, RLS-backed rather than just
 * an application-code check. Deliberately separate from `requirePlatformAdmin()` above
 * (a different, already-shipped feature -- the `/dashboard/admin` demo-data tool -- not
 * this story's to refactor), even though they currently share the same bootstrap list.
 */
export async function isSuperadmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (isPlatformAdminEmail(user.email)) return true;

  const platform = await createClient({ schema: "platform" });
  const { data, error } = await platform.rpc("is_superadmin");
  if (error) throw error;
  return Boolean(data);
}

/** Non-throwing `isSuperadmin()` isn't enough for a server action or page that must
 * actually refuse a non-superadmin, not just skip rendering for one -- same
 * hasPermission()/requirePermission() split `rbac/require-permission.ts` already
 * establishes for business-scoped permissions. */
export async function requireSuperadmin(): Promise<void> {
  if (!(await isSuperadmin())) {
    throw new Error("Forbidden: this account does not have SUPERADMIN access.");
  }
}
