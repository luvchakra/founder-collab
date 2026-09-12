/**
 * COMPLY-P0-08.5 (ITC Availability View): "how much Input Tax Credit can this business
 * actually claim for this period, right now." Combines two facts already computed by
 * earlier stories in this epic -- a document's own GSTN-reported ITC eligibility
 * (COMPLY-P0-08.1's `Gstr2bDocument.itcAvailable`/`ineligibilityReason`) and this
 * business's own IMS action on it (COMPLY-P0-08.4's `EffectiveImsStatus`) -- into the
 * four-way real-GST-practice outcome researched this story (see `compute.ts`'s own
 * docstring): available, pending, rejected, or ineligible per GSTN itself.
 */

export type ItcBucketKind = "available" | "pending" | "rejected" | "ineligible_by_gstn";

export type ItcBucketTotals = {
  count: number;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
};

export function emptyItcBucketTotals(): ItcBucketTotals {
  return { count: 0, taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessAmount: 0 };
}

export type ItcAvailabilityRow = {
  gstr2bDocumentId: string;
  supplierGstin: string;
  supplierTradeName: string | null;
  documentNumber: string;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
  /** GSTN's own reported eligibility (`Gstr2bDocument.itcAvailable`) -- independent of
   * whatever IMS action this business took. `false` always wins: a document GSTN itself
   * marked ineligible (Section 16(4), POS mismatch) is `ineligible_by_gstn` regardless of
   * an accept/reject/pending action on it (accepting a GSTN-ineligible document does not
   * make its ITC real -- backlog rule 11, never claim availability that hasn't actually
   * been established). */
  gstnItcAvailable: boolean;
  gstnIneligibilityReason: string | null;
  imsStatus: "accepted" | "rejected" | "pending" | "no_action";
  bucket: ItcBucketKind;
};

export type ItcAvailabilitySummary = {
  businessId: string;
  returnPeriod: string;
  rows: ItcAvailabilityRow[];
  available: ItcBucketTotals;
  pending: ItcBucketTotals;
  rejected: ItcBucketTotals;
  ineligibleByGstn: ItcBucketTotals;
  /** Every document GSTN's own GSTR-2B reported for this period, regardless of bucket --
   * `available.count + pending.count + rejected.count + ineligibleByGstn.count` always
   * equals `totalFromGstr2b.count`; kept as its own field so a caller doesn't need to
   * re-sum the four buckets just to show "X of Y documents" context. */
  totalFromGstr2b: ItcBucketTotals;
};
