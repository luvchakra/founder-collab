/**
 * Document numbering is gap-free and fiscal-year aware in SQL (core.next_number, tested
 * by scripts/test-core-number-sequences.mjs, including under concurrent callers). What is
 * tested here is only the wrapper: that it asks the right function with the right
 * arguments and never swallows a failure into a bogus number.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { nextNumber } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mockRpc(result: { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ rpc: () => result });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("nextNumber", () => {
  it("returns the minted number", async () => {
    mockRpc({ data: "SO-2026-0001", error: null });

    expect(await nextNumber(BUSINESS, "sales_order", "SO")).toBe("SO-2026-0001");
  });

  it("passes business, scope and prefix through to core.next_number", async () => {
    const supabase = mockRpc({ data: "SO-2026-0001", error: null });

    await nextNumber(BUSINESS, "sales_order", "SO");

    expect(supabase.rpcs("next_number")[0]!.args).toEqual({
      p_business_id: BUSINESS,
      p_scope: "sales_order",
      p_prefix: "SO",
    });
  });

  it("runs RLS-scoped against core", async () => {
    mockRpc({ data: "X-1", error: null });

    await nextNumber(BUSINESS, "invoice", "INV");

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("throws rather than returning a number the database did not mint", async () => {
    mockRpc({ data: null, error: new Error("sequence locked") });

    await expect(nextNumber(BUSINESS, "invoice", "INV")).rejects.toThrow("sequence locked");
  });
});
