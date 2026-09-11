/**
 * COMPLY-P0-02.4 (Tax Treatments): "Standard/reduced/zero/exempt/out-of-scope/
 * reverse-charge/export/import etc." -- the `TaxTreatment` concept from the backlog's own
 * §4 generic data model.
 *
 * Unlike `TaxRegistration`/`TaxRule` (real, versioned, tenant- or regulator-authored
 * records that need a table), a tax treatment is a small, closed, UNIVERSAL vocabulary --
 * every VAT/GST-shaped regime the backlog's own research surveys (India GST, EU VAT, UK
 * VAT, Singapore GST, UAE VAT, ...) uses some form of these same eight categories, per
 * §1/§2's own competitive/country research. That is exactly why this is safe to encode as
 * a fixed application-code catalog, the same shape `countries.ts`/`jurisdictions.ts`
 * already established, and does NOT conflict with the backlog's "never hard-code tax
 * rates into UI components" principle -- a treatment is a *classification*, never a rate
 * or a country-specific rule; the actual numeric rate that goes with a treatment for a
 * given country/regime/jurisdiction/date is exactly what `gst.tax_rules.value` (COMPLY-
 * P0-02.3) stores, versioned and source-cited, never this catalog.
 *
 * `gst.tax_rules.treatment` (this story's own migration) is a plain nullable text column
 * validated against this catalog in application code, not a DB enum -- same convention as
 * `regime`/`jurisdiction` on the same table, so a country pack that needs a treatment this
 * initial eight-entry list doesn't yet have (unlikely, given how universal these are, but
 * not impossible for a P1 regime) only needs an application-code change, not a migration.
 */

export type TreatmentCode =
  | "standard"
  | "reduced"
  | "zero_rated"
  | "exempt"
  | "out_of_scope"
  | "reverse_charge"
  | "export"
  | "import";

export type TreatmentCatalogEntry = {
  code: TreatmentCode;
  name: string;
  /** Plain-language explanation of what this treatment means -- a software *rule*
   * describing the classification, not a claim about any specific country's law
   * (backlog rule 12: distinguish regulatory fact from software rule). Each country/
   * regime pack's own `TaxRule.source` is what cites the actual regulatory fact. */
  description: string;
};

export const TAX_TREATMENT_CATALOG: TreatmentCatalogEntry[] = [
  {
    code: "standard",
    name: "Standard rate",
    description: "The regime's default tax rate applies to this supply.",
  },
  {
    code: "reduced",
    name: "Reduced rate",
    description: "A lower-than-standard rate applies to a specific category of supply.",
  },
  {
    code: "zero_rated",
    name: "Zero-rated",
    description: "Taxable at 0% -- unlike an exemption, input tax on related purchases is typically still recoverable.",
  },
  {
    code: "exempt",
    name: "Exempt",
    description: "No tax is charged, and input tax on related purchases is typically not recoverable.",
  },
  {
    code: "out_of_scope",
    name: "Out of scope",
    description: "The transaction falls outside this regime's tax net entirely.",
  },
  {
    code: "reverse_charge",
    name: "Reverse charge",
    description: "The recipient, not the supplier, is liable to account for the tax on this supply.",
  },
  {
    code: "export",
    name: "Export",
    description: "A cross-border outward supply -- treatment (zero-rated, exempt, ...) varies by regime.",
  },
  {
    code: "import",
    name: "Import",
    description: "A cross-border inward supply -- typically taxed at the point of entry, subject to regime-specific rules.",
  },
];

export function getTreatment(code: string): TreatmentCatalogEntry | undefined {
  return TAX_TREATMENT_CATALOG.find((t) => t.code === code);
}

export function isTreatmentSupported(code: string): boolean {
  return getTreatment(code) !== undefined;
}
