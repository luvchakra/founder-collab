import type { TreatmentCode } from "../../compliance/treatments";
import type { UsProductTaxCategory } from "../../us-product-taxability/types";

/**
 * COMPLY-P1-02.7 (United States -- Sales Tax Returns/Remittance). Unlike GSTR-1/3B/9
 * (one NATIONAL return per period), a US sales tax return is filed PER STATE -- this is
 * the return content for exactly one (business, state, period) combination, reusing
 * COMPLY-P1-02.5's own product-taxability engine and COMPLY-P1-02.6's own exemption
 * certificates to classify each sale line, rather than re-deriving either.
 */

export type UsSalesLineExemptionReason = "certificate" | "product_taxability" | "line_not_taxable" | null;

export type ResolvedUsSaleLine = {
  documentId: string;
  docType: "invoice" | "credit_note" | "debit_note";
  partyId: string;
  itemId: string;
  category: UsProductTaxCategory | null;
  /** The line's own taxable base -- SIGNED (negative for a credit note), so every total
   * in `UsSalesTaxReturn` is a plain sum, matching `aggregateGstr1`'s own credit-note-
   * subtracts convention. */
  taxableAmount: number;
  /** `false` only when COMPLY-P1-02.5's own determination could not resolve a treatment
   * at all (e.g. a `saas`/`services` category with no state-specific rule on file) -- this
   * amount is then reported separately as `unresolvedSales`, NEVER silently folded into
   * either `taxableSales` or `exemptSales` (backlog rule 11: never guess). */
  resolved: boolean;
  treatment: TreatmentCode | null;
  ratePercent: number | null;
  /** SIGNED, same convention as `taxableAmount`. `null` when `resolved` is `false`. */
  taxAmount: number | null;
  exemptionReason: UsSalesLineExemptionReason;
  /** The certificate that justified the exemption, when `exemptionReason === "certificate"`. */
  exemptionCertificateId: string | null;
  /** `gst.tax_rules.id` values this line's own determination cites -- the same
   * traceability convention `gst.tax_determinations.rule_refs` already established. */
  ruleRefs: string[];
};

export type UsSalesTaxReturn = {
  businessId: string;
  jurisdiction: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  exemptSales: number;
  exemptSalesByReason: { certificate: number; productTaxability: number; lineNotTaxable: number };
  taxableSales: number;
  /** Sales this platform could not classify as either taxable or exempt at all -- a real,
   * itemized "we don't know" bucket, never silently merged into either side. */
  unresolvedSales: number;
  taxCollected: number;
  lines: ResolvedUsSaleLine[];
  /** Itemized list of what this function does NOT model -- see `queries.ts`'s own
   * docstring. */
  notModeled: string[];
};
