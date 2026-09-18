/**
 * The account scan behind the dashboard shell. What matters here is its shape on the
 * wire, not the SQL: the shell paints after two round trips (businesses, then slugs and
 * products *together*), and only the fuller `getAccountWorkspaceEntries` pays for the
 * workspace lookup that the alerts and credits meter need. The Supabase client is a
 * small recording fake -- each `.from()` call is logged with the order it was issued in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as string[],
  listWorkspacesForProducts: vi.fn(),
}));

/** A query builder that resolves to whatever `h.tables` holds for the table, whatever
 * filters are chained on -- these tests care about which tables are read and when, not
 * about filtering, which is Postgres's job. */
function fakeClient() {
  return {
    from(table: string) {
      h.calls.push(table);
      const rows = h.tables[table] ?? [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "order"]) {
        builder[method] = () => builder;
      }
      builder.then = (resolve: (v: { data: Row[]; error: null }) => void) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return builder;
    },
  };
}

vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("../../db/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("../tenancy/queries", () => ({
  listWorkspacesForProducts: h.listWorkspacesForProducts,
}));
vi.mock("../prospects/queries", () => ({
  getProspectCountsForWorkspaces: vi.fn(),
  listProspectsForWorkspaces: vi.fn(),
}));
vi.mock("../usage/queries", () => ({ getWorkspaceUsageForWorkspaces: vi.fn() }));

const { getAccountBusinesses, getAccountWorkspaceEntries } = await import("./queries");

beforeEach(() => {
  h.calls.length = 0;
  h.tables = {
    businesses: [
      { id: "b1", account_id: "acc", name: "Acme", logo_url: null },
      { id: "b2", account_id: "acc", name: "Beta", logo_url: null },
    ],
    business_settings: [{ business_id: "b1", slug: "acme" }],
    products: [
      { id: "p1", business_id: "b1", name: "Widget" },
      { id: "p2", business_id: "b2", name: "Gadget" },
      { id: "p3", business_id: "ghost", name: "Orphan" },
    ],
  };
  h.listWorkspacesForProducts.mockResolvedValue([{ id: "w1", product_id: "p1" }]);
});

describe("getAccountBusinesses", () => {
  it("reads the businesses first, then their slugs and products in the same round", async () => {
    await getAccountBusinesses("acc");

    expect(h.calls[0]).toBe("businesses");
    // Both follow-ups were issued before either answered -- one round trip, not two.
    expect(h.calls.slice(1).sort()).toEqual(["business_settings", "products"]);
  });

  it("attaches each business's slug, falling back to its id when none is set", async () => {
    const { businesses } = await getAccountBusinesses("acc");

    expect(businesses.map((b) => [b.id, b.slug])).toEqual([
      ["b1", "acme"],
      ["b2", "b2"],
    ]);
  });

  it("buckets products under their business and drops one whose business is not on the account", async () => {
    const { productsByBusiness, allProducts } = await getAccountBusinesses("acc");

    expect(Object.keys(productsByBusiness).sort()).toEqual(["b1", "b2"]);
    expect(productsByBusiness.b1?.map((p) => p.id)).toEqual(["p1"]);
    expect(productsByBusiness.b2?.map((p) => p.id)).toEqual(["p2"]);
    expect(allProducts.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("stops after the businesses query when the account has none", async () => {
    h.tables.businesses = [];

    const result = await getAccountBusinesses("acc");

    expect(result).toEqual({ businesses: [], productsByBusiness: {}, allProducts: [] });
    expect(h.calls).toEqual(["businesses"]);
  });

  it("never touches workspaces -- that is the fuller query's cost, not the shell's", async () => {
    await getAccountBusinesses("acc");

    expect(h.listWorkspacesForProducts).not.toHaveBeenCalled();
  });
});

describe("getAccountWorkspaceEntries", () => {
  it("adds one entry per product that has a workspace, keeping the shell's shape intact", async () => {
    const result = await getAccountWorkspaceEntries("acc");

    expect(h.listWorkspacesForProducts).toHaveBeenCalledWith(["p1", "p2"]);
    expect(result.entries).toEqual([
      {
        workspace: { id: "w1", product_id: "p1" },
        product: { id: "p1", business_id: "b1", name: "Widget" },
        business: expect.objectContaining({ id: "b1", slug: "acme" }),
      },
    ]);
    expect(result.businesses.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(result.allProducts.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
