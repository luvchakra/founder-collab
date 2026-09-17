/**
 * Document lines snapshot their tax fields at creation. That is the rule
 * 03-STOCKPILOT-MIGRATION.md states as "historical documents must not change when a price
 * or rate changes", and it is the one behaviour in this file that is not a plain insert:
 * omitted hsn/tax are copied from the item ONCE, supplied ones are never overwritten, and
 * the item is not consulted at all when both are given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, usedOp, writtenRow, type RecordedQuery } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { addDocumentLine, createDocument } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const ITEM = { hsn_code: "7318", tax_rate: 12 };

function mock(item: unknown = ITEM, error: unknown = null) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) =>
      call.table === "items" ? { data: item, error } : { data: { id: "row" }, error },
  });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

const LINE = { businessId: BUSINESS, documentId: "doc-1", itemId: "i1", quantity: 2 };

beforeEach(() => vi.clearAllMocks());

describe("createDocument", () => {
  it("applies the documented defaults", async () => {
    const supabase = mock();

    await createDocument({
      businessId: BUSINESS,
      docType: "invoice",
      sourceModule: "inventory",
      partyId: "party-1",
    });

    expect(writtenRow(supabase.queries("documents")[0]!)).toEqual({
      business_id: BUSINESS,
      doc_type: "invoice",
      source_module: "inventory",
      source_ref: {},
      party_id: "party-1",
      number: null,
      doc_date: undefined,
      due_date: null,
      expected_date: null,
      reason: null,
      notes: null,
      discount_amount: 0,
      shipping_amount: 0,
    });
  });

  it("leaves doc_date undefined so the column default applies, rather than sending null", async () => {
    const supabase = mock();

    await createDocument({ businessId: BUSINESS, docType: "invoice", sourceModule: "fsm", partyId: "p" });

    expect(writtenRow(supabase.queries("documents")[0]!)!.doc_date).toBeUndefined();
  });

  it("records which module raised the document, and its source reference", async () => {
    const supabase = mock();

    await createDocument({
      businessId: BUSINESS,
      docType: "estimate",
      sourceModule: "fsm",
      sourceRef: { job_id: "job-1" },
      partyId: "party-1",
    });

    expect(writtenRow(supabase.queries("documents")[0]!)).toMatchObject({
      source_module: "fsm",
      source_ref: { job_id: "job-1" },
    });
  });

  it("honours zero discount and shipping explicitly", async () => {
    const supabase = mock();

    await createDocument({
      businessId: BUSINESS,
      docType: "invoice",
      sourceModule: "inventory",
      partyId: "p",
      discountAmount: 0,
      shippingAmount: 15,
    });

    expect(writtenRow(supabase.queries("documents")[0]!)).toMatchObject({
      discount_amount: 0,
      shipping_amount: 15,
    });
  });

  it("propagates a failure", async () => {
    createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: null, error: new Error("denied") }) }));
    await expect(
      createDocument({ businessId: BUSINESS, docType: "invoice", sourceModule: "x", partyId: "p" }),
    ).rejects.toThrow("denied");
  });
});

describe("addDocumentLine", () => {
  it("snapshots hsn and tax rate from the item when neither is supplied", async () => {
    const supabase = mock();

    await addDocumentLine(LINE);

    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({
      hsn_code: "7318",
      tax_rate: 12,
    });
  });

  it("does not read the item at all when both are supplied", async () => {
    const supabase = mock();

    await addDocumentLine({ ...LINE, hsnCode: "9999", taxRate: 5 });

    expect(supabase.queries("items")).toEqual([]);
    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({
      hsn_code: "9999",
      tax_rate: 5,
    });
  });

  it("keeps an explicit override even while reading the item for the other field", async () => {
    const supabase = mock();

    await addDocumentLine({ ...LINE, taxRate: 0 });

    expect(supabase.queries("items")).toHaveLength(1);
    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({
      hsn_code: "7318",
      tax_rate: 0,
    });
  });

  it("accepts an explicitly null hsn code without falling back to the item's", async () => {
    const supabase = mock();

    await addDocumentLine({ ...LINE, hsnCode: null, taxRate: 18 });

    expect(supabase.queries("items")).toEqual([]);
    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({ hsn_code: null });
  });

  it("falls back to null/0 when the item itself carries neither", async () => {
    const supabase = mock({ hsn_code: null, tax_rate: null });

    await addDocumentLine(LINE);

    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({
      hsn_code: null,
      tax_rate: 0,
    });
  });

  it("applies the remaining line defaults", async () => {
    const supabase = mock();

    await addDocumentLine(LINE);

    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({
      business_id: BUSINESS,
      document_id: "doc-1",
      item_id: "i1",
      description: null,
      quantity: 2,
      unit_price: 0,
      taxable: true,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      sort_order: 0,
    });
  });

  it("honours taxable: false rather than defaulting it back to true", async () => {
    const supabase = mock();

    await addDocumentLine({ ...LINE, taxable: false, hsnCode: null, taxRate: 0 });

    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({ taxable: false });
  });

  it("carries the GST split through as given", async () => {
    const supabase = mock();

    await addDocumentLine({ ...LINE, hsnCode: "1", taxRate: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0 });

    expect(writtenRow(supabase.queries("document_lines")[0]!)).toMatchObject({
      cgst_amount: 9,
      sgst_amount: 9,
      igst_amount: 0,
    });
  });

  it("writes no line when the item lookup fails", async () => {
    const supabase = createFakeSupabase({
      query: (call) =>
        call.table === "items" ? { data: null, error: new Error("item gone") } : { data: {}, error: null },
    });
    createClient.mockResolvedValue(supabase);

    await expect(addDocumentLine(LINE)).rejects.toThrow("item gone");
    expect(supabase.queries("document_lines")).toEqual([]);
  });

  it("propagates a failed line insert", async () => {
    const supabase = createFakeSupabase({
      query: (call) =>
        call.table === "items"
          ? { data: ITEM, error: null }
          : { data: null, error: new Error("insert denied") },
    });
    createClient.mockResolvedValue(supabase);

    await expect(addDocumentLine(LINE)).rejects.toThrow("insert denied");
  });

  it("never updates the item while snapshotting from it", async () => {
    const supabase = mock();

    await addDocumentLine(LINE);

    expect(supabase.queries("items").some((c) => usedOp(c, "update"))).toBe(false);
  });
});
