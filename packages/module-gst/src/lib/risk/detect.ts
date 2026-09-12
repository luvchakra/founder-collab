import { isFilingOverdue } from "../calendar/overdue";
import type { FilingObligation } from "../calendar/types";
import type { ReconciliationException } from "../exceptions/types";
import { validateItemHsnSac } from "../inventory-tax-context/hsn-sac";
import type { ItemTaxContext } from "../inventory-tax-context/types";
import type { EinvoiceReportingDeadlineStatus } from "../einvoice-reporting-window/determine";
import type { RiskSignal } from "./types";

/**
 * COMPLY-P0-09.5 (Risk Dashboard): pure detection over already-fetched facts -- every
 * function here takes data `queries.ts`'s orchestrator already assembled from Epics
 * 04-09's own real, persisted state, never invents or queries anything itself. Matches
 * this module's "pure core function, thin orchestrator" convention exactly.
 *
 * **`"failed_submission"` is never produced by anything in this file, on purpose, named
 * here rather than silently omitted**: `lib/einvoice-status/determine.ts`'s own docstring
 * already flags this precisely -- `generateEinvoice`/`generateEwayBill` insert a row ONLY
 * on a successful government response; a rejected or technically failed submission
 * attempt throws and persists NOTHING, so there is no row anywhere in this platform for a
 * risk detector to read a failure out of. Fabricating a signal that can never actually
 * fire would be worse than omitting it (backlog rule 11: never claim a detection
 * capability that doesn't exist) -- flagged here as a concrete follow-up for whichever
 * future story changes `generateEinvoice`/`generateEwayBill`'s own error path to persist a
 * failed-attempt row (the same follow-up COMPLY-P0-05.4/05.6 already named).
 */

/** How many days out an e-invoice reporting deadline counts as "approaching" rather than
 * merely "on track" -- WonderArc's own product threshold (like the reminder engine's own
 * lead days), not a government rule, so not sourced from `gst.tax_rules`. */
export const EINVOICE_DEADLINE_APPROACHING_DAYS = 3;

function daysUntil(dateIso: string, asOf: string): number {
  const target = new Date(`${dateIso}T00:00:00Z`).getTime();
  const from = new Date(`${asOf}T00:00:00Z`).getTime();
  return Math.round((target - from) / (24 * 60 * 60 * 1000));
}

/**
 * "Return not approved": a filing obligation whose own due date has already passed and
 * whose `gst.return_periods` lifecycle status has not reached `"approved"` or `"filed"`.
 * Deliberately does NOT flag a period that is merely IN PROGRESS but not yet due --
 * COMPLY-P0-09.3's own Reminder Engine is the proactive "coming due soon" nudge; this
 * dashboard's own job is to surface what has ALREADY become a real problem.
 */
export function detectReturnNotApprovedSignals(obligations: FilingObligation[], asOf: string): RiskSignal[] {
  const signals: RiskSignal[] = [];
  for (const obligation of obligations) {
    if (obligation.status === "approved" || obligation.status === "filed") continue;
    const overdue = isFilingOverdue(obligation, asOf);
    if (overdue.status !== "overdue") continue;
    const stage = obligation.status ?? "not started";
    signals.push({
      kind: "return_not_approved",
      severity: "high",
      summary: `${obligation.returnType.toUpperCase()} for ${obligation.periodStart} to ${obligation.periodEnd} was due ${obligation.dueDate} (${overdue.daysOverdue} day${overdue.daysOverdue === 1 ? "" : "s"} ago) and is still "${stage}."`,
      relatedEntityType: obligation.returnPeriodId ? "return_period" : null,
      relatedEntityId: obligation.returnPeriodId,
    });
  }
  return signals;
}

export type EinvoiceRiskCandidate = {
  documentId: string;
  docNumber: string | null;
  deadlineStatus: EinvoiceReportingDeadlineStatus;
  deadline: string | null;
};

/**
 * "E-invoice deadline approaching": a mandated, not-yet-generated e-invoice whose
 * reporting window has either already closed (`"deadline_breached"` -- always `"high"`,
 * a real missed obligation) or closes within `EINVOICE_DEADLINE_APPROACHING_DAYS`
 * (`"medium"` -- still actionable). A `candidate` already known to have a generated/
 * cancelled `gst.einvoices` row, or one this business isn't mandated for at all
 * (`"not_restricted"`), is never passed in here at all -- filtering that out is
 * `queries.ts`'s own job (it already has the row to check), not this pure function's.
 */
export function detectEinvoiceDeadlineSignals(candidates: EinvoiceRiskCandidate[], asOf: string): RiskSignal[] {
  const signals: RiskSignal[] = [];
  for (const candidate of candidates) {
    if (candidate.deadlineStatus === "deadline_breached") {
      signals.push({
        kind: "einvoice_deadline",
        severity: "high",
        summary: `Document ${candidate.docNumber ?? candidate.documentId}'s e-invoice reporting window closed on ${candidate.deadline} and no IRN has been generated.`,
        relatedEntityType: "document",
        relatedEntityId: candidate.documentId,
      });
      continue;
    }
    if (candidate.deadlineStatus === "within_window" && candidate.deadline) {
      const remaining = daysUntil(candidate.deadline, asOf);
      if (remaining >= 0 && remaining <= EINVOICE_DEADLINE_APPROACHING_DAYS) {
        signals.push({
          kind: "einvoice_deadline",
          severity: "medium",
          summary: `Document ${candidate.docNumber ?? candidate.documentId}'s e-invoice reporting window closes ${candidate.deadline} (${remaining} day${remaining === 1 ? "" : "s"} left) and no IRN has been generated yet.`,
          relatedEntityType: "document",
          relatedEntityId: candidate.documentId,
        });
      }
    }
  }
  return signals;
}

/** "Unmatched ITC": every currently-OPEN `gst.reconciliation_exceptions` row (a
 * supplier mismatch, a missing-in-2B/missing-in-books gap, or an unresolved IMS
 * `"pending"` action) -- one signal per exception, matching this module's own row-level
 * triage shape (each is independently resolved/dismissed, COMPLY-P0-08.6). */
export function detectUnmatchedItcSignals(openExceptions: ReconciliationException[]): RiskSignal[] {
  return openExceptions.map((exception) => ({
    kind: "unmatched_itc",
    severity: "medium",
    summary: `${exception.returnPeriod}: ${exception.summary}`,
    relatedEntityType: "reconciliation_exception",
    relatedEntityId: exception.id,
  }));
}

/** "Missing tax registration": this business's own effective Compliance country/regime
 * has no ACTIVE registration on file at all -- the single highest-severity signal this
 * dashboard produces, since nothing else (e-invoicing, e-way bills, returns) can be
 * correctly determined without one. */
export function detectMissingRegistrationSignal(hasActiveRegistration: boolean, country: string, regime: string): RiskSignal[] {
  if (hasActiveRegistration) return [];
  return [
    {
      kind: "missing_tax_registration",
      severity: "high",
      summary: `No active ${regime} registration is on file for ${country} -- tax determination, e-invoicing, e-way bills and returns cannot be correctly computed until one is added.`,
      relatedEntityType: null,
      relatedEntityId: null,
    },
  ];
}

/** "Invalid classification": an active item whose HSN/SAC code is missing or
 * structurally invalid for its own kind (COMPLY-P0-04.3's own `validateItemHsnSac`) --
 * one signal per item. `"not_applicable"`/`"valid"` items are never flagged (a real,
 * correct absence of a code, or a real, correct one, is not a risk). */
export function detectInvalidClassificationSignals(items: Pick<ItemTaxContext, "id" | "name" | "kind" | "hsnCode">[]): RiskSignal[] {
  const signals: RiskSignal[] = [];
  for (const item of items) {
    const result = validateItemHsnSac(item);
    if (result.status === "valid" || result.status === "not_applicable") continue;
    signals.push({
      kind: "invalid_classification",
      severity: "low",
      summary: `"${item.name}": ${result.reason ?? "HSN/SAC classification issue."}`,
      relatedEntityType: "item",
      relatedEntityId: item.id,
    });
  }
  return signals;
}
