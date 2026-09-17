import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, usedOp, writtenRow } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { createTag, tagEntity, untagEntity } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown = { id: "tag-1" }, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("createTag", () => {
  it("nulls an unset colour", async () => {
    const supabase = mock();

    await createTag({ businessId: BUSINESS, scope: "party", name: "VIP" });

    expect(writtenRow(supabase.queries("tags")[0]!)).toEqual({
      business_id: BUSINESS,
      scope: "party",
      name: "VIP",
      color: null,
    });
  });

  it("carries a colour through", async () => {
    const supabase = mock();
    await createTag({ businessId: BUSINESS, scope: "party", name: "VIP", color: "#ff0000" });
    expect(writtenRow(supabase.queries("tags")[0]!)).toMatchObject({ color: "#ff0000" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(createTag({ businessId: BUSINESS, scope: "s", name: "n" })).rejects.toThrow("denied");
  });
});

describe("tagEntity", () => {
  it("upserts ignoring duplicates, so tagging twice is a no-op rather than an error", async () => {
    const supabase = mock();

    await tagEntity({ businessId: BUSINESS, tagId: "tag-1", taggableType: "party", taggableId: "p1" });

    expect(opArgs(supabase.queries("taggings")[0]!, "upsert")).toEqual([
      { business_id: BUSINESS, tag_id: "tag-1", taggable_type: "party", taggable_id: "p1" },
      { onConflict: "tag_id,taggable_type,taggable_id", ignoreDuplicates: true },
    ]);
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(
      tagEntity({ businessId: BUSINESS, tagId: "t", taggableType: "party", taggableId: "p" }),
    ).rejects.toThrow("denied");
  });
});

describe("untagEntity", () => {
  it("deletes only the one tagging, identified by all three parts of its key", async () => {
    const supabase = mock();

    await untagEntity("tag-1", "party", "p1");

    const call = supabase.queries("taggings")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({
      tag_id: "tag-1",
      taggable_type: "party",
      taggable_id: "p1",
    });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(untagEntity("t", "party", "p")).rejects.toThrow("denied");
  });
});
