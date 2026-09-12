/**
 * COMPLY-P1-03.1/03.2 (Canada -- GST/HST / Provincial PST/QST/RST): the 10 provinces + 3
 * territories catalog -- a structural, decades-stable geographic/legal-status fact, the
 * same "fixed application-code catalog, not a versioned rule" shape `lib/compliance/
 * us-states.ts` already established for the US. The actual NUMBERS (a province's own
 * GST/HST rate, its own separate provincial sales tax rate where one exists) are exactly
 * what `lib/tax-rules/ca-gst-hst.ts`'s own versioned `gst.tax_rules` rows hold -- this file
 * only says which jurisdictions exist and which of Canada's own three tax MODELS applies
 * to each.
 *
 * Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com,
 * taxbycity.com, eeltd.ca, Wikipedia's own "Sales taxes in Canada"/"Sales tax in Alberta"
 * articles, all independently agreeing): Canada's 13 provinces/territories split into
 * exactly three tax models --
 * - **`hst`** (5): the province's own sales tax is fully HARMONIZED with the federal GST
 *   into one combined rate, collected and remitted federally as a single number -- Ontario
 *   (13%), Nova Scotia (14%), New Brunswick/Newfoundland and Labrador/Prince Edward Island
 *   (15% each).
 * - **`gst_pst`** (4): the federal 5% GST and a SEPARATE provincial sales tax are both
 *   charged, administered by DIFFERENT authorities (CRA for GST, the province's own
 *   revenue agency for its own tax) -- British Columbia (PST), Saskatchewan (PST), Manitoba
 *   (RST -- "Retail Sales Tax," not "PST," though colloquially often called PST), and
 *   Quebec (QST, administered by Revenu Québec).
 * - **`gst_only`** (4): no provincial/territorial sales tax exists at all, only the federal
 *   5% GST -- Alberta (the one PROVINCE with no PST) and the three territories (Yukon,
 *   Northwest Territories, Nunavut).
 */

export type CaTaxModel = "hst" | "gst_pst" | "gst_only";

export type CaProvinceEntry = {
  /** Canada Post's own two-letter province/territory code. */
  code: string;
  name: string;
  taxModel: CaTaxModel;
};

export const CA_PROVINCES: CaProvinceEntry[] = [
  { code: "AB", name: "Alberta", taxModel: "gst_only" },
  { code: "BC", name: "British Columbia", taxModel: "gst_pst" },
  { code: "MB", name: "Manitoba", taxModel: "gst_pst" },
  { code: "NB", name: "New Brunswick", taxModel: "hst" },
  { code: "NL", name: "Newfoundland and Labrador", taxModel: "hst" },
  { code: "NS", name: "Nova Scotia", taxModel: "hst" },
  { code: "NT", name: "Northwest Territories", taxModel: "gst_only" },
  { code: "NU", name: "Nunavut", taxModel: "gst_only" },
  { code: "ON", name: "Ontario", taxModel: "hst" },
  { code: "PE", name: "Prince Edward Island", taxModel: "hst" },
  { code: "QC", name: "Quebec", taxModel: "gst_pst" },
  { code: "SK", name: "Saskatchewan", taxModel: "gst_pst" },
  { code: "YT", name: "Yukon", taxModel: "gst_only" },
];

export function getCaProvince(code: string): CaProvinceEntry | undefined {
  return CA_PROVINCES.find((p) => p.code === code);
}

export function isCaProvince(code: string): boolean {
  return getCaProvince(code) !== undefined;
}

/** Resolves a free-text `core.addresses.state` value (which may be the two-letter code or
 * the full province/territory name, any casing) to the canonical code -- `null` when it
 * doesn't recognizably match any Canadian province/territory. Same shape and same reason
 * `lib/compliance/us-states.ts#resolveUsStateCode` already exists for the US. */
export function resolveCaProvinceCode(stateText: string | null | undefined): string | null {
  if (!stateText) return null;
  const trimmed = stateText.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (CA_PROVINCES.some((p) => p.code === upper)) return upper;
  const byName = CA_PROVINCES.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  return byName?.code ?? null;
}
