import { describe, expect, it } from "vitest";
import { parseGstPeriod, parseGstr2bJson } from "./parse";
import type { RawGstr2bJson } from "./types";

describe("parseGstPeriod", () => {
  it("converts GSTN's MMYYYY into this platform's YYYY-MM", () => {
    expect(parseGstPeriod("092026")).toBe("2026-09");
    expect(parseGstPeriod("012027")).toBe("2027-01");
  });

  it("accepts an already-normalized YYYY-MM value as-is", () => {
    expect(parseGstPeriod("2026-09")).toBe("2026-09");
  });

  it("returns null for garbage rather than guessing", () => {
    expect(parseGstPeriod("not-a-period")).toBeNull();
    expect(parseGstPeriod(undefined)).toBeNull();
    expect(parseGstPeriod(123)).toBeNull();
  });
});

describe("parseGstr2bJson", () => {
  it("parses a b2b invoice into a normalized document, converting date/period formats", () => {
    const raw: RawGstr2bJson = {
      gstin: "27AAAAA0000A1Z5",
      fp: "092026",
      docdata: {
        b2b: [
          {
            ctin: "29BBBBB1111B1Z1",
            trdnm: "Acme Supplies",
            supprd: "092026",
            supfildt: "11-10-2026",
            inv: [
              {
                inum: "INV-100",
                idt: "05-09-2026",
                val: 11800,
                pos: "29",
                rev: "N",
                txval: 10000,
                iamt: 0,
                camt: 900,
                samt: 900,
                csamt: 0,
              },
            ],
          },
        ],
      },
    };

    const result = parseGstr2bJson(raw);
    expect(result.returnPeriod).toBe("2026-09");
    expect(result.gstin).toBe("27AAAAA0000A1Z5");
    expect(result.warnings).toEqual([]);
    expect(result.documents).toEqual([
      {
        section: "b2b",
        documentType: "invoice",
        supplierGstin: "29BBBBB1111B1Z1",
        supplierTradeName: "Acme Supplies",
        documentNumber: "INV-100",
        documentDate: "2026-09-05",
        documentValue: 11800,
        placeOfSupply: "29",
        reverseCharge: false,
        taxableValue: 10000,
        igstAmount: 0,
        cgstAmount: 900,
        sgstAmount: 900,
        cessAmount: 0,
        itcAvailable: true,
        ineligibilityReason: null,
        supplierFilingPeriod: "2026-09",
        supplierFiledDate: "2026-10-11",
      },
    ]);
  });

  it("marks ITC unavailable and preserves the government's own reason text verbatim, never re-deriving it", () => {
    const raw: RawGstr2bJson = {
      fp: "092026",
      docdata: {
        b2b: [
          {
            ctin: "29BBBBB1111B1Z1",
            inv: [
              {
                inum: "INV-101",
                idt: "05-09-2026",
                val: 1180,
                txval: 1000,
                camt: 90,
                samt: 90,
                itc_elg: "N",
                rsn: "Recipient not entitled to ITC as per provisions of section 16(4) of the CGST Act",
              },
            ],
          },
        ],
      },
    };

    const doc = parseGstr2bJson(raw).documents[0]!;
    expect(doc.itcAvailable).toBe(false);
    expect(doc.ineligibilityReason).toBe("Recipient not entitled to ITC as per provisions of section 16(4) of the CGST Act");
  });

  it("defaults itcAvailable to true when the raw JSON omits the flag entirely", () => {
    const raw: RawGstr2bJson = {
      fp: "092026",
      docdata: { b2b: [{ ctin: "29BBBBB1111B1Z1", inv: [{ inum: "INV-102", txval: 100 }] }] },
    };
    expect(parseGstr2bJson(raw).documents[0]!.itcAvailable).toBe(true);
  });

  it("parses a cdnr credit note (ntty=C) and a debit note (ntty=D) with the right documentType", () => {
    const raw: RawGstr2bJson = {
      fp: "092026",
      docdata: {
        cdnr: [
          {
            ctin: "29BBBBB1111B1Z1",
            trdnm: "Acme Supplies",
            nt: [
              { ntty: "C", nt_num: "CN-1", nt_dt: "10-09-2026", val: -1180, txval: -1000, camt: -90, samt: -90 },
              { ntty: "D", nt_num: "DN-1", nt_dt: "11-09-2026", val: 590, txval: 500, camt: 45, samt: 45 },
            ],
          },
        ],
      },
    };

    const notes = parseGstr2bJson(raw).documents;
    const cn = notes[0]!;
    const dn = notes[1]!;
    expect(cn.documentType).toBe("credit_note");
    expect(cn.documentNumber).toBe("CN-1");
    expect(dn.documentType).toBe("debit_note");
    expect(dn.documentNumber).toBe("DN-1");
  });

  it("warns and defaults to credit_note for an unrecognized note type instead of throwing", () => {
    const raw: RawGstr2bJson = {
      docdata: { cdnr: [{ ctin: "29BBBBB1111B1Z1", nt: [{ ntty: "X", nt_num: "CN-2", txval: 100 }] }] },
    };
    const result = parseGstr2bJson(raw);
    expect(result.documents[0]!.documentType).toBe("credit_note");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toMatch(/Unrecognized note type/);
  });

  it("skips a b2b supplier block with no counterparty GSTIN and records a warning, without throwing", () => {
    const raw: RawGstr2bJson = { docdata: { b2b: [{ trdnm: "No GSTIN Co", inv: [{ inum: "INV-1", txval: 100 }] }] } };
    const result = parseGstr2bJson(raw);
    expect(result.documents).toEqual([]);
    expect(result.warnings).toEqual([{ section: "b2b", supplierGstin: null, documentNumber: null, message: "Skipped a b2b supplier block with no counterparty GSTIN (ctin)." }]);
  });

  it("skips an invoice line with no invoice number and records a warning", () => {
    const raw: RawGstr2bJson = { docdata: { b2b: [{ ctin: "29BBBBB1111B1Z1", inv: [{ txval: 100 }] }] } };
    const result = parseGstr2bJson(raw);
    expect(result.documents).toEqual([]);
    expect(result.warnings[0]!.message).toMatch(/no invoice number/);
  });

  it("tolerates completely missing docdata/sections and returns an empty, warning-free result", () => {
    expect(parseGstr2bJson({})).toEqual({ returnPeriod: null, gstin: null, documents: [], warnings: [] });
    expect(parseGstr2bJson({ docdata: {} })).toEqual({ returnPeriod: null, gstin: null, documents: [], warnings: [] });
  });

  it("defaults missing numeric tax fields to 0 rather than NaN or throwing", () => {
    const raw: RawGstr2bJson = { docdata: { b2b: [{ ctin: "29BBBBB1111B1Z1", inv: [{ inum: "INV-1" }] }] } };
    const doc = parseGstr2bJson(raw).documents[0]!;
    expect(doc.taxableValue).toBe(0);
    expect(doc.igstAmount).toBe(0);
    expect(doc.cgstAmount).toBe(0);
    expect(doc.sgstAmount).toBe(0);
    expect(doc.cessAmount).toBe(0);
    expect(doc.documentValue).toBeNull();
    expect(doc.documentDate).toBeNull();
  });

  it("parses multiple suppliers and multiple invoices per supplier", () => {
    const raw: RawGstr2bJson = {
      docdata: {
        b2b: [
          { ctin: "GSTIN1", inv: [{ inum: "A-1", txval: 100 }, { inum: "A-2", txval: 200 }] },
          { ctin: "GSTIN2", inv: [{ inum: "B-1", txval: 300 }] },
        ],
      },
    };
    const result = parseGstr2bJson(raw);
    expect(result.documents).toHaveLength(3);
    expect(result.documents.map((d) => d.documentNumber)).toEqual(["A-1", "A-2", "B-1"]);
  });
});
