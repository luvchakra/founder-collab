import { createHash, timingSafeEqual } from "node:crypto";

/**
 * SEC-3: constant-time comparison for shared secrets (cron bearer tokens, webhook shared
 * secrets). A plain `===`/`!==` returns as soon as the first byte differs, which leaks
 * how much of a guess was right through response timing. Both sides are hashed first so
 * timingSafeEqual always compares equal-length buffers -- comparing the raw strings would
 * have to bail out early on a length mismatch and leak the secret's length instead.
 *
 * A missing/empty expected secret never matches: an unconfigured route stays locked rather
 * than accepting an empty header.
 */
export function secretsEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** `Authorization: Bearer <secret>` check for scheduler-invoked routes (/api/cron/*;
 * Vercel Cron's own convention). */
export function bearerTokenMatches(authorizationHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  return secretsEqual(authorizationHeader.slice("Bearer ".length), expectedSecret);
}
