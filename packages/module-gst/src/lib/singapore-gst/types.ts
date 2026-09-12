import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P1-04 (Singapore -- GST Registration, GST F5, InvoiceNow Eligibility, Peppol
 * Identifier, InvoiceNow Adapter, Transmission Status, Five-Year Record Retention). Same
 * "versioned lookups over the generic `gst.tax_rules` engine" shape every prior country
 * pack (`canada-gst-hst/types.ts`, `us-nexus/types.ts`) already established -- Singapore
 * is a SIMPLER regime than Canada/the US in one real respect this module's own types
 * reflect throughout: it has exactly one nationwide GST rate and no sub-national
 * jurisdiction concept at all (`lib/compliance/jurisdictions.ts` has no `SG` entry, the
 * same "no catalog for a country with no sub-national tax jurisdiction" convention the
 * five EU VAT country packs already established) -- every rule lineage below uses
 * `jurisdiction: null`.
 */

export const SG_GST_REGIME = "GST";

export type SgGstStandardRateRuleValue = { ratePercent: number; label: string };
export type SgGstRegistrationThresholdRuleValue = { thresholdSgd: number; label: string };
export type SgGstProspectiveGracePeriodRuleValue = { months: number; label: string };

export type ResolvedSgGstStandardRateRule = SgGstStandardRateRuleValue & { rule: TaxRule };
export type ResolvedSgGstRegistrationThresholdRule = SgGstRegistrationThresholdRuleValue & { rule: TaxRule };
export type ResolvedSgGstProspectiveGracePeriodRule = SgGstProspectiveGracePeriodRuleValue & { rule: TaxRule };

/** The result of classifying one sale line by the buyer's own country -- Singapore has no
 * sub-national place-of-supply concept the way Canada/the US do (see this file's own
 * docstring), so this is a plain domestic-vs-export classification, not a full
 * place-of-supply cascade. `"unknown"` when the buyer's country cannot be resolved at all
 * -- never defaulted to `"domestic"` (the same "never guess in the risky direction,
 * unresolved stays unresolved" discipline `determineCaPlaceOfSupply`/`determinePlaceOfSupply`
 * (India) already established). */
export type SgSupplyClassification = { treatment: "domestic" | "export" | "unknown" };

export type SgGstRegistrationTestResult = {
  /** `false` only when no threshold rule resolved for the given date -- otherwise this
   * always resolves to a real `true`/`false` obligated value, matching
   * `SmallSupplierRegistrationDetermination`'s own (Canada) "no insufficient-information
   * branch" shape for a single-threshold comparison. */
  resolved: boolean;
  obligated: boolean | null;
  thresholdSgd: number | null;
  /** 30 days after the test date (quarter-end for the retrospective test, the forecast
   * date for the prospective test) -- IRAS's own statutory application deadline, present
   * only when `obligated` is `true`. Never a claim about when the registration itself
   * takes effect or when GST charging must begin (a real, separate IRAS determination
   * this story does not model -- see `registration.ts`'s own docstring). */
  applicationDeadline: string | null;
  reason: string;
  ruleRefs: string[];
};
