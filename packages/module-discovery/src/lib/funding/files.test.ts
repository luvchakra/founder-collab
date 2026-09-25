/** FND-12. Data-room uploads and share links: what is refused, and why. */
import { describe, expect, it } from "vitest";
import { checkShare, hashShareToken, isWellFormedShareToken, MAX_DATA_ROOM_BYTES, newShareToken, validateDataRoomFile } from "./files";

describe("validateDataRoomFile", () => {
  it("accepts documents whose type matches their extension", () => {
    expect(validateDataRoomFile({ name: "deck.pdf", type: "application/pdf", size: 10 }).ok).toBe(true);
  });

  it("refuses mismatched types, unknown formats and oversize files", () => {
    expect(validateDataRoomFile({ name: "deck.pdf", type: "text/html", size: 10 }).ok).toBe(false);
    expect(validateDataRoomFile({ name: "run.sh", type: "text/x-sh", size: 10 }).ok).toBe(false);
    expect(validateDataRoomFile({ name: "deck.pdf", type: "application/pdf", size: MAX_DATA_ROOM_BYTES + 1 }).ok).toBe(false);
  });
});

describe("share tokens", () => {
  it("stores only a hash, and the hash matches the token", () => {
    const { token, hash } = newShareToken();
    expect(isWellFormedShareToken(token)).toBe(true);
    expect(hash).toBe(hashShareToken(token));
    expect(hash).not.toContain(token);
  });

  it("rejects malformed tokens before any lookup", () => {
    expect(isWellFormedShareToken("../../etc")).toBe(false);
    expect(isWellFormedShareToken("")).toBe(false);
  });
});

describe("checkShare", () => {
  const now = new Date("2026-09-25T00:00:00Z");
  const item = { attachmentId: "a1", status: "shared", expiresAt: null };

  it("allows a live share of an available document", () => {
    expect(checkShare({ revokedAt: null, expiresAt: "2026-10-01T00:00:00Z" }, item, now)).toEqual({ ok: true });
  });

  it("enforces revocation, expiry and document availability", () => {
    expect(checkShare({ revokedAt: "2026-09-20T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z" }, item, now)).toMatchObject({ reason: "revoked" });
    expect(checkShare({ revokedAt: null, expiresAt: "2026-09-24T00:00:00Z" }, item, now)).toMatchObject({ reason: "expired" });
    expect(checkShare({ revokedAt: null, expiresAt: "2026-10-01T00:00:00Z" }, { ...item, status: "missing" }, now)).toMatchObject({
      reason: "item_unavailable",
    });
    expect(
      checkShare({ revokedAt: null, expiresAt: "2026-10-01T00:00:00Z" }, { ...item, expiresAt: "2026-09-01T00:00:00Z" }, now),
    ).toMatchObject({ reason: "expired" });
    expect(checkShare(null, item, now)).toMatchObject({ reason: "not_found" });
  });
});
