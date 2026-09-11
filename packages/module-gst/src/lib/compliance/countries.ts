/**
 * The Compliance module's country/regime catalog -- COMPLY-P0-01.2 (Country Selector) /
 * COMPLY-P0-01.3 (Tax Regime Selector) / COMPLY-P0-01.5 (Unsupported-Country UX).
 *
 * This is the ONE place a country or regime name/label may be hard-coded anywhere in
 * this module (backlog rule 8: "Never hard-code tax rates into UI components" -- read
 * here as the whole "never hard-code country-specific facts into the UI" principle the
 * doc's product decision states explicitly: "Use one generic Compliance domain plus
 * country/regime packs with versioned rules ... Never hard-code country-specific rules
 * into the UI"). UI components read this catalog rather than switching on a country code
 * themselves; TAX RATES/TREATMENTS are a separate, later concern (COMPLY-P0-02.3
 * Versioned Tax Rules) -- this file is purely "what countries/regimes exist and which
 * ones this build actually supports," never a rate or a legal rule.
 *
 * `status: "supported"` means the platform has a real, working implementation for that
 * country's regime (India/GST, built across COMPLY-P0-04 through 10). `status:
 * "planned"` means the regime is named in this backlog's own research (§2) as a P1
 * target but has no implementation yet -- selecting one is refused by the mutation layer,
 * not just hidden in the UI (defense in depth, same pattern as every other
 * license/permission check in this platform).
 */

export type RegimeCatalogEntry = {
  /** Free-text key stored in `gst.compliance_profiles.regime` -- not an enum in the
   * database (see that migration's own comment), but a fixed, known set here since this
   * catalog IS the source of truth for which regimes exist at all. */
  key: string;
  name: string;
};

export type CountryCatalogEntry = {
  /** ISO 3166-1 alpha-2, matches `gst.compliance_profiles.country`. */
  code: string;
  name: string;
  status: "supported" | "planned";
  regimes: RegimeCatalogEntry[];
};

export const COUNTRY_CATALOG: CountryCatalogEntry[] = [
  {
    code: "IN",
    name: "India",
    status: "supported",
    regimes: [{ key: "GST", name: "GST (Goods & Services Tax)" }],
  },
  // P1 targets (backlog §7/§8) -- named here so the country selector can show them as
  // "Planned" rather than omitting them outright (COMPLY-P0-01.5's own "clearly show
  // supported vs planned capability"), but with no working regime logic behind them yet.
  { code: "US", name: "United States", status: "planned", regimes: [{ key: "SALES_TAX", name: "Sales Tax" }] },
  { code: "CA", name: "Canada", status: "planned", regimes: [{ key: "GST_HST", name: "GST/HST" }] },
  { code: "SG", name: "Singapore", status: "planned", regimes: [{ key: "GST", name: "GST (Goods & Services Tax)" }] },
  { code: "DE", name: "Germany", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "FR", name: "France", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "BE", name: "Belgium", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "PL", name: "Poland", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "IT", name: "Italy", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "AE", name: "United Arab Emirates", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "SA", name: "Saudi Arabia", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "AU", name: "Australia", status: "planned", regimes: [{ key: "GST", name: "GST (Goods & Services Tax)" }] },
  { code: "NZ", name: "New Zealand", status: "planned", regimes: [{ key: "GST", name: "GST (Goods & Services Tax)" }] },
  { code: "MY", name: "Malaysia", status: "planned", regimes: [{ key: "SST", name: "Sales & Service Tax" }] },
  { code: "TH", name: "Thailand", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
  { code: "ID", name: "Indonesia", status: "planned", regimes: [{ key: "VAT", name: "VAT / e-Faktur" }] },
  { code: "JP", name: "Japan", status: "planned", regimes: [{ key: "CONSUMPTION_TAX", name: "Consumption Tax" }] },
  { code: "KR", name: "South Korea", status: "planned", regimes: [{ key: "VAT", name: "VAT" }] },
];

export function getCountry(code: string): CountryCatalogEntry | undefined {
  return COUNTRY_CATALOG.find((c) => c.code === code);
}

export function isCountrySupported(code: string): boolean {
  return getCountry(code)?.status === "supported";
}

/** True only when both the country is supported AND the regime is one of that
 * country's own catalog entries -- a supported country selected with a regime key that
 * isn't actually one of its regimes is just as invalid as an unsupported country. */
export function isRegimeSupported(countryCode: string, regimeKey: string): boolean {
  const country = getCountry(countryCode);
  if (!country || country.status !== "supported") return false;
  return country.regimes.some((r) => r.key === regimeKey);
}

/** The regime a freshly-selected supported country defaults to -- every current
 * "supported" entry has exactly one regime, so "the first one" is unambiguous; a future
 * country with more than one regime (e.g. a US-shaped sales-tax-vs-something split) will
 * need real regime-selection UI (COMPLY-P0-01.3) to override this default, not this
 * function to guess right. */
export function defaultRegimeFor(countryCode: string): string | undefined {
  return getCountry(countryCode)?.regimes[0]?.key;
}
