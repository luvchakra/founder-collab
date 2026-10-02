import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { allocatePayment, recordPayment, voidPayment } = await import("./mutations");

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

describe("voidPayment (SEC-7)", () => {
  function mockVoid(found: boolean, rpcResult: { data: unknown; error: unknown } = { data: [], error: null }) {
    const supabase = createFakeSupabase({
      query: () => ({ data: found ? { id: "pay-1" } : null, error: null }),
      rpc: () => rpcResult,
    });
    createClient.mockResolvedValue(supabase);
    return supabase;
  }

  it("voids through core.void_payment as the signed-in user, with the trimmed reason", async () => {
    const supabase = mockVoid(true, {
      data: [{ allocation_id: "a-1", document_id: "doc-1", amount: "600.00" }],
      error: null,
    });

    const released = await voidPayment({ businessId: BUSINESS, paymentId: "pay-1", reason: "  cheque bounced " });

    expect(supabase.rpcs("void_payment")[0]!.args).toEqual({ p_payment_id: "pay-1", p_reason: "cheque bounced" });
    expect(released).toEqual([{ allocation_id: "a-1", document_id: "doc-1", amount: 600 }]);
    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("refuses without a real reason, before touching the database", async () => {
    const supabase = mockVoid(true);
    await expect(voidPayment({ businessId: BUSINESS, paymentId: "pay-1", reason: " no " })).rejects.toThrow("reason");
    expect(supabase.rpcs()).toHaveLength(0);
  });

  it("refuses a payment outside the given business", async () => {
    const supabase = mockVoid(false);
    await expect(voidPayment({ businessId: BUSINESS, paymentId: "pay-1", reason: "duplicate entry" })).rejects.toThrow(
      "Payment not found.",
    );
    expect(supabase.rpcs()).toHaveLength(0);
  });

  it("surfaces the database's refusal (permission, maker-checker, already voided)", async () => {
    mockVoid(true, { data: null, error: new Error("A payment has to be voided by someone other than the person who recorded it.") });
    await expect(voidPayment({ businessId: BUSINESS, paymentId: "pay-1", reason: "duplicate entry" })).rejects.toThrow(
      "someone other than",
    );
  });
});
