import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta's webhook signature scheme (shared by the Messenger/Instagram Graph API and the
 * WhatsApp Business Platform Cloud API -- both webhook families sign identically):
 * `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw request body, keyed by the
 * receiving app's App Secret>`. Verified manually here rather than pulling in a Meta SDK
 * for one check, same reasoning apps/web/app/api/webhooks/email-status/route.ts's own
 * verifySignature already used for Resend's Svix scheme.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header) return false;
  const [scheme, hexSignature] = header.split("=");
  if (scheme !== "sha256" || !hexSignature) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedBuf = Buffer.from(hexSignature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Meta's one-time webhook-registration handshake (GET with hub.mode=subscribe,
 * hub.verify_token, hub.challenge) -- required before Meta will start POSTing events at
 * all. `verifyToken` is a value you choose and enter into the Meta App dashboard's own
 * webhook config, compared against what Meta echoes back.
 */
export function verifyMetaSubscription(
  searchParams: URLSearchParams,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}
