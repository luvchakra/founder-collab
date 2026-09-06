import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM application-level encryption for BYOK provider API keys at rest
// (docs/byok-ai-requirements.md). Kept application-level rather than Supabase
// Vault/pgsodium to match every other secret in this codebase.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function encryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not configured");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error("API_KEY_ENCRYPTION_SECRET must decode to exactly 32 bytes");
  }
  return key;
}

/** Encrypts a provider API key for storage in ai_provider_credentials.encrypted_api_key.
 * Output packs iv + authTag + ciphertext into one base64 string. */
export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptApiKey. Only ever called by the router's internal credential
 * lookup immediately before a single request -- never by the UI-facing queries layer. */
export function decryptApiKey(encrypted: string): string {
  const packed = Buffer.from(encrypted, "base64");
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = packed.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Non-reversible fingerprint for masked display (e.g. "sk-...a1b2") without ever
 * decrypting -- stored alongside the ciphertext so the UI can show it kept a key was set. */
export function fingerprintApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex").slice(0, 8);
}
