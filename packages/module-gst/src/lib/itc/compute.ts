import { effectiveImsStatus } from "../ims/status";
import type { ImsAction } from "../ims/types";
import type { Gstr2bDocument } from "../gstr2b/types";
import { emptyItcBucketTotals } from "./types";
import type { ItcAvailabilityRow, ItcAvailabilitySummary, ItcBucketKind, ItcBucketTotals } from "./types";

/**
 * COMPLY-P0-08.5: pure, no-I/O. Research, not assumption (backlog rule 6) -- confirmed
 * via `WebSearch` against ClearTax's/TaxGuru's own IMS guides (already cited in
 * COMPLY-P0-08.4's own migration) and GSTN's GSTR-2B advisory (already cited in
 * COMPLY-P0-08.1's own migration): the real GSTR-3B auto-population logic is exactly this
 * four-way split --
 *
 * 1. GSTN itself marks a document ITC-ineligible (Section 16(4) time-bar, or supplier/
 *    POS same-state-recipient-different-state) -> NEVER available, regardless of any IMS
 *    action -- `bucket: "ineligible_by_gstn"`.
 * 2. Otherwise, IMS `"rejected"` -> "ITC of rejected records will not auto-populate in
 *    GSTR-3B" (TaxGuru) -- `bucket: "rejected"`.
 * 3. Otherwise, IMS `"pending"` -> "Pending records will not become part of GSTR-2B and
 *    GSTR-3B... [until] accepted or rejected" (TaxGuru) -- `bucket: "pending"`, genuinely
 *    undecided, not counted as either available or lost.
 * 4. Otherwise (IMS `"accepted"` OR `"no_action"`, i.e. deemed acceptance) -> "Accepted
 *    documents auto-populate ITC in GSTR-3B" -- `bucket: "available"`. `"no_action"` is
 *    deliberately treated the SAME as `"accepted"` here (not a separate bucket) because
 *    that is exactly what "deemed acceptance" means in real GST practice -- the
 *    UNDERLYING fact (no explicit action recorded) is still visible on each row's own
 *    `imsStatus` field for a UI to display differently if it wants to nudge a business to
 *    review it, even though the ITC OUTCOME is identical to an explicit accept.
 */
export function computeItcAvailability(
  businessId: string,
  returnPeriod: string,
  documents: Gstr2bDocument[],
  imsActions: Map<string, ImsAction>,
): ItcAvailabilitySummary {
  const rows: ItcAvailabilityRow[] = documents.map((doc) => {
    const action = imsActions.get(doc.id) ?? null;
    const imsStatus = effectiveImsStatus(action);
    const bucket: ItcBucketKind = !doc.itcAvailable
      ? "ineligible_by_gstn"
      : imsStatus === "rejected"
        ? "rejected"
        : imsStatus === "pending"
          ? "pending"
          : "available";

    return {
      gstr2bDocumentId: doc.id,
      supplierGstin: doc.supplierGstin,
      supplierTradeName: doc.supplierTradeName,
      documentNumber: doc.documentNumber,
      taxableValue: doc.taxableValue,
      igstAmount: doc.igstAmount,
      cgstAmount: doc.cgstAmount,
      sgstAmount: doc.sgstAmount,
      cessAmount: doc.cessAmount,
      gstnItcAvailable: doc.itcAvailable,
      gstnIneligibilityReason: doc.ineligibilityReason,
      imsStatus,
      bucket,
    };
  });

  function sumBucket(kind: ItcBucketKind | "all"): ItcBucketTotals {
    const totals = emptyItcBucketTotals();
    for (const row of rows) {
      if (kind !== "all" && row.bucket !== kind) continue;
      totals.count += 1;
      totals.taxableValue += row.taxableValue;
      totals.igstAmount += row.igstAmount;
      totals.cgstAmount += row.cgstAmount;
      totals.sgstAmount += row.sgstAmount;
      totals.cessAmount += row.cessAmount;
    }
    return totals;
  }

  return {
    businessId,
    returnPeriod,
    rows,
    available: sumBucket("available"),
    pending: sumBucket("pending"),
    rejected: sumBucket("rejected"),
    ineligibleByGstn: sumBucket("ineligible_by_gstn"),
    totalFromGstr2b: sumBucket("all"),
  };
}
