import type { ReturnSourceDocument } from "./types";

/**
 * COMPLY-P0-07.4 (Return Drill-Down): the real correctness check behind "every return
 * amount is traceable to source transactions" -- not just "here are some document ids,"
 * but "these real documents' own amounts, combined the SAME way the return's own
 * aggregation logic combines them, reproduce exactly what the return reported." Pure and
 * DB-independent, unit-tested standalone -- `queries.ts`'s own `getReturnRowSourceDocuments`
 * is the only file in this folder that touches `core`, matching this whole epic's own
 * established "pure aggregation, thin query layer" split (`gstr1/aggregate.ts` vs.
 * `gstr1/queries.ts`, etc.).
 */

export type ReturnRowAmounts = {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export type ReturnRowSignConvention =
  /** The row's own reported amounts are a NET sum across its source documents, with a
   * credit note SUBTRACTING and every other document type (invoice, debit note, purchase
   * order) ADDING -- the exact sign convention `aggregateGstr1`/`aggregateGstr3bOutward`
   * already apply to every multi-document bucket/net row in this epic: GSTR-1's own Table
   * 7 B2C Others net-by-state rows and its own HSN summary and grand totals, every
   * GSTR-3B Table 3.1/3.2 bucket, GSTR-9 Table 4's own combined B2C/B2B/zero-rated-export
   * buckets, and the purchase-side ITC total (which happens to contain no credit notes
   * today, so the sign is moot there, but this is still the correct convention for it). */
  | "net"
  /** The row's own reported amounts are the RAW, un-signed face value of its source
   * document(s) -- true for a row that reports a document's own value exactly as issued,
   * never netted against anything else: a single B2B/B2C-Large invoice row, a single
   * CDNR/CDNUR note row, and GSTR-9 Table 4's own separate `creditNotes`/`debitNotes`
   * buckets (each sums credit notes', or debit notes', own face values on their own, never
   * against each other or against B2B/B2C -- see `buildGstr9Table4`'s own test suite). */
  | "raw";

const RECONCILIATION_TOLERANCE_INR = 0.01;

function signFor(docType: ReturnSourceDocument["docType"], convention: ReturnRowSignConvention): 1 | -1 {
  if (convention === "raw") return 1;
  return docType === "credit_note" ? -1 : 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ReturnRowReconciliation = {
  reconciled: boolean;
  reported: ReturnRowAmounts;
  computedFromSources: ReturnRowAmounts;
  /** `null` when reconciled; otherwise `computedFromSources - reported`, per field, so a
   * reviewer sees not just THAT the row disagrees with its own sources but by how much and
   * in which direction. */
  discrepancy: ReturnRowAmounts | null;
};

/**
 * Recomputes a return row's own four amounts directly from its real source documents and
 * compares the result against what the row reported. `sourceDocuments` should be exactly
 * the documents `getReturnRowSourceDocuments` returned for that row's own
 * `documentId`/`documentIds` -- this function trusts its caller to have already resolved
 * the real documents; it does no id lookup of its own (that split keeps this pure and
 * `queries.ts` thin, the same convention every other pure aggregation function in this
 * epic already follows).
 *
 * A `RECONCILIATION_TOLERANCE_INR` of one paisa absorbs floating-point rounding noise
 * across many summed documents without masking a real discrepancy (a genuinely wrong
 * source document, a stale/edited one, or a row computed before a later document
 * correction) -- this is a real integrity check, not a rubber stamp; see
 * `reconcile.test.ts` for a case where it correctly flags a mismatch.
 *
 * **Not meaningful for `Gstr1HsnRow`/`Gstr9HsnRow`** -- an HSN summary row is a per-LINE
 * aggregate across whichever documents contributed at least one line with that HSN code,
 * so summing those documents' own WHOLE-document totals will not generally reproduce the
 * row's own figures (a single document can span several HSN codes). Only apply this to a
 * row whose own reported amount is a true whole-document sum or net -- every other row
 * shape in this epic (B2B, B2C Large, CDNR/CDNUR, B2C Others, every GSTR-3B/GSTR-9 bucket,
 * the ITC total).
 */
export function reconcileReturnRow(
  reported: ReturnRowAmounts,
  sourceDocuments: Pick<ReturnSourceDocument, "docType" | "taxableValue" | "cgstAmount" | "sgstAmount" | "igstAmount">[],
  signConvention: ReturnRowSignConvention,
): ReturnRowReconciliation {
  const computed = sourceDocuments.reduce<ReturnRowAmounts>(
    (acc, doc) => {
      const sign = signFor(doc.docType, signConvention);
      acc.taxableValue += sign * doc.taxableValue;
      acc.cgstAmount += sign * doc.cgstAmount;
      acc.sgstAmount += sign * doc.sgstAmount;
      acc.igstAmount += sign * doc.igstAmount;
      return acc;
    },
    { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 },
  );

  const fields = ["taxableValue", "cgstAmount", "sgstAmount", "igstAmount"] as const;
  const mismatched = fields.some((field) => Math.abs(computed[field] - reported[field]) > RECONCILIATION_TOLERANCE_INR);

  return {
    reconciled: !mismatched,
    reported,
    computedFromSources: computed,
    discrepancy: mismatched
      ? {
          taxableValue: round2(computed.taxableValue - reported.taxableValue),
          cgstAmount: round2(computed.cgstAmount - reported.cgstAmount),
          sgstAmount: round2(computed.sgstAmount - reported.sgstAmount),
          igstAmount: round2(computed.igstAmount - reported.igstAmount),
        }
      : null,
  };
}

/** Every id in `requested` (deduplicated) that has no matching entry in `foundIds` --
 * extracted as its own pure, tested function since `getReturnRowSourceDocuments` (the only
 * `core`-touching function in this folder) needs exactly this diff to build its own
 * `missingDocumentIds`, and this shape (dedupe the ask, diff against what came back) is
 * worth getting right independently of any real database call. */
export function computeMissingDocumentIds(requested: string[], foundIds: Iterable<string>): string[] {
  const found = new Set(foundIds);
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const id of requested) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!found.has(id)) missing.push(id);
  }
  return missing;
}
