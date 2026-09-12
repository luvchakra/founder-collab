/**
 * COMPLY-P0-09.5 (Risk Dashboard). The backlog's own six worked examples --
 * "Return not approved, E-invoice deadline approaching, Unmatched ITC, Missing tax
 * registration, Invalid classification, Failed submission" -- become six `RiskSignalKind`
 * values. All six are named here even though `"failed_submission"` is never actually
 * PRODUCED by `detect.ts` today -- see that file's own docstring for the real, honest
 * reason (no table in this platform persists a failed government-submission attempt at
 * all, a gap already flagged by COMPLY-P0-05.4's own `gst.einvoices.raw_response`
 * migration comment). Keeping the kind in the type union documents the gap in the type
 * system itself, matching this module's own precedent (`EinvoiceStatusCode` keeps
 * `"submitted"`/`"rejected"`/`"failed"` in its union for the identical reason).
 */
export type RiskSignalKind = "return_not_approved" | "einvoice_deadline" | "unmatched_itc" | "missing_tax_registration" | "invalid_classification" | "failed_submission";

/** `"high"` -- something is already overdue/blocking (an obligation past due and not yet
 * filed, a breached e-invoice deadline, no registration at all). `"medium"` -- coming due
 * soon or needs triage, not yet a missed obligation. `"low"` -- a data-quality issue worth
 * fixing but with no deadline attached. Never the ONLY signal of severity (backlog rule:
 * "never rely on color alone") -- always paired with `summary`'s own plain-language text. */
export type RiskSeverity = "high" | "medium" | "low";

export type RiskSignal = {
  kind: RiskSignalKind;
  severity: RiskSeverity;
  summary: string;
  /** Which real row this signal is about, for a future row-level action (COMPLY-P0-11.4)
   * to link to -- `null` when the signal isn't about one specific row (e.g. "no
   * registration exists at all"). */
  relatedEntityType: "return_period" | "document" | "reconciliation_exception" | "item" | null;
  relatedEntityId: string | null;
};

export type RiskDashboard = {
  signals: RiskSignal[];
  /** Counts by severity -- the shape an overview dashboard (COMPLY-P0-11.1) actually
   * wants for a header summary, without re-deriving it from `signals` itself. */
  counts: { high: number; medium: number; low: number };
};
