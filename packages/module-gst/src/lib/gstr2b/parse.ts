import type {
  Gstr2bDocument,
  Gstr2bParseResult,
  Gstr2bParseWarning,
  RawGstr2bInvoiceLine,
  RawGstr2bJson,
  RawGstr2bNoteLine,
  RawGstr2bSupplierBlock,
} from "./types";

/**
 * COMPLY-P0-08.1: pure parsing/normalization, no I/O -- takes whatever JSON a business
 * uploaded (or a future GSP fetch returned) and produces this platform's own normalized
 * `Gstr2bDocument` rows, never throwing on a merely-unexpected shape (a government JSON
 * export is not something this platform controls the shape of) -- see `types.ts`'s own
 * `RawGstr2bJson` docstring for the research trail behind these field names and the
 * deliberate permissiveness. `importGstr2bStatement` (mutations.ts) is the only caller;
 * kept separate from it so this logic is testable without a database.
 */

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** GSTN's own invoice-date convention across the GSTR-1/2A/2B JSON family is `DD-MM-YYYY`
 * (confirmed alongside the other field names researched for this story). Converts to
 * `YYYY-MM-DD` for this platform's own `date` columns; returns `null` (never throws) for
 * anything that doesn't match, since a malformed date should degrade to "unknown date" on
 * one row, not fail the whole import. */
function parseGstDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Already-ISO input (e.g. a re-normalized upload, or a test fixture) is accepted as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** GSTN's own `fp`/period fields use `MMYYYY` (e.g. `"092026"`). Converts to this
 * platform's own `YYYY-MM` convention (matching `gst.return_periods`'/`Gstr2bStatement`'s
 * own `returnPeriod` shape). Returns `null` for anything else rather than guessing. */
export function parseGstPeriod(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const m = /^(\d{2})(\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1]}`;
  // Already-normalized YYYY-MM input is accepted as-is.
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return null;
}

function isYesFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === "Y";
}

function parseInvoiceLine(
  supplier: { ctin: string; trdnm: string | null; supprd: string | null; supfildt: string | null },
  line: RawGstr2bInvoiceLine,
  warnings: Gstr2bParseWarning[],
): Omit<Gstr2bDocument, "id" | "statementId" | "businessId" | "createdAt"> | null {
  const documentNumber = asString(line.inum);
  if (!documentNumber) {
    warnings.push({ section: "b2b", supplierGstin: supplier.ctin, documentNumber: null, message: "Skipped an invoice with no invoice number (inum)." });
    return null;
  }
  const itcElg = line.itc_elg;
  const itcAvailable = itcElg === undefined || itcElg === null ? true : isYesFlag(itcElg);
  return {
    section: "b2b",
    documentType: "invoice",
    supplierGstin: supplier.ctin,
    supplierTradeName: supplier.trdnm,
    documentNumber,
    documentDate: parseGstDate(line.idt),
    documentValue: asNullableNumber(line.val),
    placeOfSupply: asString(line.pos),
    reverseCharge: isYesFlag(line.rev),
    taxableValue: asNumber(line.txval),
    igstAmount: asNumber(line.iamt),
    cgstAmount: asNumber(line.camt),
    sgstAmount: asNumber(line.samt),
    cessAmount: asNumber(line.csamt),
    itcAvailable,
    ineligibilityReason: itcAvailable ? null : asString(line.rsn),
    supplierFilingPeriod: supplier.supprd,
    supplierFiledDate: parseGstDate(supplier.supfildt),
  };
}

function parseNoteLine(
  supplier: { ctin: string; trdnm: string | null; supprd: string | null; supfildt: string | null },
  line: RawGstr2bNoteLine,
  warnings: Gstr2bParseWarning[],
): Omit<Gstr2bDocument, "id" | "statementId" | "businessId" | "createdAt"> | null {
  const documentNumber = asString(line.nt_num);
  if (!documentNumber) {
    warnings.push({ section: "cdnr", supplierGstin: supplier.ctin, documentNumber: null, message: "Skipped a credit/debit note with no note number (nt_num)." });
    return null;
  }
  const nttyRaw = typeof line.ntty === "string" ? line.ntty.trim().toUpperCase() : null;
  const documentType = nttyRaw === "D" ? "debit_note" : "credit_note";
  if (nttyRaw !== "C" && nttyRaw !== "D") {
    warnings.push({
      section: "cdnr",
      supplierGstin: supplier.ctin,
      documentNumber,
      message: `Unrecognized note type "${String(line.ntty)}" (expected C or D) -- treated as a credit note.`,
    });
  }
  const itcElg = line.itc_elg;
  const itcAvailable = itcElg === undefined || itcElg === null ? true : isYesFlag(itcElg);
  return {
    section: "cdnr",
    documentType,
    supplierGstin: supplier.ctin,
    supplierTradeName: supplier.trdnm,
    documentNumber,
    documentDate: parseGstDate(line.nt_dt),
    documentValue: asNullableNumber(line.val),
    placeOfSupply: asString(line.pos),
    reverseCharge: isYesFlag(line.rev),
    taxableValue: asNumber(line.txval),
    igstAmount: asNumber(line.iamt),
    cgstAmount: asNumber(line.camt),
    sgstAmount: asNumber(line.samt),
    cessAmount: asNumber(line.csamt),
    itcAvailable,
    ineligibilityReason: itcAvailable ? null : asString(line.rsn),
    supplierFilingPeriod: supplier.supprd,
    supplierFiledDate: parseGstDate(supplier.supfildt),
  };
}

export function parseGstr2bJson(raw: RawGstr2bJson): Gstr2bParseResult {
  const warnings: Gstr2bParseWarning[] = [];
  const documents: Gstr2bParseResult["documents"] = [];

  const b2bBlocks = Array.isArray(raw.docdata?.b2b) ? (raw.docdata!.b2b as RawGstr2bSupplierBlock[]) : [];
  for (const block of b2bBlocks) {
    const ctin = asString(block.ctin);
    if (!ctin) {
      warnings.push({ section: "b2b", supplierGstin: null, documentNumber: null, message: "Skipped a b2b supplier block with no counterparty GSTIN (ctin)." });
      continue;
    }
    const supplier = { ctin, trdnm: asString(block.trdnm), supprd: parseGstPeriod(block.supprd), supfildt: parseGstDate(block.supfildt) };
    const lines = Array.isArray(block.inv) ? (block.inv as RawGstr2bInvoiceLine[]) : [];
    for (const line of lines) {
      const doc = parseInvoiceLine(supplier, line, warnings);
      if (doc) documents.push(doc);
    }
  }

  const cdnrBlocks = Array.isArray(raw.docdata?.cdnr) ? (raw.docdata!.cdnr as RawGstr2bSupplierBlock[]) : [];
  for (const block of cdnrBlocks) {
    const ctin = asString(block.ctin);
    if (!ctin) {
      warnings.push({ section: "cdnr", supplierGstin: null, documentNumber: null, message: "Skipped a cdnr supplier block with no counterparty GSTIN (ctin)." });
      continue;
    }
    const supplier = { ctin, trdnm: asString(block.trdnm), supprd: parseGstPeriod(block.supprd), supfildt: parseGstDate(block.supfildt) };
    const lines = Array.isArray(block.nt) ? (block.nt as RawGstr2bNoteLine[]) : [];
    for (const line of lines) {
      const doc = parseNoteLine(supplier, line, warnings);
      if (doc) documents.push(doc);
    }
  }

  return {
    returnPeriod: parseGstPeriod(raw.fp),
    gstin: asString(raw.gstin),
    documents,
    warnings,
  };
}
