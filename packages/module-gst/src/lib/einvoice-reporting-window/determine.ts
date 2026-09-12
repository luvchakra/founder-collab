import type { TaxRule } from "../tax-rules/types";

export type EinvoiceReportingDeadlineStatus = "not_restricted" | "within_window" | "deadline_breached" | "unknown";

export type EinvoiceReportingDeadlineResult = {
  status: EinvoiceReportingDeadlineStatus;
  reason: string;
  aatoThresholdInr: number | null;
  windowDays: number | null;
  rule: TaxRule | null;
  /** `invoiceDate` + `windowDays` -- only set when `status` is `"within_window"` or
   * `"deadline_breached"` (i.e. the window rule actually applies to this business's
   * turnover); `null` for `"not_restricted"`/`"unknown"`. */
  deadline: string | null;
};

/** Pure: adds `days` calendar days to an ISO `YYYY-MM-DD` date string, returning another
 * ISO date string. Parsed/formatted at UTC midnight throughout so this never drifts by a
 * day depending on the server's own local timezone. Exported so this arithmetic is
 * independently testable. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * COMPLY-P0-05.5 (Reporting Deadline Control). Pure: every fact this needs (the invoice's
 * own date, the moment to evaluate against, a turnover figure, and the currently-effective
 * window rule) is resolved by the caller (`queries.ts`'s own orchestrator), matching this
 * module's established "pure core function, thin orchestrator" convention.
 *
 * `asOf` serves two distinct real uses through the same parameter, deliberately not two
 * separate functions: pass the e-invoice's own actual generation timestamp (e.g.
 * `gst.einvoices.created_at`) to check HISTORICALLY whether it made its deadline, or omit
 * it (defaults to today) to check whether an as-yet-ungenerated invoice still has time --
 * the comparison logic is identical either way.
 *
 * The threshold test is `aggregateTurnoverInr >= aatoThresholdInr` ("AATO of ₹10 crore OR
 * MORE" per the rule's own real wording) -- deliberately NOT the same `>` ("exceeding")
 * comparison COMPLY-P0-05.1's own `determineEinvoiceEligibility` uses for the ₹5 crore
 * mandate threshold. Two different real GST rules use two different real comparisons;
 * this function does not smooth them into one shared convention.
 */
export function determineEinvoiceReportingDeadline(input: {
  invoiceDate: string;
  asOf?: string;
  aggregateTurnoverInr: number | null;
  aatoThresholdInr: number | null;
  windowDays: number | null;
  rule: TaxRule | null;
}): EinvoiceReportingDeadlineResult {
  const base = { aatoThresholdInr: input.aatoThresholdInr, windowDays: input.windowDays, rule: input.rule };

  if (input.aatoThresholdInr === null || input.windowDays === null) {
    return { ...base, status: "unknown", reason: "No e-invoice reporting-window rule could be resolved for this date.", deadline: null };
  }

  if (input.aggregateTurnoverInr === null) {
    return {
      ...base,
      status: "unknown",
      reason: "No aggregate turnover figure is available to determine whether the reporting window applies.",
      deadline: null,
    };
  }

  if (input.aggregateTurnoverInr < input.aatoThresholdInr) {
    return {
      ...base,
      status: "not_restricted",
      reason: `Turnover is below the ₹${input.aatoThresholdInr.toLocaleString("en-IN")} AATO threshold this reporting window applies to -- no reporting deadline restriction on this invoice.`,
      deadline: null,
    };
  }

  const deadline = addDays(input.invoiceDate, input.windowDays);
  const asOfDate = input.asOf ?? new Date().toISOString().slice(0, 10);
  const withinWindow = asOfDate <= deadline;

  return {
    ...base,
    status: withinWindow ? "within_window" : "deadline_breached",
    reason: withinWindow
      ? `This invoice must be reported to the IRP by ${deadline} (${input.windowDays} days from its own invoice date) -- still within the window as of ${asOfDate}.`
      : `This invoice's ${input.windowDays}-day e-invoice reporting window closed on ${deadline} -- the IRP will refuse a submission reported after this date.`,
    deadline,
  };
}
