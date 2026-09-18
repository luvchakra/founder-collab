/**
 * `addAddress` has one piece of real logic: promoting a new address to primary must first
 * demote the existing primary of the same kind, or core.addresses' partial unique index
 * rejects the insert. That demote must be scoped to the same party AND the same kind — a
 * demote that was too broad would silently clear an unrelated primary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, usedOp, writtenRow, type RecordedQuery } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { addAddress, upsertTaxIdentity } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const PARTY = "p0000000-0000-0000-0000-000000000001";

function mock(responder?: (call: RecordedQuery) => { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ query: responder ?? (() => ({ data: { id: "a1" }, error: null })) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

const BASE = { businessId: BUSINESS, partyId: PARTY, kind: "billing" as const };

beforeEach(() => vi.clearAllMocks());

describe("addAddress", () => {
  it("nulls every unset field and defaults is_primary to false", async () => {
    const supabase = mock();

    await addAddress(BASE);

    expect(writtenRow(supabase.queries("addresses")[0]!)).toEqual({
      business_id: BUSINESS,
      party_id: PARTY,
      kind: "billing",
      is_primary: false,
      formatted: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      latitude: null,
      longitude: null,
    });
  });

  it("does not demote anything when the new address is not primary", async () => {
    const supabase = mock();

    await addAddress(BASE);

    expect(supabase.queries("addresses")).toHaveLength(1);
    expect(usedOp(supabase.queries("addresses")[0]!, "update")).toBe(false);
  });

  it("demotes the existing primary of the same kind before inserting", async () => {
    const supabase = mock();

    await addAddress({ ...BASE, isPrimary: true });

    const demote = supabase.queries("addresses")[0]!;
    expect(writtenRow(demote)).toEqual({ is_primary: false });
    expect(eqFilters(demote)).toEqual({ party_id: PARTY, kind: "billing", is_primary: true });
  });

  it("inserts the new address as primary after demoting, in that order", async () => {
    const supabase = mock();

    await addAddress({ ...BASE, isPrimary: true });

    expect(supabase.queries("addresses")).toHaveLength(2);
    expect(writtenRow(supabase.queries("addresses")[1]!)).toMatchObject({ is_primary: true });
  });

  it("does not insert if the demote failed — the unique index would reject it anyway", async () => {
    const supabase = mock((call) =>
      usedOp(call, "update") ? { data: null, error: new Error("demote denied") } : { data: {}, error: null },
    );

    await expect(addAddress({ ...BASE, isPrimary: true })).rejects.toThrow("demote denied");
    expect(supabase.queries("addresses")).toHaveLength(1);
  });

  it("carries coordinates and a zero latitude through", async () => {
    const supabase = mock();

    await addAddress({ ...BASE, latitude: 0, longitude: 73.85, city: "Pune", country: "India" });

    expect(writtenRow(supabase.queries("addresses")[0]!)).toMatchObject({
      latitude: 0,
      longitude: 73.85,
      city: "Pune",
      country: "India",
    });
  });

  it("propagates a failed insert", async () => {
    mock(() => ({ data: null, error: new Error("insert denied") }));
    await expect(addAddress(BASE)).rejects.toThrow("insert denied");
  });
});

describe("upsertTaxIdentity", () => {
  it("upserts on party_id, defaulting the registration type to regular", async () => {
    const supabase = mock();

    await upsertTaxIdentity({ businessId: BUSINESS, partyId: PARTY });

    expect(opArgs(supabase.queries("tax_identities")[0]!, "upsert")).toEqual([
      {
        party_id: PARTY,
        business_id: BUSINESS,
        gstin: null,
        state: null,
        gst_registration_type: "regular",
      },
      { onConflict: "party_id" },
    ]);
  });

  it("carries a GSTIN, state and registration type through", async () => {
    const supabase = mock();

    await upsertTaxIdentity({
      businessId: BUSINESS,
      partyId: PARTY,
      gstin: "27AAAAA0000A1Z5",
      state: "MH",
      gstRegistrationType: "composition",
    });

    expect(opArgs(supabase.queries("tax_identities")[0]!, "upsert")![0]).toMatchObject({
      gstin: "27AAAAA0000A1Z5",
      state: "MH",
      gst_registration_type: "composition",
    });
  });

  it("propagates a failure", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(upsertTaxIdentity({ businessId: BUSINESS, partyId: PARTY })).rejects.toThrow("denied");
  });
});
