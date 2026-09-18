import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { getDocumentBalance, listAgingForBusiness, listAllocationsForPayment, listPaymentsForBusiness } =
  await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("payment queries", () => {
  it("lists a business's payments newest first", async () => {
    const supabase = mock([]);

    await listPaymentsForBusiness(BUSINESS);

    const call = supabase.queries("payments")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS });
    expect(opArgs(call, "order")).toEqual(["payment_date", { ascending: false }]);
  });

  it("lists allocations for one payment", async () => {
    const supabase = mock([]);
    await listAllocationsForPayment("pay-1");
    expect(eqFilters(supabase.queries("payment_allocations")[0]!)).toEqual({ payment_id: "pay-1" });
  });

  it("returns null for a document balance the caller cannot see", async () => {
    mock(null);
    await expect(getDocumentBalance("doc-1")).resolves.toBeNull();
  });

  it("returns the balance row when visible", async () => {
    mock({ document_id: "doc-1", balance: 25 });
    await expect(getDocumentBalance("doc-1")).resolves.toMatchObject({ balance: 25 });
  });

  it("lists aging most-overdue first, so the worst debts surface at the top", async () => {
    const supabase = mock([]);

    await listAgingForBusiness(BUSINESS);

    const call = supabase.queries("document_aging")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS });
    expect(opArgs(call, "order")).toEqual(["days_overdue", { ascending: false }]);
  });

  it.each([
    ["listPaymentsForBusiness", () => listPaymentsForBusiness(BUSINESS)],
    ["listAllocationsForPayment", () => listAllocationsForPayment("pay-1")],
    ["getDocumentBalance", () => getDocumentBalance("doc-1")],
    ["listAgingForBusiness", () => listAgingForBusiness(BUSINESS)],
  ])("%s propagates a failure", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});
