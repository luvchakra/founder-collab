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
