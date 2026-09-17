import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listTagsForBusiness, listTagsForEntity } = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listTagsForBusiness", () => {
  it("lists a business's tags by name", async () => {
    const supabase = mock([]);

    await listTagsForBusiness(BUSINESS);

    const call = supabase.queries("tags")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS });
    expect(opArgs(call, "order")).toEqual(["name"]);
  });

  it("narrows to a scope when given one", async () => {
    const supabase = mock([]);
    await listTagsForBusiness(BUSINESS, "party");
    expect(eqFilters(supabase.queries("tags")[0]!)).toEqual({ business_id: BUSINESS, scope: "party" });
  });

  it("does not filter by scope when none is given", async () => {
    const supabase = mock([]);
    await listTagsForBusiness(BUSINESS);
    expect(eqFilters(supabase.queries("tags")[0]!)).not.toHaveProperty("scope");
  });
});

describe("listTagsForEntity", () => {
  it("flattens the embedded tag rows", async () => {
    mock([{ tags: { id: "t1", name: "VIP" } }, { tags: { id: "t2", name: "Lead" } }]);

    await expect(listTagsForEntity("party", "p1")).resolves.toEqual([
      { id: "t1", name: "VIP" },
      { id: "t2", name: "Lead" },
    ]);
  });

  it("flattens an array-shaped embed too, which PostgREST may return either way", async () => {
    mock([{ tags: [{ id: "t1" }, { id: "t2" }] }]);

    await expect(listTagsForEntity("party", "p1")).resolves.toEqual([{ id: "t1" }, { id: "t2" }]);
  });

  it("drops rows whose embed came back null rather than emitting a null tag", async () => {
    mock([{ tags: null }, { tags: { id: "t1" } }]);

    await expect(listTagsForEntity("party", "p1")).resolves.toEqual([{ id: "t1" }]);
  });

  it("returns an empty list when the query yields null", async () => {
    mock(null);
    await expect(listTagsForEntity("party", "p1")).resolves.toEqual([]);
  });

  it("scopes to the one entity", async () => {
    const supabase = mock([]);

    await listTagsForEntity("party", "p1");

    expect(eqFilters(supabase.queries("taggings")[0]!)).toEqual({
      taggable_type: "party",
      taggable_id: "p1",
    });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listTagsForEntity("party", "p1")).rejects.toThrow("denied");
  });
});
