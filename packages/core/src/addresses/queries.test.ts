import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { getPrimaryAddress, getTaxIdentity, listAddressesForParty } = await import("./queries");

const PARTY = "p0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("address queries", () => {
  it("lists every address for a party", async () => {
    const supabase = mock([]);
    await listAddressesForParty(PARTY);
    expect(eqFilters(supabase.queries("addresses")[0]!)).toEqual({ party_id: PARTY });
  });

  it("narrows the primary lookup to party, kind and the primary flag", async () => {
    const supabase = mock(null);

    await getPrimaryAddress(PARTY, "shipping");

    expect(eqFilters(supabase.queries("addresses")[0]!)).toEqual({
      party_id: PARTY,
      kind: "shipping",
      is_primary: true,
    });
  });

  it("returns null when a party has no primary of that kind", async () => {
    mock(null);
    await expect(getPrimaryAddress(PARTY, "billing")).resolves.toBeNull();
  });

  it("returns null when a party has no tax identity on file", async () => {
    mock(null);
    await expect(getTaxIdentity(PARTY)).resolves.toBeNull();
  });

  it("returns the tax identity when present", async () => {
    mock({ party_id: PARTY, gstin: "27AAAAA0000A1Z5" });
    await expect(getTaxIdentity(PARTY)).resolves.toMatchObject({ gstin: "27AAAAA0000A1Z5" });
  });

  it.each([
    ["listAddressesForParty", () => listAddressesForParty(PARTY)],
    ["getPrimaryAddress", () => getPrimaryAddress(PARTY, "billing")],
    ["getTaxIdentity", () => getTaxIdentity(PARTY)],
  ])("%s propagates a failure", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});
