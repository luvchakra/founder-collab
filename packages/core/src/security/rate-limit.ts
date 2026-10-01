import { createHash } from "node:crypto";
import { createAdminClient } from "../db/admin";

/**
 * Fixed-window rate limit over core.api_rate_limit_counters (20260908090000_core_security.sql).
 * For anonymous entry points with no session for RLS to key off (public unsubscribe,
 * interest signup) and for expensive self-service actions (data export). Returns true
 * if the caller may proceed.
 *
 * `identity` is hashed before it reaches the database -- pass a raw IP or email and only
 * a truncated SHA-256 is stored, so the counters table holds no personal data.
 */
export async function checkRateLimit(
  scope: string,
  identity: string,
  limit: { windowSeconds: number; max: number },
): Promise<boolean> {
  const bucketKey = `${scope}:${hashIdentity(identity)}`;
  const supabase = createAdminClient({ schema: "core" });
  const { data, error } = await supabase.rpc("rate_limit_hit", {
    p_bucket_key: bucketKey,
    p_window_seconds: limit.windowSeconds,
    p_max: limit.max,
  });
  if (error) throw error;
  return data === true;
}

export function hashIdentity(identity: string): string {
  return createHash("sha256").update(identity.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Best-effort client IP behind Vercel's proxy: the first x-forwarded-for hop is the
 * client, as appended by Vercel's edge (which overwrites any client-supplied value). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
