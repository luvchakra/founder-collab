import { createHash, randomBytes } from "node:crypto";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";

// Same "random secret, sha256 hash stored, service-role lookup" scheme as
// core/api-v1/keys (packages/core/src/api-v1/{keys/mutations,auth.server}.ts) -- the
// closest existing precedent for a token that must be resolvable with no Supabase
// session at all (a customer clicking an emailed link has no auth.uid()).
export function generatePortalToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashPortalToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type PortalTokenScope = "estimate" | "invoice" | "center";

export interface PortalTokenContext {
  id: string;
  businessId: string;
  partyId: string;
  documentId: string;
}

export class PortalTokenError extends Error {
  constructor(public code: "invalid" | "rate_limited") {
    super(code === "rate_limited" ? "Too many requests -- try again shortly." : "This link is invalid or has expired.");
  }
}

const RATE_LIMIT_PER_MINUTE = 30;

/** Resolves a raw token from a public URL to its business/party/document, entirely via
 * the service-role client -- there is no Supabase session on a public request. Throws
 * `PortalTokenError` rather than returning null so the public page can tell "bad link"
 * apart from "rate limited" (both are still errors the visitor sees, just different
 * copy). Rate limiting reuses `core.check_api_rate_limit()` (built for the public API
 * key layer, but generically keyed by business_id -- no new counter table needed). */
export async function resolvePortalToken(rawToken: string, scope: PortalTokenScope): Promise<PortalTokenContext> {
  const fsm = createCoreAdminClient({ schema: "fsm" });
  const tokenHash = hashPortalToken(rawToken);

  const { data: token } = await fsm
    .from("portal_tokens")
    .select("id, business_id, party_id, document_id, expires_at")
    .eq("token_hash", tokenHash)
    .eq("scope", scope)
    .maybeSingle();
  if (!token || !token.document_id || new Date(token.expires_at).getTime() < Date.now()) {
    throw new PortalTokenError("invalid");
  }

  const core = createCoreAdminClient({ schema: "core" });
  const { data: withinLimit, error: limitError } = await core.rpc("check_api_rate_limit", {
    _business_id: token.business_id,
    _limit: RATE_LIMIT_PER_MINUTE,
  });
  if (limitError || withinLimit === false) {
    throw new PortalTokenError("rate_limited");
  }

  // Best-effort, fire-and-forget -- matches resolveApiKey()'s own last_used_at update.
  void fsm.from("portal_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);

  return { id: token.id, businessId: token.business_id, partyId: token.party_id, documentId: token.document_id };
}

export interface CenterTokenContext {
  id: string;
  businessId: string;
  partyId: string;
}

/** Same resolution as `resolvePortalToken`, minus the `document_id` requirement -- a
 * `center` token (F-10) is scoped to a customer across every one of their documents, not
 * one document, so `fsm.portal_tokens.document_id` is legitimately null for this scope. */
export async function resolveCenterToken(rawToken: string): Promise<CenterTokenContext> {
  const fsm = createCoreAdminClient({ schema: "fsm" });
  const tokenHash = hashPortalToken(rawToken);

  const { data: token } = await fsm
    .from("portal_tokens")
    .select("id, business_id, party_id, expires_at")
    .eq("token_hash", tokenHash)
    .eq("scope", "center")
    .maybeSingle();
  if (!token || new Date(token.expires_at).getTime() < Date.now()) {
    throw new PortalTokenError("invalid");
  }

  const core = createCoreAdminClient({ schema: "core" });
  const { data: withinLimit, error: limitError } = await core.rpc("check_api_rate_limit", {
    _business_id: token.business_id,
    _limit: RATE_LIMIT_PER_MINUTE,
  });
  if (limitError || withinLimit === false) {
    throw new PortalTokenError("rate_limited");
  }

  void fsm.from("portal_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);

  return { id: token.id, businessId: token.business_id, partyId: token.party_id };
}
