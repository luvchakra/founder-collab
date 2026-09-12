import type { Gstr1Aggregation } from "../gstr1/aggregate";
import type { Gstr3bOutwardBucket } from "../gstr3b/types";
import type { Gstr9CreditDebitNoteBucket, Gstr9NetBucket, Gstr9Table4 } from "./types";

function emptyBucket(): Gstr9NetBucket {
  return { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] };
}

/**
 * COMPLY-P0-07.3 (GSTR-9 Preparation): the pure reshaping step for Table 4 -- takes the
 * SAME aggregation outputs COMPLY-P0-07.1's own `aggregateGstr1` and COMPLY-P0-07.2's own
 * `aggregateGstr3bOutward` already produce (over a full financial year's worth of
 * documents, not one month) and combines them into GSTR-9's own coarser Table 4 row
 * shape. No new classification logic -- see `types.ts`'s own docstring for why this is a
 * deliberate reuse, not independent re-derivation.
 */
export function buildGstr9Table4(gstr1: Gstr1Aggregation, zeroRatedExports: Gstr3bOutwardBucket): Gstr9Table4 {
  const b2c = emptyBucket();
  for (const row of gstr1.b2cLarge) {
    b2c.taxableValue += row.taxableValue;
    b2c.igstAmount += row.igstAmount;
    b2c.documentIds.push(row.documentId);
  }
  for (const row of gstr1.b2cOthers) {
    b2c.taxableValue += row.netTaxableValue;
    b2c.igstAmount += row.netIgstAmount;
    b2c.cgstAmount += row.netCgstAmount;
    b2c.sgstAmount += row.netSgstAmount;
    b2c.documentIds.push(...row.documentIds);
  }

  const b2b = emptyBucket();
  for (const row of gstr1.b2b) {
    b2b.taxableValue += row.taxableValue;
    b2b.igstAmount += row.igstAmount;
    b2b.cgstAmount += row.cgstAmount;
    b2b.sgstAmount += row.sgstAmount;
    b2b.documentIds.push(row.documentId);
  }

  const zeroRated: Gstr9NetBucket = {
    taxableValue: zeroRatedExports.taxableValue,
    igstAmount: zeroRatedExports.igstAmount,
    cgstAmount: zeroRatedExports.cgstAmount,
    sgstAmount: zeroRatedExports.sgstAmount,
    documentIds: [...zeroRatedExports.documentIds],
  };

  const creditNotes: Gstr9CreditDebitNoteBucket = { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] };
  const debitNotes: Gstr9CreditDebitNoteBucket = { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] };
  for (const note of gstr1.creditDebitNotes) {
    const bucket = note.docType === "credit_note" ? creditNotes : debitNotes;
    bucket.taxableValue += note.taxableValue;
    bucket.igstAmount += note.igstAmount;
    bucket.cgstAmount += note.cgstAmount;
    bucket.sgstAmount += note.sgstAmount;
    bucket.documentIds.push(note.documentId);
  }

  return { b2c, b2b, zeroRatedExports: zeroRated, creditNotes, debitNotes };
}
