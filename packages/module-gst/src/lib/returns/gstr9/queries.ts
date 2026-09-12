import { resolveOutwardDocuments } from "../shared/queries";
import { getPurchaseRegister } from "../../filing/queries";
import { getEffectiveGstr1B2cLargeThreshold } from "../gstr1/threshold";
import { aggregateGstr1 } from "../gstr1/aggregate";
import { aggregateGstr3bOutward } from "../gstr3b/aggregate";
import { buildGstr9Table4 } from "./aggregate";
import type { Gstr9Return } from "./types";

/**
 * COMPLY-P0-07.3 (GSTR-9 Preparation): "prepare" here means COMPUTE, on demand, over a
 * FULL FINANCIAL YEAR -- see COMPLY-P0-07.1's own `queries.ts` docstring for why this epic
 * doesn't persist a return yet.
 *
 * Reads the year's own outward documents ONCE via `resolveOutwardDocuments` (the same
 * shared read COMPLY-P0-07.1/07.2 already established), then runs BOTH
 * `aggregateGstr1` (for its B2B/B2C Large/B2C Others/credit-debit-note classification) and
 * `aggregateGstr3bOutward` (for its zero-rated/export bucket, which `aggregateGstr1` itself
 * deliberately excludes rather than totals) over that SAME document list -- not two
 * separate database reads -- before reshaping both into Table 4 via `buildGstr9Table4`.
 * See `types.ts`'s own docstring for the full research trail and every table this
 * function does not populate.
 *
 * **Documented simplification, same posture as COMPLY-P0-07.1's own**: the B2C Large
 * threshold is resolved ONCE, as of the financial year's own end date, and applied to
 * every document across the whole year -- a real concern here in a way it wasn't for a
 * single month, since this rule's own one version change (01-Aug-2024) COULD fall inside a
 * financial year a caller asks about (e.g. FY 2024-25, 01-Apr-2024 to 31-Mar-2025). This
 * function does NOT special-case that: a financial year straddling the threshold's own
 * change will use only the LATER (year-end) threshold for the whole year, which could
 * misclassify a handful of pre-01-Aug-2024 B2C invoices between ₹1,00,000 and ₹2,50,000 as
 * "not large" when contemporaneous GSTR-1 filings would have reported them as B2C Large.
 * Flagged here plainly rather than silently produced as if correct -- fixing this
 * properly needs per-document threshold resolution, which COMPLY-P0-07.1's own docstring
 * already named as a known limitation of the same shared design.
 */

const NOT_MODELED_TABLES = [
  "Table 4D (SEZ with payment) / 4E (deemed exports) -- no SEZ/deemed-export flag exists on any party",
  "Table 4C's own with-payment-vs-LUT distinction -- exports are reported as one zero-rated total; no export-type/LUT reference is tracked",
  "Table 4F (advances, tax paid, no invoice issued) -- no advance-receipt concept exists in core",
  "Table 4G (inward supplies liable to reverse charge) -- no reverse-charge-liability flag exists on core.documents",
  "Table 4K/4L (amendments) and 4M/4N (net/sub-totals via amendment) -- no document-amendment/revision history exists",
  "Table 5 (outward supplies not liable to tax -- exempt/nil/non-GST, SEZ without payment) -- no per-line tax treatment is recorded",
  "Table 7 (ITC reversed) and Table 8 (ITC per GSTR-2B/2A comparison) -- neither is derivable without COMPLY-P0-08's own GSTR-2B reconciliation",
  "Tables 10-13 (prior-financial-year amendments/ITC declared in the current year's own returns) -- no cross-FY amendment tracking exists",
  "Table 9 (tax paid, cash-vs-credit-ledger split) -- an actual-filing-time concern, not preparation",
  "Table 14 (differential tax on Table 10/11 declarations) -- depends on Tables 10/11, themselves not modeled",
  "Table 15 (demands and refunds) and Table 16 (composition-taxpayer purchases, deemed supply, goods sent on approval) -- no such data is tracked",
  "Table 19 (late fee) -- an actual-filing-time concern, not preparation",
];

/**
 * The GSTR-9 draft for one business and financial year -- see this file's own and
 * `types.ts`'s own docstrings for exactly which tables are populated and which are
 * deliberately not. `fyStart`/`fyEnd` are inclusive `YYYY-MM-DD` dates spanning the whole
 * financial year (e.g. `"2026-04-01"`/`"2027-03-31"` for India's FY 2026-27) -- the
 * caller's own job to compute (this function does not assume any particular financial-year
 * convention itself, matching how `getGstr1Return`/`getGstr3bReturn` take a caller-supplied
 * period rather than assuming a calendar month).
 */
export async function getGstr9Return(businessId: string, fyStart: string, fyEnd: string): Promise<Gstr9Return> {
  const [documents, thresholdResult, purchaseRegister] = await Promise.all([
    resolveOutwardDocuments(businessId, fyStart, fyEnd),
    getEffectiveGstr1B2cLargeThreshold(fyEnd),
    getPurchaseRegister(businessId, fyStart, fyEnd),
  ]);

  const gstr1Aggregation = aggregateGstr1(documents, thresholdResult?.thresholdInr ?? null);
  const gstr3bAggregation = aggregateGstr3bOutward(documents);
  const table4 = buildGstr9Table4(gstr1Aggregation, gstr3bAggregation.outwardZeroRated);

  return {
    businessId,
    fyStart,
    fyEnd,
    table4,
    itcAvailed: {
      taxableValue: purchaseRegister.taxableValue,
      cgstAmount: purchaseRegister.cgst,
      sgstAmount: purchaseRegister.sgst,
      igstAmount: purchaseRegister.igst,
      reconciledWithGstr2b: false,
      documentIds: purchaseRegister.poIds,
    },
    hsnSummaryOutward: gstr1Aggregation.hsnSummary,
    hsnSummaryInward: purchaseRegister.byHsn,
    excludedUnknownPlaceOfSupply: gstr3bAggregation.excludedUnknownPlaceOfSupply,
    notModeled: NOT_MODELED_TABLES,
  };
}
