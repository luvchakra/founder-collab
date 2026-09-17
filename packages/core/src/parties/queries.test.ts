/**
 * Read side of the party model. The point of these is tenant scoping and the role join:
 * a party with two roles must appear in both role lists (that is the model working, not a
 * duplicate), and every list must be filtered by business.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const {
  getParty,
  getSupplierAttrs,
  listContactsForParty,
  listPartiesByRole,
  listPartiesForBusiness,
  listRolesForParty,
} = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const PARTY = "p0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listPartiesForBusiness", () => {
  it("filters by business", async () => {
    const supabase = mock([{ id: PARTY }]);

    await listPartiesForBusiness(BUSINESS);

    expect(eqFilters(supabase.queries("parties")[0]!)).toEqual({ business_id: BUSINESS });
  });

  it("propagates an error", async () => {
    mock(null, new Error("denied"));
    await expect(listPartiesForBusiness(BUSINESS)).rejects.toThrow("denied");
  });
});

describe("listPartiesByRole", () => {
  it("inner-joins party_roles so only parties holding the role come back", async () => {
    const supabase = mock([]);

    await listPartiesByRole(BUSINESS, "supplier");

    const call = supabase.queries("parties")[0]!;
    expect(opArgs(call, "select")![0]).toContain("party_roles!inner(role)");
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS, "party_roles.role": "supplier" });
  });

  it("queries each role independently, so a multi-role party appears in both lists", async () => {
    const asCustomer = mock([{ id: PARTY }]);
    await listPartiesByRole(BUSINESS, "customer");
    const asSupplier = mock([{ id: PARTY }]);
    await listPartiesByRole(BUSINESS, "supplier");

    expect(eqFilters(asCustomer.queries("parties")[0]!)["party_roles.role"]).toBe("customer");
    expect(eqFilters(asSupplier.queries("parties")[0]!)["party_roles.role"]).toBe("supplier");
  });
});

describe("getParty", () => {
  it("returns the party", async () => {
    mock({ id: PARTY, name: "Acme" });
    await expect(getParty(PARTY)).resolves.toMatchObject({ id: PARTY });
  });

  it("returns null for a party the caller cannot see", async () => {
    mock(null);
    await expect(getParty(PARTY)).resolves.toBeNull();
  });
});

describe("listRolesForParty", () => {
  it("flattens the rows to bare role names", async () => {
    mock([{ role: "prospect" }, { role: "customer" }]);

    await expect(listRolesForParty(PARTY)).resolves.toEqual(["prospect", "customer"]);
  });

  it("returns an empty list for a party with no roles", async () => {
    mock([]);
    await expect(listRolesForParty(PARTY)).resolves.toEqual([]);
  });

  it("scopes to the party", async () => {
    const supabase = mock([]);

    await listRolesForParty(PARTY);

    expect(eqFilters(supabase.queries("party_roles")[0]!)).toEqual({ party_id: PARTY });
  });
});

describe("listContactsForParty", () => {
  it("scopes to the party", async () => {
    const supabase = mock([]);

    await listContactsForParty(PARTY);

    expect(eqFilters(supabase.queries("party_contacts")[0]!)).toEqual({ party_id: PARTY });
  });
});

describe("getSupplierAttrs", () => {
  it("returns null for a party with no supplier attrs", async () => {
    mock(null);
    await expect(getSupplierAttrs(PARTY)).resolves.toBeNull();
  });

  it("returns the attrs row when present", async () => {
    mock({ party_id: PARTY, lead_time_days: 7 });
    await expect(getSupplierAttrs(PARTY)).resolves.toMatchObject({ lead_time_days: 7 });
  });
});
