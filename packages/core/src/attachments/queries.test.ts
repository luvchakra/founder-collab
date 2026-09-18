import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listAttachmentsForEntity } = await import("./queries");

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listAttachmentsForEntity", () => {
  it("scopes to one entity, newest first", async () => {
    const supabase = mock([{ id: "att-1" }]);

    await listAttachmentsForEntity("document", "doc-1");

    const call = supabase.queries("attachments")[0]!;
    expect(eqFilters(call)).toEqual({ entity_type: "document", entity_id: "doc-1" });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: false }]);
  });

  it("relies on RLS for tenancy rather than a caller-supplied business filter", async () => {
    const supabase = mock([]);

    await listAttachmentsForEntity("document", "doc-1");

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
    expect(eqFilters(supabase.queries("attachments")[0]!)).not.toHaveProperty("business_id");
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listAttachmentsForEntity("document", "doc-1")).rejects.toThrow("denied");
  });
});
