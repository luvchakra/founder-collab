// API key resolution for the public REST API, promoted from stockpilot-ai-ops's
// src/lib/api-v1/auth.server.ts. Runs entirely as service_role (there's no Supabase
// session on an incoming API request), so it is solely responsible for two things
// ordinary RLS/has_permission() would otherwise provide for free: scoping every
// downstream query to the key's own business_id, and checking the key's permission
// snapshot before any write. See the migration's header comment
// (20260907210000_core_api_keys.sql) for why the snapshot is fixed at creation time
// rather than a live pointer to the issuing user's role.
import { createHash } from "node:crypto";
import { createAdminClient } from "../db/admin";
import { ApiError } from "./response";

export interface ApiKeyContext {
  id: string;
  businessId: string;
  createdBy: string;
  permissions: string[];
}

// A sane default requests-per-minute-per-business ceiling. Tiering by plan is a
// fast-follow once a pricing model exists to hang tiers off of.
const RATE_LIMIT_PER_MINUTE = 120;

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function resolveApiKey(request: Request): Promise<ApiKeyContext> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(sk_live_[a-f0-9]{32,})$/.exec(header.trim());
  if (!match) {
    throw new ApiError(
      401,
      "unauthorized",
      "Missing or malformed Authorization header. Expected 'Authorization: Bearer sk_live_...'.",
    );
  }
  const hash = hashApiKey(match[1]!);

  const supabase = createAdminClient({ schema: "core" });

  const { data: secret } = await supabase
    .from("api_key_secrets")
    .select("api_key_id")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!secret) {
    throw new ApiError(401, "unauthorized", "Invalid API key.");
  }

  const { data: key } = await supabase
    .from("api_keys")
    .select("id, business_id, created_by, permissions, revoked_at")
    .eq("id", secret.api_key_id)
    .maybeSingle();
  if (!key) {
    throw new ApiError(401, "unauthorized", "Invalid API key.");
  }
  if (key.revoked_at) {
    throw new ApiError(401, "unauthorized", "This API key has been revoked.");
  }

  // Best-effort, fire-and-forget -- a failed audit-timestamp write should never block
  // the actual request.
  void supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  const { data: withinLimit, error: limitError } = await supabase.rpc("check_api_rate_limit", {
    _business_id: key.business_id,
    _limit: RATE_LIMIT_PER_MINUTE,
  });
  if (limitError) {
    throw new ApiError(500, "internal_error", "Could not verify the request rate limit.");
  }
  if (withinLimit === false) {
    throw new ApiError(
      429,
      "rate_limited",
      `This business has exceeded ${RATE_LIMIT_PER_MINUTE} requests/minute. Try again shortly.`,
    );
  }

  return {
    id: key.id,
    businessId: key.business_id,
    createdBy: key.created_by,
    permissions: key.permissions ?? [],
  };
}

export function requirePermission(ctx: ApiKeyContext, permission: string): void {
  if (!ctx.permissions.includes(permission)) {
    throw new ApiError(
      403,
      "forbidden",
      `This API key does not have the '${permission}' permission. Reissue it from a role that has it.`,
    );
  }
}
