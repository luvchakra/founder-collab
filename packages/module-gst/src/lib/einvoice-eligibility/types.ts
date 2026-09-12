import type { TaxRule } from "../tax-rules/types";

/** Where a turnover figure used in an eligibility determination came from -- surfaced
 * explicitly so a caller never mistakes this module's own rough document-based proxy for
 * a business-confirmed, legally exact figure (backlog rule 12). */
export type TurnoverSource = "declared" | "estimated_from_documents";

/**
 * COMPLY-P0-05.1 (E-Invoice Eligibility): "Determine obligation using active rules." The
 * result of comparing a turnover figure against the versioned e-invoice threshold rule in
 * effect on a given date -- NEVER a claim that a business "is" or "is not" e-invoice
 * compliant (backlog rule 11), only whether the OBLIGATION appears to apply given the
 * inputs at hand.
 */
export type EinvoiceEligibilityResult = {
  /** `null` only when there wasn't enough information to answer at all (no threshold rule
   * resolved for the date, or no turnover figure available) -- never defaulted to `false`
   * just because a fact was missing. */
  mandated: boolean | null;
  reason: string;
  thresholdInr: number | null;
  /** The full versioned rule row this determination was made under, for traceability
   * (backlog rule 14 / the future COMPLY-P0-10.4 Source Traceability story's own job) --
   * `null` when no rule version covers the given date. */
  thresholdRule: TaxRule | null;
  turnoverInr: number | null;
  turnoverSource: TurnoverSource;
  /** The business's own self-declared flag (COMPLY-P0-04.2's `eInvoiceEligible`) on its
   * primary IN/GST registration, surfaced alongside the rule-based answer and never
   * silently overridden by it -- `null` when there is no primary India GST registration
   * to read a profile from at all. */
  selfDeclaredEligible: boolean | null;
};
