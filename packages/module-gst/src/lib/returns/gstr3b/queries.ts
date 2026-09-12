import { resolveOutwardDocuments } from "../shared/queries";
import { getPurchaseRegister } from "../../filing/queries";
import { aggregateGstr3bOutward } from "./aggregate";
import type { Gstr3bReturn } from "./types";

/**
 * COMPLY-P0-07.2 (GSTR-3B Preparation): "prepare" here means COMPUTE, on demand -- see
 * COMPLY-P0-07.1's own `queries.ts` docstring for why this epic doesn't persist a return
 * yet (no `ReturnPeriod`/`ReturnSubmission` table until COMPLY-P0-07.5 has real lifecycle
 * state to store).
 *
 * **Checked existing code first** (backlog rule 1): `lib/filing/queries.ts`'s own
 * pre-existing `getPurchaseRegister` (Epic 6/S-2) already computes taxable value + CGST/
 * SGST/IGST totals from `core.documents` where `doc_type = 'purchase_order'`,
 * `source_module = 'inventory'` -- the closest thing this platform has to an "inward
 * supplies" register, reused here for Table 4A(5) rather than re-querying the same rows a
 * second time with different code.
 *
 * **What this story's own ITC figure is NOT, stated plainly** (backlog rule 11: never
 * claim compliant from a calculation alone): a real GSTR-3B's Table 4A is supposed to come
 * from the taxpayer's own GSTR-2B (supplier-reported, government-matched inward supplies),
 * not the taxpayer's own purchase-order records -- this session's own research (see
 * `types.ts`'s own docstring) confirms GSTR-2B-sourced ITC is the current expectation.
 * COMPLY-P0-08 (India Reconciliation & IMS) is the epic that will actually fetch and match
 * against GSTR-2B; until then, this function returns the ONE figure this platform's own
 * transaction data can support today -- "what my own purchase records say I paid in GST"
 * -- clearly labeled `reconciledWithGstr2b: false` on every result, never presented as a
 * ready-to-file ITC claim.
 */

const NOT_MODELED_TABLES = [
  "Table 3.1(c) (nil-rated/exempted outward supplies) -- no per-line tax treatment is recorded on core.document_lines today",
  "Table 3.1(d) (inward supplies liable to reverse charge) -- no reverse-charge-liability flag exists on core.documents",
  "Table 3.1(e) (non-GST outward supplies) -- same per-line treatment gap as 3.1(c)",
  "Table 3.1.1 (e-commerce operator supplies under section 9(5)) -- no e-commerce-operator concept exists in core",
  "Table 3.2's UIN-holder column -- no UIN concept is recorded on core.tax_identities",
  "Table 4A(1)/(2)/(3) (ITC on import of goods, import of services, ISD) -- no import documentation or ISD allocation mechanism exists",
  "Table 4B (ITC reversed under Rules 42/43 and Section 17(5)) -- no blocked-credit classification exists",
  "Table 4D (ineligible ITC)",
  "Table 5 (exempt/nil/non-GST inward supplies, incl. purchases from composition dealers) -- same per-line treatment gap as 3.1(c)",
  "Table 5.1 (interest and late fee) -- depends on the actual filing date vs. due date, not a preparation-time concern",
  "Table 6 (tax payment / cash-vs-credit-ledger reconciliation) -- depends on this platform's own payment/cash-ledger data at the time of an actual filing, not preparation",
];

/**
 * The GSTR-3B draft for one business and period -- see this file's own and `types.ts`'s
 * own docstrings for exactly which tables are populated and which are deliberately not.
 * `periodStart`/`periodEnd` are inclusive, `YYYY-MM-DD` dates, same convention as
 * `getGstr1Return`.
 */
export async function getGstr3bReturn(businessId: string, periodStart: string, periodEnd: string): Promise<Gstr3bReturn> {
  const [outwardDocuments, purchaseRegister] = await Promise.all([
    resolveOutwardDocuments(businessId, periodStart, periodEnd),
    getPurchaseRegister(businessId, periodStart, periodEnd),
  ]);

  const outward = aggregateGstr3bOutward(outwardDocuments);

  return {
    businessId,
    periodStart,
    periodEnd,
    outwardTaxableOther: outward.outwardTaxableOther,
    outwardZeroRated: outward.outwardZeroRated,
    interStateToUnregistered: outward.interStateToUnregistered,
    interStateToComposition: outward.interStateToComposition,
    itc: {
      eligibleItcTaxableValue: purchaseRegister.taxableValue,
      eligibleItcCgstAmount: purchaseRegister.cgst,
      eligibleItcSgstAmount: purchaseRegister.sgst,
      eligibleItcIgstAmount: purchaseRegister.igst,
      reconciledWithGstr2b: false,
      documentIds: purchaseRegister.poIds,
    },
    excludedUnknownPlaceOfSupply: outward.excludedUnknownPlaceOfSupply,
    notModeled: NOT_MODELED_TABLES,
  };
}
