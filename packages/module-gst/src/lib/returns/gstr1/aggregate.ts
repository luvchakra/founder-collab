import { classifyGstr1Document } from "./classify";
import type {
  Gstr1B2bRow,
  Gstr1B2clRow,
  Gstr1B2csRow,
  Gstr1CreditDebitNoteRow,
  Gstr1DocType,
  Gstr1HsnRow,
  Gstr1SourceDocument,
} from "./types";

/** A credit note REDUCES previously-reported outward supply, a debit note or invoice
 * ADDS to it -- the same sign convention `lib/filing/queries.ts`'s own
 * `netTaxableValue = taxableValue - creditTaxableValue` already established for this
 * platform's pre-existing sales register, applied uniformly here across every
 * aggregate/net figure (Table 7's own net-by-state rows, the HSN summary, and the
 * return's own grand totals) so a credit note is never double-counted as a positive
 * supply in one table and a negative one in another. */
function signFor(docType: Gstr1DocType): 1 | -1 {
  return docType === "credit_note" ? -1 : 1;
}

export type Gstr1Aggregation = {
  b2b: Gstr1B2bRow[];
  b2cLarge: Gstr1B2clRow[];
  b2cOthers: Gstr1B2csRow[];
  creditDebitNotes: Gstr1CreditDebitNoteRow[];
  hsnSummary: Gstr1HsnRow[];
  totals: { taxableValue: number; cgstAmount: number; sgstAmount: number; igstAmount: number };
  excluded: { documentId: string; reason: "export" | "unknown_place_of_supply" }[];
};

/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation): the pure aggregation step -- classifies every
 * source document via `classifyGstr1Document` and buckets it into the GSTR-1 tables this
 * module populates (see `types.ts`'s own docstring for the tables it deliberately does
 * NOT). DB-independent and unit-testable on its own; `queries.ts` is the only caller that
 * actually reads `core`.
 */
export function aggregateGstr1(documents: Gstr1SourceDocument[], b2cLargeThresholdInr: number | null): Gstr1Aggregation {
  const b2b: Gstr1B2bRow[] = [];
  const b2cLarge: Gstr1B2clRow[] = [];
  const creditDebitNotes: Gstr1CreditDebitNoteRow[] = [];
  const excluded: Gstr1Aggregation["excluded"] = [];
  const b2cOthersByState = new Map<string, Gstr1B2csRow>();
  const hsnByCode = new Map<string, Gstr1HsnRow>();
  const totals = { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };

  for (const doc of documents) {
    const classification = classifyGstr1Document({
      docType: doc.docType,
      gstin: doc.gstin,
      placeOfSupply: doc.placeOfSupply,
      invoiceValue: doc.invoiceValue,
      b2cLargeThresholdInr,
    });

    if (classification === "excluded_export") {
      excluded.push({ documentId: doc.documentId, reason: "export" });
      continue;
    }
    if (classification === "excluded_unknown_place_of_supply") {
      excluded.push({ documentId: doc.documentId, reason: "unknown_place_of_supply" });
      continue;
    }
    // Defensive only: `placeOfSupply` being intra/inter-state should always come with a
    // resolvable buyer state per `determinePlaceOfSupply`'s own contract (only "export"/
    // "unknown" ever leave it null) -- but `b2c_others_net` is the one classification that
    // actually buckets by state, so if this invariant is ever violated, treat it the same
    // as an unresolved place of supply rather than crashing or guessing a bucket.
    if (classification === "b2c_others_net" && !doc.buyerStateCode) {
      excluded.push({ documentId: doc.documentId, reason: "unknown_place_of_supply" });
      continue;
    }

    const sign = signFor(doc.docType);
    totals.taxableValue += sign * doc.taxableValue;
    totals.cgstAmount += sign * doc.cgstAmount;
    totals.sgstAmount += sign * doc.sgstAmount;
    totals.igstAmount += sign * doc.igstAmount;

    for (const line of doc.lines) {
      const hsn = line.hsnCode || "Unassigned";
      const entry = hsnByCode.get(hsn) ?? {
        hsnCode: hsn,
        totalQuantity: 0,
        totalValue: 0,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
      };
      entry.totalQuantity += sign * line.quantity;
      entry.taxableValue += sign * line.taxableValue;
      entry.cgstAmount += sign * line.cgstAmount;
      entry.sgstAmount += sign * line.sgstAmount;
      entry.igstAmount += sign * line.igstAmount;
      entry.totalValue += sign * (line.taxableValue + line.cgstAmount + line.sgstAmount + line.igstAmount);
      hsnByCode.set(hsn, entry);
    }

    switch (classification) {
      case "b2b":
        b2b.push({
          documentId: doc.documentId,
          invoiceNumber: doc.number,
          invoiceDate: doc.docDate,
          recipientGstin: doc.gstin!,
          recipientName: doc.partyName,
          invoiceValue: doc.invoiceValue,
          taxableValue: doc.taxableValue,
          cgstAmount: doc.cgstAmount,
          sgstAmount: doc.sgstAmount,
          igstAmount: doc.igstAmount,
        });
        break;
      case "b2c_large":
        b2cLarge.push({
          documentId: doc.documentId,
          invoiceNumber: doc.number,
          invoiceDate: doc.docDate,
          invoiceValue: doc.invoiceValue,
          taxableValue: doc.taxableValue,
          igstAmount: doc.igstAmount,
        });
        break;
      case "cdnr":
      case "cdnur":
        creditDebitNotes.push({
          documentId: doc.documentId,
          docType: doc.docType as "credit_note" | "debit_note",
          noteNumber: doc.number,
          noteDate: doc.docDate,
          recipientGstin: classification === "cdnr" ? doc.gstin : null,
          recipientName: doc.partyName,
          againstInvoiceId: doc.againstInvoiceId,
          noteValue: doc.invoiceValue,
          taxableValue: doc.taxableValue,
          cgstAmount: doc.cgstAmount,
          sgstAmount: doc.sgstAmount,
          igstAmount: doc.igstAmount,
        });
        break;
      case "b2c_others_net": {
        // `doc.buyerStateCode` is guaranteed non-null here -- the guard above already
        // excluded the one case it wouldn't be.
        const stateCode = doc.buyerStateCode!;
        const entry = b2cOthersByState.get(stateCode) ?? {
          buyerStateCode: stateCode,
          netTaxableValue: 0,
          netCgstAmount: 0,
          netSgstAmount: 0,
          netIgstAmount: 0,
          documentIds: [],
        };
        entry.netTaxableValue += sign * doc.taxableValue;
        entry.netCgstAmount += sign * doc.cgstAmount;
        entry.netSgstAmount += sign * doc.sgstAmount;
        entry.netIgstAmount += sign * doc.igstAmount;
        entry.documentIds.push(doc.documentId);
        b2cOthersByState.set(stateCode, entry);
        break;
      }
    }
  }

  return {
    b2b,
    b2cLarge,
    b2cOthers: [...b2cOthersByState.values()].sort((a, b) => a.buyerStateCode.localeCompare(b.buyerStateCode)),
    creditDebitNotes,
    hsnSummary: [...hsnByCode.values()].sort((a, b) => a.hsnCode.localeCompare(b.hsnCode)),
    totals,
    excluded,
  };
}
