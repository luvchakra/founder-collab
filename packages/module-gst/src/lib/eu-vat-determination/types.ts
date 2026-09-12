/** COMPLY-P1-01.3 (Intra-EU VAT) / COMPLY-P1-01.4 (OSS/IOSS). */

export type EuPlaceOfSupply =
  | "domestic"
  | "intra_eu_b2b"
  | "intra_eu_b2c_origin"
  | "intra_eu_b2c_destination"
  | "export"
  | "unknown";

export type EuVatDetermineInput = {
  /** ISO 3166-1 alpha-2 -- the EU member state the SELLER (this WonderArc business) is
   * VAT-registered in. This function only determines the OUTWARD-supply treatment for a
   * sale that business makes -- not the treatment of something it purchases (a real,
   * plausible future need, deliberately left out here: this platform has no purchase-side
   * EU VAT determination consumer yet, matching backlog rule 5). */
  sellerCountry: string;
  /** ISO 3166-1 alpha-2 -- the buyer's own country. */
  buyerCountry: string;
  /**
   * True only when the buyer supplied a VAT ID AND it passed validation (COMPLY-P1-01.5's
   * own format/checksum check, or a live VIES confirmation where reachable) -- this
   * function does NOT re-validate a VAT ID itself, it trusts the caller's own already-
   * resolved boolean. A buyer with no VAT ID, or one that failed validation, is treated as
   * B2C -- collapsing "no VAT ID given" and "gave an invalid VAT ID" into the same
   * B2C-shaped outcome is deliberate: a supplier can never safely apply intra-EU B2B
   * zero-rating/reverse charge on an unverified VAT ID (the EU's own "wrongly-zero-rated
   * supply is the SUPPLIER's liability" rule -- named here, not modeled as a separate
   * error state this generic function has no way to escalate further).
   */
  buyerVatIdValidated: boolean;
  /**
   * Required only for a B2C intra-EU sale (ignored otherwise): this business's own
   * cumulative EUR value of intra-EU B2C distance sales of goods plus digital/
   * telecommunications/broadcasting services for the current calendar year so far,
   * INCLUDING this sale -- a caller-DECLARED running total (backlog rule 12: this is a
   * self-declared fact, not something this function computes by re-summing a business's
   * own past invoices, the same "self-declared, not computed" posture
   * COMPLY-P0-04.2's own `eInvoiceEligible` flag and COMPLY-P0-04.5's own `reverseCharge`
   * flag already take). `null`/`undefined` means "not supplied" -- the result is
   * `incomplete: true`, never a guessed origin/destination split.
   */
  cumulativeEuDistanceSalesEur?: number | null;
  /**
   * The EU-wide OSS distance-selling threshold (COMPLY-P1-01.4's own versioned
   * `oss_distance_selling_threshold_eur` rule, EUR 10,000 as of this rule's own effective
   * date) in effect as of the sale date -- a caller-resolved input, never hard-coded in
   * this function (this session's own single most-repeated instruction). Ignored for a
   * domestic, export, or B2B sale, none of which need it; `null` means "could not be
   * resolved," and only actually matters (producing `incomplete: true`) if the sale turns
   * out to need it -- an unresolved threshold must never block a domestic/export/B2B
   * determination that never needed one in the first place.
   */
  ossThresholdEur: number | null;
};

export type EuVatDetermineResult = {
  /** One of `lib/compliance/treatments.ts`'s own catalog codes, or `null` when
   * `incomplete` (no treatment can be determined yet). */
  treatment: "standard" | "reverse_charge" | "export" | null;
  placeOfSupply: EuPlaceOfSupply;
  /** Which country's own `vat_standard_rate`/`vat_reduced_rates` lineage a caller should
   * look up to actually rate this line -- `null` for a reverse-charge or export supply
   * (no VAT is charged on the seller's own invoice either way). */
  rateCountry: string | null;
  reason: string;
  incomplete: boolean;
};
