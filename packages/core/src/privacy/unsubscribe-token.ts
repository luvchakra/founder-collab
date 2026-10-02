import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * PRIV-1: signed one-click unsubscribe tokens for a business's outreach email (RFC 8058
 * List-Unsubscribe-Post; GDPR Art. 21(2)-(3); DPDP Act s.6(4) "withdraw with comparable
 * ease").
 *
 * The token names the business and a SHA-256 of the recipient's normalised address --
 * never the address -- so a forwarded link leaks nothing, and the unsubscribe endpoint
 * records the opt-out without ever learning who it was for. The hash is the same one
 * `core.email_hash()` computes, so the stored suppression matches the next send.
 *
 * Keyed by an HKDF subkey of API_KEY_ENCRYPTION_SECRET (already required for BYOK keys)
 * rather than a new secret; the label keeps it independent of the encryption key itself.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;

export class UnsubscribeNotConfiguredError extends Error {
  constructor() {
    super("Unsubscribe links can't be signed: API_KEY_ENCRYPTION_SECRET is not configured.");
    this.name = "UnsubscribeNotConfiguredError";
  }
}

/** Same normalisation as `core.email_hash()`: trimmed, lower-cased, SHA-256, hex. */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

function signingKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new UnsubscribeNotConfiguredError();
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "base64"), Buffer.alloc(0), "cofounderai:unsubscribe:v1", 32));
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createUnsubscribeToken(businessId: string, hash: string): string {
  const payload = `${businessId}.${hash}`;
  return `${payload}.${sign(payload)}`;
}

/** Null for anything malformed, tampered with, or signed under another key. */
export function verifyUnsubscribeToken(token: string | null | undefined): { businessId: string; emailHash: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [businessId, hash, signature] = parts as [string, string, string];
  if (!UUID_RE.test(businessId) || !HASH_RE.test(hash)) return null;
  const expected = Buffer.from(sign(`${businessId}.${hash}`));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return { businessId, emailHash: hash };
}
