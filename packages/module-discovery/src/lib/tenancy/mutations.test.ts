/**
 * The tenancy write layer. Two rules carry weight here: the creator of a business becomes
 * its owner in `core.business_members` (which is what C-7's has_permission() resolves
 * against, so skipping it would leave the creator unable to act on their own business),
 * and a new business is seeded with its default licence. The partial-update helpers only
 * touch fields actually passed, because every caller submits one inline-edited field at a
 * time — a full-row update would blank the others.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  createCoreClient: vi.fn(),
  seedDefaultLicenses: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));
vi.mock("@cofounderai/core/licensing/lifecycle", () => ({ seedDefaultLicenses: h.seedDefaultLicenses }));

const { createBusiness, createProduct, updateBusiness, updateProduct } = await import("./mutations");

function mockAll(
  responder: (call: RecordedQuery) => { data: unknown; error: unknown },
  user: unknown = { id: "u1" },
) {
  const supabase = Object.assign(createFakeSupabase({ query: responder }), {
    auth: { getUser: async () => ({ data: { user } }) },
  });
  h.createClient.mockResolvedValue(supabase);
  h.createCoreClient.mockResolvedValue(supabase);
  return supabase;
}

const ok = (data: unknown) => () => ({ data, error: null });

beforeEach(() => vi.clearAllMocks());

describe("createBusiness", () => {
  it("creates the business against the account, trimming and nulling blanks", async () => {
    const supabase = mockAll(ok({ id: "biz-1" }));

    await createBusiness("acct-1", { name: "  Acme  ", description: "  ", website: " acme.com " });

    expect(writtenRow(supabase.queries("businesses")[0]!)).toEqual({
      account_id: "acct-1",
      name: "Acme",
      description: null,
      website: "acme.com",
      industry: null,
    });
  });

  it("makes the creator the business's owner", async () => {
    const supabase = mockAll(ok({ id: "biz-1" }));

    await createBusiness("acct-1", { name: "Acme" });

    expect(writtenRow(supabase.queries("business_members")[0]!)).toEqual({
      business_id: "biz-1",
      user_id: "u1",
      role: "owner",
    });
  });

  it("seeds the new business's default licences", async () => {
    mockAll(ok({ id: "biz-1" }));

    await createBusiness("acct-1", { name: "Acme" });

    expect(h.seedDefaultLicenses).toHaveBeenCalledWith("biz-1");
  });

  it("still seeds licences when there is no session to record an owner from", async () => {
    const supabase = mockAll(ok({ id: "biz-1" }), null);

    await createBusiness("acct-1", { name: "Acme" });

    expect(supabase.queries("business_members")).toEqual([]);
    expect(h.seedDefaultLicenses).toHaveBeenCalledWith("biz-1");
  });

  it.each([["an empty name", ""], ["a whitespace name", "   "]])(
    "rejects %s before writing anything",
    async (_label, name) => {
      const supabase = mockAll(ok({ id: "biz-1" }));

      await expect(createBusiness("acct-1", { name })).rejects.toThrow("Business name is required.");
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("surfaces an RLS policy violation rather than swallowing it", async () => {
    mockAll(() => ({ data: null, error: new Error("new row violates row-level security policy") }));

    await expect(createBusiness("acct-1", { name: "Acme" })).rejects.toThrow("row-level security");
    expect(h.seedDefaultLicenses).not.toHaveBeenCalled();
  });

  it("does not seed licences if the ownership row could not be written", async () => {
    mockAll((call) =>
      call.table === "business_members"
        ? { data: null, error: new Error("member denied") }
        : { data: { id: "biz-1" }, error: null },
    );

    await expect(createBusiness("acct-1", { name: "Acme" })).rejects.toThrow("member denied");
    expect(h.seedDefaultLicenses).not.toHaveBeenCalled();
  });
});

describe("updateBusiness", () => {
  it("patches only the field that was passed", async () => {
    const supabase = mockAll(ok({ id: "biz-1" }));

    await updateBusiness("biz-1", { name: "  Renamed  " });

    const call = supabase.queries("businesses")[0]!;
    expect(writtenRow(call)).toEqual({ name: "Renamed" });
    expect(eqFilters(call)).toEqual({ id: "biz-1" });
  });

  it("nulls a description cleared to whitespace", async () => {
    const supabase = mockAll(ok({ id: "biz-1" }));

    await updateBusiness("biz-1", { description: "   " });

    expect(writtenRow(supabase.queries("businesses")[0]!)).toEqual({ description: null });
  });

  it("rejects a name cleared to empty", async () => {
    mockAll(ok({ id: "biz-1" }));

    await expect(updateBusiness("biz-1", { name: "  " })).rejects.toThrow("Business name is required.");
  });

  it("sends an empty patch when nothing was passed, rather than blanking the row", async () => {
    const supabase = mockAll(ok({ id: "biz-1" }));

    await updateBusiness("biz-1", {});

    expect(writtenRow(supabase.queries("businesses")[0]!)).toEqual({});
  });

  it("propagates a failure", async () => {
    mockAll(() => ({ data: null, error: new Error("denied") }));
    await expect(updateBusiness("biz-1", { name: "x" })).rejects.toThrow("denied");
  });
});

describe("createProduct", () => {
  it("creates the product under the business through discovery's own schema", async () => {
    const supabase = mockAll(ok({ id: "prod-1" }));

    await createProduct("biz-1", { name: " Widgets ", website: "  " });

    expect(h.createClient).toHaveBeenCalled();
    expect(writtenRow(supabase.queries("products")[0]!)).toEqual({
      business_id: "biz-1",
      name: "Widgets",
      description: null,
      website: null,
    });
  });

  it("rejects a blank name before writing", async () => {
    const supabase = mockAll(ok({ id: "prod-1" }));

    await expect(createProduct("biz-1", { name: " " })).rejects.toThrow("Product name is required.");
    expect(supabase.queries()).toEqual([]);
  });

  it("propagates a failure", async () => {
    mockAll(() => ({ data: null, error: new Error("denied") }));
    await expect(createProduct("biz-1", { name: "x" })).rejects.toThrow("denied");
  });
});

describe("updateProduct", () => {
  it("patches only the fields passed", async () => {
    const supabase = mockAll(ok({ id: "prod-1" }));

    await updateProduct("prod-1", { website: " https://acme.com " });

    expect(writtenRow(supabase.queries("products")[0]!)).toEqual({ website: "https://acme.com" });
  });

  it("patches several fields at once when several are passed", async () => {
    const supabase = mockAll(ok({ id: "prod-1" }));

    await updateProduct("prod-1", { name: "New", description: "Desc", website: "" });

    expect(writtenRow(supabase.queries("products")[0]!)).toEqual({
      name: "New",
      description: "Desc",
      website: null,
    });
  });

  it("rejects a name cleared to empty", async () => {
    mockAll(ok({ id: "prod-1" }));
    await expect(updateProduct("prod-1", { name: "" })).rejects.toThrow("Product name is required.");
  });

  it("propagates a failure", async () => {
    mockAll(() => ({ data: null, error: new Error("denied") }));
    await expect(updateProduct("prod-1", { name: "x" })).rejects.toThrow("denied");
  });

  it("nulls a product description cleared to whitespace", async () => {
    const supabase = mockAll(ok({ id: "prod-1" }));

    await updateProduct("prod-1", { description: "   " });

    expect(writtenRow(supabase.queries("products")[0]!)).toEqual({ description: null });
  });
});
