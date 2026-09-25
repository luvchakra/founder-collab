/**
 * FND-12. A share link is authorised by the link alone: wrong, revoked or expired tokens
 * get nothing (and no signed URL is minted), and every successful open is recorded.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase, eqFilters } from "@cofounderai/core/test-support/fake-supabase";
import { newShareToken } from "./files";
import { resolveShareAccess } from "./share-access";

const NOW = new Date("2026-09-25T00:00:00Z");
const share = {
  id: "s1",
  business_id: "b1",
  data_room_item_id: "d1",
  permission: "download",
  expires_at: "2026-10-01T00:00:00Z",
  revoked_at: null as string | null,
};

function clients(overrides: { share?: typeof share | null; item?: Record<string, unknown> | null } = {}) {
  const discovery = createFakeSupabase({
    query: (call) => {
      if (call.table === "data_room_shares") return { data: overrides.share === undefined ? share : overrides.share, error: null };
      if (call.table === "data_room_items") {
        return { data: overrides.item === undefined ? { attachment_id: "a1", status: "shared", expires_at: null, name: "Deck" } : overrides.item, error: null };
      }
      return { data: null, error: null };
    },
  });
  const core = createFakeSupabase({
    query: () => ({ data: { storage_bucket: "attachments", storage_path: "b1/a1/deck.pdf", file_name: "deck.pdf" }, error: null }),
    storage: () => ({ data: { signedUrl: "https://storage.example/signed" }, error: null }),
  });
  return { discovery, core, pair: { discovery: discovery as unknown as SupabaseClient, core: core as unknown as SupabaseClient } };
}

describe("resolveShareAccess", () => {
  it("refuses a malformed token without touching the database", async () => {
    const c = clients();
    await expect(resolveShareAccess("../etc", c.pair, { userAgent: null, now: NOW })).resolves.toEqual({ ok: false, reason: "malformed" });
    expect(c.discovery.calls).toHaveLength(0);
  });

  it("looks the share up by the token's hash and records the access", async () => {
    const c = clients();
    const { token, hash } = newShareToken();
    const result = await resolveShareAccess(token, c.pair, { userAgent: "Mozilla", now: NOW });
    expect(result).toEqual({ ok: true, url: "https://storage.example/signed" });
    expect(eqFilters(c.discovery.queries("data_room_shares")[0]!)).toMatchObject({ token_hash: hash });
    expect(c.discovery.queries("data_room_access_events")).toHaveLength(1);
  });

  it("mints nothing for a revoked or expired link", async () => {
    const revoked = clients({ share: { ...share, revoked_at: "2026-09-20T00:00:00Z" } });
    await expect(resolveShareAccess(newShareToken().token, revoked.pair, { userAgent: null, now: NOW })).resolves.toMatchObject({ reason: "revoked" });
    expect(revoked.core.storageCalls()).toHaveLength(0);

    const expired = clients({ share: { ...share, expires_at: "2026-09-24T00:00:00Z" } });
    await expect(resolveShareAccess(newShareToken().token, expired.pair, { userAgent: null, now: NOW })).resolves.toMatchObject({ reason: "expired" });
    expect(expired.discovery.queries("data_room_access_events")).toHaveLength(0);
  });

  it("reports an unknown link as not found", async () => {
    const c = clients({ share: null });
    await expect(resolveShareAccess(newShareToken().token, c.pair, { userAgent: null, now: NOW })).resolves.toMatchObject({ reason: "not_found" });
  });
});
