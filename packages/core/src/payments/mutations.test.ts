import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { allocatePayment, recordPayment } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown = { id: "pay-1" }, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("recordPayment", () => {
  it("nulls unset optionals and leaves payment_date to the column default", async () => {
    const supabase = mock();

    await recordPayment({ businessId: BUSINESS, partyId: "party-1", method: "cash", amount: 100 });

    expect(writtenRow(supabase.queries("payments")[0]!)).toEqual({
      business_id: BUSINESS,
      party_id: "party-1",
      method: "cash",
      amount: 100,
      reference: null,
      payment_date: undefined,
      notes: null,
    });
  });

  it("carries a reference, date and notes through", async () => {
    const supabase = mock();

    await recordPayment({
      businessId: BUSINESS,
      partyId: "party-1",
      method: "bank",
      amount: 250.5,
      reference: "UTR123",
      paymentDate: "2026-09-17",
      notes: "part settlement",
    });

    expect(writtenRow(supabase.queries("payments")[0]!)).toMatchObject({
      method: "bank",
      amount: 250.5,
      reference: "UTR123",
      payment_date: "2026-09-17",
      notes: "part settlement",
    });
  });

  it("records the amount exactly as given, including zero", async () => {
    const supabase = mock();

    await recordPayment({ businessId: BUSINESS, partyId: "p", method: "cash", amount: 0 });

    expect(writtenRow(supabase.queries("payments")[0]!)).toMatchObject({ amount: 0 });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(
      recordPayment({ businessId: BUSINESS, partyId: "p", method: "cash", amount: 1 }),
    ).rejects.toThrow("denied");
  });
});

describe("allocatePayment", () => {
  it("writes the allocation as given", async () => {
    const supabase = mock();

    await allocatePayment({ businessId: BUSINESS, paymentId: "pay-1", documentId: "doc-1", amount: 50 });

    expect(writtenRow(supabase.queries("payment_allocations")[0]!)).toEqual({
      business_id: BUSINESS,
      payment_id: "pay-1",
      document_id: "doc-1",
      amount: 50,
    });
  });

  // The over-allocation guard is a database trigger (D-7), not application logic — this
  // only proves the rejection surfaces as a normal thrown error rather than being eaten.
  it("surfaces the over-allocation trigger's rejection to the caller", async () => {
    mock(null, new Error("allocation exceeds payment amount"));

    await expect(
      allocatePayment({ businessId: BUSINESS, paymentId: "pay-1", documentId: "doc-1", amount: 1e9 }),
    ).rejects.toThrow("allocation exceeds payment amount");
  });

  it("runs RLS-scoped against core", async () => {
    mock();
    await allocatePayment({ businessId: BUSINESS, paymentId: "p", documentId: "d", amount: 1 });
    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });
});
