import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const {
  getItem,
  getItemInventoryAttrs,
  listItemCategoriesForBusiness,
  listItemsForBusiness,
  listTaxRates,
} = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("item queries", () => {
  it("lists categories for one business", async () => {
    const supabase = mock([]);
    await listItemCategoriesForBusiness(BUSINESS);
    expect(eqFilters(supabase.queries("item_categories")[0]!)).toEqual({ business_id: BUSINESS });
  });

  it("lists items for one business", async () => {
    const supabase = mock([]);
    await listItemsForBusiness(BUSINESS);
    expect(eqFilters(supabase.queries("items")[0]!)).toEqual({ business_id: BUSINESS });
  });

  it("returns null for an item the caller cannot see", async () => {
    mock(null);
    await expect(getItem("i1")).resolves.toBeNull();
  });

  it("returns the item when visible", async () => {
    mock({ id: "i1" });
    await expect(getItem("i1")).resolves.toMatchObject({ id: "i1" });
  });

  it("returns null inventory attrs for a non-stocked item", async () => {
    mock(null);
    await expect(getItemInventoryAttrs("i1")).resolves.toBeNull();
  });

  it("orders the tax-rate catalogue by rate and does not tenant-scope it", async () => {
    const supabase = mock([{ rate: 5 }, { rate: 18 }]);

    await listTaxRates();

    const call = supabase.queries("tax_rates")[0]!;
    expect(opArgs(call, "order")).toEqual(["rate"]);
    expect(eqFilters(call)).toEqual({});
  });

  it.each([
    ["listItemCategoriesForBusiness", () => listItemCategoriesForBusiness(BUSINESS)],
    ["listItemsForBusiness", () => listItemsForBusiness(BUSINESS)],
    ["getItem", () => getItem("i1")],
    ["getItemInventoryAttrs", () => getItemInventoryAttrs("i1")],
    ["listTaxRates", () => listTaxRates()],
  ])("%s propagates a failure", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});
