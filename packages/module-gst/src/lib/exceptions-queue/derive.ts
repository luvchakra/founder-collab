import type { UnpostedDocument } from "../accounting/dashboard-queries";
import type { ItcAssessment } from "../accounting/itc";
import type { ReadinessCheck } from "../accounting/filing-readiness";
import type { FinanceExceptionCandidate } from "./types";

/**
 * FIN-1: pure, no-I/O -- turns already-computed results from the three scattered sources
 * (F0's unposted-documents query, F8's ITC assessment, F9's filing readiness) into the
 * candidate exceptions this business's own current data supports. Deliberately takes
 * already-computed results rather than raw documents/ledger rows, same "pure aggregation,
 * thin query layer" split `lib/exceptions/derive.ts` already follows for the
 * reconciliation queue.
 */

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
  sales_return: "Sales return",
};

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function docLabel(doc: UnpostedDocument): string {
  const kind = DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type;
  return doc.number ? `${kind} ${doc.number}` : `${kind} (${doc.id.slice(0, 8)})`;
}

/** F0's own "unposted documents" list, one exception per document -- the natural key is
 * the document id, unscoped to any period, since a document isn't itself period-scoped. */
export function deriveUnpostedDocumentExceptions(documents: UnpostedDocument[]): FinanceExceptionCandidate[] {
  return documents.map((doc) => ({
    exceptionType: "unposted_document",
    referenceKey: doc.id,
    summary: `${docLabel(doc)} for ${formatInr(doc.total_amount)}, dated ${doc.doc_date}, was issued but never reached the ledger.`,
    impact: "Left out, the accounts -- and any return drawn from them -- understate this document.",
    suggestedAction:
      "Check that a posting account is mapped for this kind of document, or that the chart of accounts is set up, then re-run posting.",
  }));
}

/** F8's own ITC assessment for one GST period -- an exception only when the ledger claims
 * more than GSTR-2B supports (`over_claimed`). Leaving credit unclaimed is a missed
 * opportunity, not a risk, so it doesn't raise an exception here. */
export function deriveItcAtRiskExceptions(gstPeriod: string, itc: ItcAssessment): FinanceExceptionCandidate[] {
  if (itc.risk !== "over_claimed") return [];
  return [
    {
      exceptionType: "itc_at_risk",
      referenceKey: gstPeriod,
      summary: `Input credit for ${gstPeriod}: ${itc.headline}`,
      impact: `${formatInr(itc.atRisk)} of input credit claimed in the books for ${gstPeriod} is not supported by GSTR-2B -- claiming it risks reversal with interest if it is questioned.`,
      suggestedAction:
        "Check the suppliers showing as missing in 2B -- most often they simply haven't filed their GSTR-1 yet, and the credit appears next period.",
    },
  ];
}

/** F9's own filing-readiness blockers for one GST period. The `posted` check is excluded
 * on purpose: it is the same underlying fact `deriveUnpostedDocumentExceptions` already
 * raises one exception per document for, and repeating it here as a second, coarser
 * exception would just be the same issue counted twice. */
export function deriveFilingBlockerExceptions(gstPeriod: string, blockers: ReadinessCheck[]): FinanceExceptionCandidate[] {
  return blockers
    .filter((blocker) => blocker.key !== "posted")
    .map((blocker) => ({
      exceptionType: "filing_blocker",
      referenceKey: `${gstPeriod}:${blocker.key}`,
      summary: `${blocker.label} (${gstPeriod}): ${blocker.detail}`,
      impact: `This blocks filing the ${gstPeriod} GST return until it is resolved.`,
      suggestedAction: blocker.action ?? null,
    }));
}

export function deriveFinanceExceptions(inputs: {
  unposted: UnpostedDocument[];
  gstPeriod: string;
  /** Null when the chart of accounts isn't set up -- there is nothing to assess ITC risk
   * against yet, and `deriveUnpostedDocumentExceptions`/the `accounts` filing blocker
   * already cover that case. */
  itc: ItcAssessment | null;
  blockers: ReadinessCheck[];
}): FinanceExceptionCandidate[] {
  return [
    ...deriveUnpostedDocumentExceptions(inputs.unposted),
    ...(inputs.itc ? deriveItcAtRiskExceptions(inputs.gstPeriod, inputs.itc) : []),
    ...deriveFilingBlockerExceptions(inputs.gstPeriod, inputs.blockers),
  ];
}
