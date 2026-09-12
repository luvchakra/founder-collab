import { getFilingCalendar } from "../calendar/queries";
import { listOpenReconciliationExceptions } from "../exceptions/queries";
import { getEffectiveComplianceProfile } from "../compliance/queries";
import { listTaxRegistrationsForRegime } from "../tax-registrations/queries";
import { listAllItemTaxContexts } from "../inventory-tax-context/queries";
import { resolveOutwardDocuments } from "../returns/shared/queries";
import { getEinvoiceForDocument } from "../einvoicing/queries";
import { estimateTrailingSalesTurnoverInr } from "../einvoice-eligibility/turnover";
import { getEffectiveEinvoiceReportingWindow } from "../einvoice-reporting-window/rule";
import { determineEinvoiceReportingDeadline } from "../einvoice-reporting-window/determine";
import { detectReturnNotApprovedSignals, detectEinvoiceDeadlineSignals, detectUnmatchedItcSignals, detectMissingRegistrationSignal, detectInvalidClassificationSignals, type EinvoiceRiskCandidate } from "./detect";
import type { RiskDashboard, RiskSignal } from "./types";

/**
 * COMPLY-P0-09.5 (Risk Dashboard): the orchestrator -- gathers already-persisted/
 * already-computed facts from every prior epic this session's own reconnaissance
 * confirmed as reachable (COMPLY-P0-04 registrations, COMPLY-P0-05 e-invoicing,
 * COMPLY-P0-08 reconciliation, COMPLY-P0-09.1/09.4 filing calendar/overdue detection,
 * COMPLY-P0-03.2 item classification) and hands them to `detect.ts`'s own pure functions.
 * Reads real state -- never invents a signal from nothing (backlog rule 11).
 */

const EINVOICE_LOOKBACK_DAYS = 45;

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Every outward document in the last `EINVOICE_LOOKBACK_DAYS` days that has no
 * `gst.einvoices` row yet, paired with its own e-invoice reporting-deadline status --
 * bounded to a recent window rather than scanning this business's entire document
 * history, a real, named limitation: an ancient un-reported mandated e-invoice older than
 * this window will not be caught by this dashboard. Turnover and the reporting-window
 * rule are each resolved ONCE for the whole batch (not once per document) -- unlike
 * `getEinvoiceReportingDeadline`'s own per-document orchestrator, which is the right
 * choice for a single-document page but would mean `N` redundant turnover/rule queries
 * here.
 */
async function getEinvoiceRiskCandidates(businessId: string, asOf: string): Promise<EinvoiceRiskCandidate[]> {
  const periodStart = addDaysIso(asOf, -EINVOICE_LOOKBACK_DAYS);
  const [documents, turnoverInr, windowRule] = await Promise.all([
    resolveOutwardDocuments(businessId, periodStart, asOf),
    estimateTrailingSalesTurnoverInr(businessId, asOf),
    getEffectiveEinvoiceReportingWindow(asOf),
  ]);

  const candidates: EinvoiceRiskCandidate[] = [];
  for (const document of documents) {
    const existing = await getEinvoiceForDocument(businessId, document.documentId);
    if (existing) continue; // already generated or cancelled -- not a risk

    const result = determineEinvoiceReportingDeadline({
      invoiceDate: document.docDate,
      asOf,
      aggregateTurnoverInr: turnoverInr,
      aatoThresholdInr: windowRule?.aatoThresholdInr ?? null,
      windowDays: windowRule?.windowDays ?? null,
      rule: windowRule?.rule ?? null,
    });
    if (result.status === "not_restricted" || result.status === "unknown") continue;

    candidates.push({ documentId: document.documentId, docNumber: document.number, deadlineStatus: result.status, deadline: result.deadline });
  }
  return candidates;
}

function countBySeverity(signals: RiskSignal[]): RiskDashboard["counts"] {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const signal of signals) counts[signal.severity]++;
  return counts;
}

/**
 * The full Risk Dashboard for a business as of `asOf` (defaults to today). Reads:
 * - the Filing Calendar (COMPLY-P0-09.1), windowed 3 months back / 1 month forward (and 1
 *   quarter back/forward for a QRMP filer) so a recently-missed obligation still shows up
 *   -> `"return_not_approved"`.
 * - outward documents in the last 45 days lacking an e-invoice -> `"einvoice_deadline"`.
 * - every open reconciliation exception (COMPLY-P0-08.6) -> `"unmatched_itc"`.
 * - whether this business's effective country/regime has an active registration on file
 *   (COMPLY-P0-04.1) -> `"missing_tax_registration"`.
 * - every active item's own HSN/SAC classification (COMPLY-P0-04.3) ->
 *   `"invalid_classification"`.
 * `"failed_submission"` never appears -- see `detect.ts`'s own docstring for why.
 */
export async function getRiskDashboard(businessId: string, asOf: string = new Date().toISOString().slice(0, 10)): Promise<RiskDashboard> {
  const [filingCalendar, openExceptions, complianceProfile, items, einvoiceCandidates] = await Promise.all([
    getFilingCalendar(businessId, { referenceDate: asOf, monthsBack: 3, monthsForward: 1, quartersBack: 1, quartersForward: 1 }),
    listOpenReconciliationExceptions(businessId),
    getEffectiveComplianceProfile(businessId),
    listAllItemTaxContexts(businessId),
    getEinvoiceRiskCandidates(businessId, asOf),
  ]);

  const registrations = await listTaxRegistrationsForRegime(businessId, complianceProfile.country, complianceProfile.regime);
  const hasActiveRegistration = registrations.some((r) => r.registration_status === "active");

  const signals: RiskSignal[] = [
    ...detectReturnNotApprovedSignals(filingCalendar, asOf),
    ...detectEinvoiceDeadlineSignals(einvoiceCandidates, asOf),
    ...detectUnmatchedItcSignals(openExceptions),
    ...detectMissingRegistrationSignal(hasActiveRegistration, complianceProfile.country, complianceProfile.regime),
    ...detectInvalidClassificationSignals(items),
  ];

  return { signals, counts: countBySeverity(signals) };
}
