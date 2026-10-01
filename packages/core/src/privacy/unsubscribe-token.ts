import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Signed one-click unsubscribe tokens for outbound email (RFC 8058 List-Unsubscribe-
 * Post; GDPR Art. 21(2)-(3) objection to direct marketing; DPDP s.6(4) withdrawal "with
 * comparable ease"). The token names the business and a SHA-256 of the recipient
 * address -- never the address itself -- so the link leaks nothing if forwarded, and the
 * unsubscribe endpoint can record the suppression without ever learning the address.
 *
 * Keyed by an HKDF-derived subkey of API_KEY_ENCRYPTION_SECRET (already required for
 * BYOK) rather than a new secret; the "unsubscribe" info label keeps it independent of
 * the encryption key itself.
 */
function signingKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not configured");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "base64"), Buffer.alloc(0), "cofounderai:unsubscribe:v1", 32));
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createUnsubscribeToken(businessId: string, emailHash: string): string {
  const payload = `${businessId}.${emailHash}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): { businessId: string; emailHash: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [businessId, emailHash, signature] = parts as [string, string, string];
  if (!UUID_RE.test(businessId) || !/^[0-9a-f]{64}$/.test(emailHash)) return null;
  const expected = Buffer.from(sign(`${businessId}.${emailHash}`));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return { businessId, emailHash };
}
