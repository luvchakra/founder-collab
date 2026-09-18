import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listLicensesForBusiness } = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listLicensesForBusiness", () => {
  it("reads through the RLS-scoped client, never the admin client", async () => {
    mock([]);

    await listLicensesForBusiness(BUSINESS);

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("filters to the business", async () => {
    const supabase = mock([{ id: "l1" }]);

    await listLicensesForBusiness(BUSINESS);

    expect(eqFilters(supabase.queries("licenses")[0]!)).toEqual({ business_id: BUSINESS });
  });

  it("returns every licence row regardless of status, so the UI can show expired ones", async () => {
    const supabase = mock([{ status: "active" }, { status: "expired" }]);

    const rows = await listLicensesForBusiness(BUSINESS);

    expect(rows).toHaveLength(2);
    expect(supabase.queries("licenses")[0]!.ops.some((op) => op.method === "in")).toBe(false);
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listLicensesForBusiness(BUSINESS)).rejects.toThrow("denied");
  });
});
