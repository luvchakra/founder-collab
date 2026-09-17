/**
 * The dashboard's batched account scan. Its whole reason to exist is round-trip count:
 * one query per table for the entire account rather than one per business/product, which
 * is what lets the header's alert derivation and the dashboard's own filtering work from
 * the same in-memory result instead of issuing their own queries.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  createCoreClient: vi.fn(),
  getWorkspaceUsageForWorkspaces: vi.fn(),
  getProspectCountsForWorkspaces: vi.fn(),
  listProspectsForWorkspaces: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));
vi.mock("../usage/queries", () => ({ getWorkspaceUsageForWorkspaces: h.getWorkspaceUsageForWorkspaces }));
vi.mock("../prospects/queries", () => ({
  getProspectCountsForWorkspaces: h.getProspectCountsForWorkspaces,
  listProspectsForWorkspaces: h.listProspectsForWorkspaces,
}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

const { getAccountUsageAndProspects, getAccountWorkspaceEntries } = await import("./queries");

const BUSINESS = { id: "biz-1", name: "Acme Co", account_id: "acct-1" };
const PRODUCT = { id: "prod-1", business_id: "biz-1", name: "Widgets" };
const WORKSPACE = { id: "w1", product_id: "prod-1" };

function mock(businesses: unknown[], productRows: unknown[], error: unknown = null) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) =>
      call.table === "businesses" ? { data: businesses, error } : { data: productRows, error },
  });
  h.createClient.mockResolvedValue(supabase);
  h.createCoreClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getWorkspaceUsageForWorkspaces.mockResolvedValue({ w1: { totalRuns: 1, totalCost: 1 } });
  h.getProspectCountsForWorkspaces.mockResolvedValue({ w1: { total: 3 } });
  h.listProspectsForWorkspaces.mockResolvedValue([{ id: "p1", workspace_id: "w1" }]);
});

describe("getAccountWorkspaceEntries", () => {
  it("reads businesses from core and products from discovery, oldest first", async () => {
    const supabase = mock([BUSINESS], [{ ...PRODUCT, workspaces: [WORKSPACE] }]);

    await getAccountWorkspaceEntries("acct-1");

    expect(h.createCoreClient).toHaveBeenCalledWith({ schema: "core" });
    expect(eqFilters(supabase.queries("businesses")[0]!)).toEqual({ account_id: "acct-1" });
    expect(opArgs(supabase.queries("businesses")[0]!, "order")).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("fetches every business's products in one query, not one per business", async () => {
    const supabase = mock(
      [BUSINESS, { ...BUSINESS, id: "biz-2" }],
      [{ ...PRODUCT, workspaces: [WORKSPACE] }],
    );

    await getAccountWorkspaceEntries("acct-1");

    expect(supabase.queries("products")).toHaveLength(1);
    expect(opArgs(supabase.queries("products")[0]!, "in")).toEqual([
      "business_id",
      ["biz-1", "biz-2"],
    ]);
  });

  it("pairs each product's workspace with its product and business", async () => {
    mock([BUSINESS], [{ ...PRODUCT, workspaces: [WORKSPACE] }]);

    const { entries } = await getAccountWorkspaceEntries("acct-1");

    expect(entries).toEqual([
      { workspace: WORKSPACE, product: PRODUCT, business: BUSINESS },
    ]);
  });

  it("groups products under their business and lists them flat as well", async () => {
    mock([BUSINESS], [{ ...PRODUCT, workspaces: [WORKSPACE] }]);

    const { productsByBusiness, allProducts } = await getAccountWorkspaceEntries("acct-1");

    expect(productsByBusiness).toEqual({ "biz-1": [PRODUCT] });
    expect(allProducts).toEqual([PRODUCT]);
  });

  it("gives every business an entry in the map, even with no products", async () => {
    mock([BUSINESS], []);

    const { productsByBusiness, entries } = await getAccountWorkspaceEntries("acct-1");

    expect(productsByBusiness).toEqual({ "biz-1": [] });
    expect(entries).toEqual([]);
  });

  it("skips a product whose workspace has not been created yet", async () => {
    mock([BUSINESS], [{ ...PRODUCT, workspaces: [] }]);

    const { entries, allProducts } = await getAccountWorkspaceEntries("acct-1");

    expect(entries).toEqual([]);
    expect(allProducts).toEqual([PRODUCT]);
  });

  it("ignores a product row whose business is not visible", async () => {
    mock([BUSINESS], [{ ...PRODUCT, business_id: "biz-other", workspaces: [WORKSPACE] }]);

    const { entries, allProducts } = await getAccountWorkspaceEntries("acct-1");

    expect(entries).toEqual([]);
    expect(allProducts).toEqual([]);
  });

  it("issues no product query at all for an account with no businesses", async () => {
    const supabase = mock([], []);

    const result = await getAccountWorkspaceEntries("acct-1");

    expect(supabase.queries("products")).toEqual([]);
    expect(result).toEqual({ businesses: [], productsByBusiness: {}, allProducts: [], entries: [] });
  });

  it("treats a null business result as none", async () => {
    mock(null as unknown as unknown[], []);

    await expect(getAccountWorkspaceEntries("acct-1")).resolves.toMatchObject({ businesses: [] });
  });

  it.each([
    ["the business query", "businesses"],
    ["the product query", "products"],
  ])("propagates a failure from %s", async (_label, table) => {
    const supabase = createFakeSupabase({
      query: (call) =>
        call.table === table
          ? { data: null, error: new Error("denied") }
          : { data: table === "businesses" ? [] : [BUSINESS], error: null },
    });
    h.createClient.mockResolvedValue(supabase);
    h.createCoreClient.mockResolvedValue(supabase);

    await expect(getAccountWorkspaceEntries("acct-1")).rejects.toThrow("denied");
  });
});

describe("getAccountUsageAndProspects", () => {
  it("fetches usage, counts and prospects for every workspace on the account", async () => {
    mock([BUSINESS], [{ ...PRODUCT, workspaces: [WORKSPACE] }]);

    const result = await getAccountUsageAndProspects("acct-1");

    for (const fn of [
      h.getWorkspaceUsageForWorkspaces,
      h.getProspectCountsForWorkspaces,
      h.listProspectsForWorkspaces,
    ]) {
      expect(fn).toHaveBeenCalledWith(["w1"]);
    }
    expect(result).toMatchObject({
      usageByWorkspace: { w1: { totalRuns: 1, totalCost: 1 } },
      countsByWorkspace: { w1: { total: 3 } },
      prospects: [{ id: "p1", workspace_id: "w1" }],
    });
  });

  it("asks for nothing when the account has no workspaces", async () => {
    mock([], []);

    await getAccountUsageAndProspects("acct-1");

    expect(h.getWorkspaceUsageForWorkspaces).toHaveBeenCalledWith([]);
  });

  it("treats a products query that returns nothing as no products", async () => {
    mock([{ id: "biz-1", account_id: "acct-1" }], null as unknown as unknown[]);

    const result = await getAccountWorkspaceEntries("acct-1");

    expect(result.allProducts).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.productsByBusiness).toEqual({ "biz-1": [] });
  });
});
