import { describe, expect, it } from "vitest";
import { computeItcAvailability } from "./compute";
import type { Gstr2bDocument } from "../gstr2b/types";
import type { ImsAction } from "../ims/types";

const BIZ = "biz-1";
const PERIOD = "2026-09";

function doc(overrides: Partial<Gstr2bDocument>): Gstr2bDocument {
  return {
    id: "doc-1",
    statementId: "stmt-1",
    businessId: BIZ,
    section: "b2b",
    documentType: "invoice",
    supplierGstin: "29AAAAA0000A1Z1",
    supplierTradeName: "Acme",
    documentNumber: "INV-1",
    documentDate: "2026-09-05",
    documentValue: 1180,
    placeOfSupply: "29",
    reverseCharge: false,
    taxableValue: 1000,
    igstAmount: 0,
    cgstAmount: 90,
    sgstAmount: 90,
    cessAmount: 0,
    itcAvailable: true,
    ineligibilityReason: null,
    supplierFilingPeriod: "2026-09",
    supplierFiledDate: "2026-09-11",
    createdAt: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

function action(overrides: Partial<ImsAction>): ImsAction {
  return {
    id: "ims-1",
    businessId: BIZ,
    gstr2bDocumentId: "doc-1",
    action: "accepted",
    remarks: null,
    actionHistory: [],
    actedBy: "user-1",
    actedAt: "2026-09-12T00:00:00Z",
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

describe("computeItcAvailability", () => {
  it("puts an accepted, GSTN-eligible document into 'available'", () => {
    const result = computeItcAvailability(BIZ, PERIOD, [doc({})], new Map([["doc-1", action({ action: "accepted" })]]));
    expect(result.rows[0]!.bucket).toBe("available");
    expect(result.available).toEqual({ count: 1, taxableValue: 1000, igstAmount: 0, cgstAmount: 90, sgstAmount: 90, cessAmount: 0 });
    expect(result.pending.count).toBe(0);
    expect(result.rejected.count).toBe(0);
    expect(result.ineligibleByGstn.count).toBe(0);
  });

  it("treats no explicit IMS action (deemed acceptance) the same as accepted", () => {
    const result = computeItcAvailability(BIZ, PERIOD, [doc({})], new Map());
    expect(result.rows[0]!.imsStatus).toBe("no_action");
    expect(result.rows[0]!.bucket).toBe("available");
    expect(result.available.count).toBe(1);
  });

  it("puts a rejected document into 'rejected', excluded from available", () => {
    const result = computeItcAvailability(BIZ, PERIOD, [doc({})], new Map([["doc-1", action({ action: "rejected" })]]));
    expect(result.rows[0]!.bucket).toBe("rejected");
    expect(result.rejected.count).toBe(1);
    expect(result.available.count).toBe(0);
  });

  it("puts a pending document into 'pending', excluded from both available and rejected", () => {
    const result = computeItcAvailability(BIZ, PERIOD, [doc({})], new Map([["doc-1", action({ action: "pending" })]]));
    expect(result.rows[0]!.bucket).toBe("pending");
    expect(result.pending.count).toBe(1);
    expect(result.available.count).toBe(0);
    expect(result.rejected.count).toBe(0);
  });

  it("GSTN-ineligible always wins, even if this business accepted the document", () => {
    const result = computeItcAvailability(
      BIZ,
      PERIOD,
      [doc({ itcAvailable: false, ineligibilityReason: "Section 16(4)" })],
      new Map([["doc-1", action({ action: "accepted" })]]),
    );
    expect(result.rows[0]!.bucket).toBe("ineligible_by_gstn");
    expect(result.rows[0]!.gstnIneligibilityReason).toBe("Section 16(4)");
    expect(result.available.count).toBe(0);
    expect(result.ineligibleByGstn.count).toBe(1);
  });

  it("GSTN-ineligible wins even over a rejected/pending action -- there is nothing more to reject", () => {
    const result = computeItcAvailability(BIZ, PERIOD, [doc({ itcAvailable: false })], new Map([["doc-1", action({ action: "pending" })]]));
    expect(result.rows[0]!.bucket).toBe("ineligible_by_gstn");
  });

  it("sums multiple documents across all four buckets correctly", () => {
    const documents = [
      doc({ id: "d1", taxableValue: 1000, cgstAmount: 90, sgstAmount: 90 }),
      doc({ id: "d2", taxableValue: 2000, cgstAmount: 180, sgstAmount: 180 }),
      doc({ id: "d3", taxableValue: 500, igstAmount: 90, cgstAmount: 0, sgstAmount: 0 }),
      doc({ id: "d4", itcAvailable: false, taxableValue: 300, cgstAmount: 27, sgstAmount: 27 }),
    ];
    const imsActions = new Map<string, ImsAction>([
      ["d1", action({ gstr2bDocumentId: "d1", action: "accepted" })],
      ["d2", action({ gstr2bDocumentId: "d2", action: "rejected" })],
      ["d3", action({ gstr2bDocumentId: "d3", action: "pending" })],
    ]);

    const result = computeItcAvailability(BIZ, PERIOD, documents, imsActions);
    expect(result.available).toEqual({ count: 1, taxableValue: 1000, igstAmount: 0, cgstAmount: 90, sgstAmount: 90, cessAmount: 0 });
    expect(result.rejected).toEqual({ count: 1, taxableValue: 2000, igstAmount: 0, cgstAmount: 180, sgstAmount: 180, cessAmount: 0 });
    expect(result.pending).toEqual({ count: 1, taxableValue: 500, igstAmount: 90, cgstAmount: 0, sgstAmount: 0, cessAmount: 0 });
    expect(result.ineligibleByGstn).toEqual({ count: 1, taxableValue: 300, igstAmount: 0, cgstAmount: 27, sgstAmount: 27, cessAmount: 0 });
    expect(result.totalFromGstr2b).toEqual({ count: 4, taxableValue: 3800, igstAmount: 90, cgstAmount: 297, sgstAmount: 297, cessAmount: 0 });
  });

  it("returns an all-zero summary for an empty document list", () => {
    const result = computeItcAvailability(BIZ, PERIOD, [], new Map());
    const zero = { count: 0, taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessAmount: 0 };
    expect(result.rows).toEqual([]);
    expect(result.available).toEqual(zero);
    expect(result.totalFromGstr2b).toEqual(zero);
  });
});
