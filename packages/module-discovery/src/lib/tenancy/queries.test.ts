/**
 * The tenancy read layer. Its docstring states the rule these tests hold to: every read
 * runs as the authenticated user through RLS, never the service-role client, so a query
 * for an id the caller doesn't own returns zero rows rather than another tenant's data.
 *
 * `getAccountIdForWorkspace` gets the most attention because it is the chain the BYOK AI
 * router walks to decide *whose* API key pays for a workspace's AI call — and because its
 * webhook path deliberately swaps in an admin client for the `core`-schema hop only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  createCoreClient: vi.fn(),
  createCoreAdminClient: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: h.createCoreAdminClient }));
// React's cache() memoizes per request; in tests each call should stand alone.
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

const {
  getAccountIdForWorkspace,
  getBusiness,
  getBusinessIdForWorkspace,
  getCurrentAccount,
  getFirstWorkspaceForAccount,
  getFirstWorkspaceForBusiness,
  getProduct,
  getWorkspace,
  getWorkspaceForProduct,
  listBusinesses,
  listProducts,
  listWorkspacesForProducts,
  requireUser,
} = await import("./queries");

/** One responder serves both the discovery-scoped and core-scoped clients. */
function mockAll(responder: (call: RecordedQuery) => { data: unknown; error: unknown }, user: unknown = { id: "u1" }) {
  const supabase = Object.assign(createFakeSupabase({ query: responder }), {
    auth: { getUser: async () => ({ data: { user } }) },
  });
  h.createClient.mockResolvedValue(supabase);
  h.createCoreClient.mockResolvedValue(supabase);
  h.createCoreAdminClient.mockReturnValue(supabase);
  return supabase;
}

const constant = (data: unknown, error: unknown = null) => () => ({ data, error });

beforeEach(() => vi.clearAllMocks());

describe("requireUser", () => {
  it("returns the signed-in user", async () => {
    mockAll(constant(null), { id: "u1", email: "a@b.com" });

    await expect(requireUser()).resolves.toMatchObject({ id: "u1" });
  });

  it("throws when there is no session", async () => {
    mockAll(constant(null), null);

    await expect(requireUser()).rejects.toThrow("Not authenticated.");
  });
});

describe("account and business reads", () => {
  it("takes the earliest account as the current one (one account per user in the MVP)", async () => {
    const supabase = mockAll(constant({ id: "acct-1" }));

    await getCurrentAccount();

    const call = supabase.queries("accounts")[0]!;
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: true }]);
    expect(opArgs(call, "limit")).toEqual([1]);
  });

  it("reads accounts and businesses through the core schema, not discovery's", async () => {
    mockAll(constant({ id: "acct-1" }));

    await getCurrentAccount();
    await listBusinesses("acct-1");

    expect(h.createCoreClient).toHaveBeenCalledWith({ schema: "core" });
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("lists an account's businesses oldest first", async () => {
    const supabase = mockAll(constant([]));

    await listBusinesses("acct-1");

    const call = supabase.queries("businesses")[0]!;
    expect(eqFilters(call)).toEqual({ account_id: "acct-1" });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: true }]);
  });

  it("returns null for a business the caller cannot see", async () => {
    mockAll(constant(null));

    await expect(getBusiness("biz-1")).resolves.toBeNull();
  });

  it("uses a caller-supplied client for the business lookup when given one", async () => {
    const supplied = createFakeSupabase({ query: constant({ id: "biz-1" }) });
    mockAll(constant(null));

    await getBusiness("biz-1", supplied as never);

    expect(h.createCoreClient).not.toHaveBeenCalled();
    expect(supplied.queries("businesses")).toHaveLength(1);
  });
});

describe("product and workspace reads", () => {
  it("lists a business's products oldest first, through discovery's schema", async () => {
    const supabase = mockAll(constant([]));

    await listProducts("biz-1");

    expect(h.createClient).toHaveBeenCalled();
    expect(eqFilters(supabase.queries("products")[0]!)).toEqual({ business_id: "biz-1" });
  });

  it("returns null for a product the caller cannot see", async () => {
    mockAll(constant(null));
    await expect(getProduct("prod-1")).resolves.toBeNull();
  });

  it("finds a product's single workspace", async () => {
    const supabase = mockAll(constant({ id: "w1" }));

    await expect(getWorkspaceForProduct("prod-1")).resolves.toMatchObject({ id: "w1" });
    expect(eqFilters(supabase.queries("workspaces")[0]!)).toEqual({ product_id: "prod-1" });
  });

  it("batches workspace lookups into one query", async () => {
    const supabase = mockAll(constant([]));

    await listWorkspacesForProducts(["p1", "p2", "p3"]);

    expect(supabase.queries("workspaces")).toHaveLength(1);
    expect(opArgs(supabase.queries("workspaces")[0]!, "in")).toEqual(["product_id", ["p1", "p2", "p3"]]);
  });

  it("short-circuits the batch for an empty product list, issuing no query", async () => {
    const supabase = mockAll(constant([]));

    await expect(listWorkspacesForProducts([])).resolves.toEqual([]);
    expect(supabase.queries()).toEqual([]);
  });

  it("returns null for a workspace the caller cannot see", async () => {
    mockAll(constant(null));
    await expect(getWorkspace("w1")).resolves.toBeNull();
  });
});

describe("getFirstWorkspaceForBusiness", () => {
  it("returns the first product's workspace", async () => {
    mockAll((call) =>
      call.table === "products"
        ? { data: [{ id: "p1" }, { id: "p2" }], error: null }
        : { data: { id: "w1", product_id: "p1" }, error: null },
    );

    await expect(getFirstWorkspaceForBusiness("biz-1")).resolves.toMatchObject({ id: "w1" });
  });

  it("returns null when the business has no products", async () => {
    mockAll((call) => (call.table === "products" ? { data: [], error: null } : { data: null, error: null }));

    await expect(getFirstWorkspaceForBusiness("biz-1")).resolves.toBeNull();
  });

  it("skips a product with no workspace and keeps looking", async () => {
    let seen = 0;
    mockAll((call) => {
      if (call.table === "products") return { data: [{ id: "p1" }, { id: "p2" }], error: null };
      seen += 1;
      return { data: seen === 1 ? null : { id: "w2" }, error: null };
    });

    await expect(getFirstWorkspaceForBusiness("biz-1")).resolves.toMatchObject({ id: "w2" });
  });
});

describe("getFirstWorkspaceForAccount", () => {
  it("walks the account's businesses until one yields a workspace", async () => {
    let products = 0;
    mockAll((call) => {
      if (call.table === "businesses") return { data: [{ id: "b1" }, { id: "b2" }], error: null };
      if (call.table === "products") {
        products += 1;
        return { data: products === 1 ? [] : [{ id: "p1" }], error: null };
      }
      return { data: { id: "w1" }, error: null };
    });

    await expect(getFirstWorkspaceForAccount("acct-1")).resolves.toMatchObject({ id: "w1" });
  });

  it("returns null when the account has no workspaces at all", async () => {
    mockAll((call) =>
      call.table === "businesses" ? { data: [{ id: "b1" }], error: null } : { data: [], error: null },
    );

    await expect(getFirstWorkspaceForAccount("acct-1")).resolves.toBeNull();
  });

  it("returns null when the account has no businesses", async () => {
    mockAll(constant([]));

    await expect(getFirstWorkspaceForAccount("acct-1")).resolves.toBeNull();
  });
});

describe("getAccountIdForWorkspace", () => {
  const chain = (call: RecordedQuery) => {
    if (call.table === "workspaces") return { data: { id: "w1", product_id: "p1" }, error: null };
    if (call.table === "products") return { data: { id: "p1", business_id: "b1" }, error: null };
    if (call.table === "businesses") return { data: { id: "b1", account_id: "acct-1" }, error: null };
    return { data: null, error: null };
  };

  it("walks workspace -> product -> business -> account", async () => {
    mockAll(chain);

    await expect(getAccountIdForWorkspace("w1")).resolves.toBe("acct-1");
  });

  it.each([
    ["workspace", "workspaces"],
    ["product", "products"],
    ["business", "businesses"],
  ])("returns null when the %s is not visible", async (_label, missing) => {
    mockAll((call) => (call.table === missing ? { data: null, error: null } : chain(call)));

    await expect(getAccountIdForWorkspace("w1")).resolves.toBeNull();
  });

  it("threads a supplied client through the discovery hops", async () => {
    const supplied = createFakeSupabase({ query: chain });
    mockAll(chain);

    await getAccountIdForWorkspace("w1", supplied as never);

    expect(supplied.queries("workspaces")).toHaveLength(1);
    expect(supplied.queries("products")).toHaveLength(1);
  });

  it("uses a core-schema admin client for the business hop on the no-session path", async () => {
    const supplied = createFakeSupabase({ query: chain });
    mockAll(chain);

    await getAccountIdForWorkspace("w1", supplied as never);

    // businesses live in `core`; the discovery-scoped admin client cannot see them.
    expect(h.createCoreAdminClient).toHaveBeenCalledWith({ schema: "core" });
    expect(supplied.queries("businesses")).toEqual([]);
  });

  it("does not reach for an admin client on the normal signed-in path", async () => {
    mockAll(chain);

    await getAccountIdForWorkspace("w1");

    expect(h.createCoreAdminClient).not.toHaveBeenCalled();
  });
});

describe("failure propagation", () => {
  it.each([
    ["getCurrentAccount", () => getCurrentAccount()],
    ["listBusinesses", () => listBusinesses("acct-1")],
    ["getBusiness", () => getBusiness("b1")],
    ["listProducts", () => listProducts("b1")],
    ["getProduct", () => getProduct("p1")],
    ["getWorkspaceForProduct", () => getWorkspaceForProduct("p1")],
    ["listWorkspacesForProducts", () => listWorkspacesForProducts(["p1"])],
    ["getWorkspace", () => getWorkspace("w1")],
  ])("%s propagates", async (_label, run) => {
    mockAll(constant(null, new Error("denied")));
    await expect(run()).rejects.toThrow("denied");
  });
});

/**
 * `core.parties` and `core.party_roles` are scoped by business_id, not account_id (ADR-4:
 * one customer ledger per business, shared across every product it markets), so party
 * sync walks workspace → product → business rather than reusing the account chain above.
 */
describe("getBusinessIdForWorkspace", () => {
  it("walks workspace → product → business", async () => {
    mockAll((call) =>
      call.table === "workspaces"
        ? { data: { id: "ws-1", product_id: "prod-1" }, error: null }
        : { data: { id: "prod-1", business_id: "biz-1" }, error: null },
    );

    await expect(getBusinessIdForWorkspace("ws-1")).resolves.toBe("biz-1");
  });

  it("returns null for a workspace the caller cannot see", async () => {
    const supabase = mockAll((call) =>
      call.table === "workspaces" ? { data: null, error: null } : { data: { id: "prod-1" }, error: null },
    );

    await expect(getBusinessIdForWorkspace("ws-other")).resolves.toBeNull();
    expect(supabase.queries("products")).toHaveLength(0);
  });

  it("returns null when the product behind the workspace is out of reach", async () => {
    mockAll((call) =>
      call.table === "workspaces"
        ? { data: { id: "ws-1", product_id: "prod-1" }, error: null }
        : { data: null, error: null },
    );

    await expect(getBusinessIdForWorkspace("ws-1")).resolves.toBeNull();
  });
});
