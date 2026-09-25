import { createHash, randomBytes } from "node:crypto";

/**
 * FND-12 — data-room file rules and share tokens.
 *
 * Documents only: the formats investors actually open. The declared type must agree with
 * the extension (a `.pdf` claiming `text/html` is refused), and the size stays under
 * what a server action can carry on Vercel.
 */

export const MAX_DATA_ROOM_BYTES = 4 * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  csv: ["text/csv", "application/vnd.ms-excel"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
};

export function validateDataRoomFile(file: { name: string; type: string; size: number }): { ok: true } | { ok: false; reason: string } {
  if (file.size <= 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_DATA_ROOM_BYTES) {
    return { ok: false, reason: `Files must be ${MAX_DATA_ROOM_BYTES / (1024 * 1024)} MB or smaller.` };
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const mimes = ALLOWED[ext];
  if (!mimes) return { ok: false, reason: "Upload a PDF, Word, Excel, PowerPoint, CSV or image file." };
  if (!mimes.includes(file.type)) return { ok: false, reason: "The file's type does not match its extension." };
  return { ok: true };
}

/**
 * A share link's secret: 32 random bytes, URL-safe. Only its SHA-256 is stored
 * (`data_room_shares.token_hash`), so the link can be shown once to the founder and never
 * reconstructed from the database.
 */
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A token is 43 base64url characters; anything else is not worth a database lookup. */
export function isWellFormedShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type ShareVerdict =
  | { ok: true }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "item_unavailable" };

/** Whether a share may be used right now (§29.6: expiry and revocation are enforced). */
export function checkShare(
  share: { revokedAt: string | null; expiresAt: string } | null,
  item: { attachmentId: string | null; status: string; expiresAt: string | null } | null,
  now: Date,
): ShareVerdict {
  if (!share) return { ok: false, reason: "not_found" };
  if (share.revokedAt) return { ok: false, reason: "revoked" };
  if (new Date(share.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (!item || !item.attachmentId || item.status === "missing" || item.status === "expired") {
    return { ok: false, reason: "item_unavailable" };
  }
  if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true };
}
