import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for shared secrets (webhook secrets, cron bearer
 * tokens). A plain `===`/`!==` returns as soon as the first byte differs, which leaks how
 * much of a guess was right through response timing. Both sides are hashed first so
 * timingSafeEqual always compares equal-length buffers -- comparing raw buffers would
 * have to bail out early on a length mismatch, leaking the secret's length instead.
 */
export function secretsEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Constant-time comparison of a hex-encoded HMAC-SHA256 signature over `payload`. */
export function hmacSha256HexMatches(payload: string, secret: string, providedHex: string | null | undefined): boolean {
  if (!providedHex || !/^[0-9a-f]+$/i.test(providedHex)) return false;
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest();
  const provided = Buffer.from(providedHex, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** `Authorization: Bearer <secret>` check for scheduler-invoked routes (cron). */
export function bearerTokenMatches(authorizationHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  return secretsEqual(authorizationHeader.slice("Bearer ".length), expectedSecret);
}
