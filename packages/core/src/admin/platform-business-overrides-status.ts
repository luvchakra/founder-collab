/** PLATFORM-P1-02.2: where an override is in its window. No server imports, so the admin
 * page's client components can use it. */
export type OverrideStatus = "scheduled" | "active" | "expired" | "revoked";

export function overrideStatus(startsAt: string, expiresAt: string, revokedAt: string | null, now: number = Date.now()): OverrideStatus {
  if (revokedAt) return "revoked";
  if (Date.parse(startsAt) > now) return "scheduled";
  if (Date.parse(expiresAt) <= now) return "expired";
  return "active";
}
