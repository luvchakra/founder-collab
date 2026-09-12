/**
 * COMPLY-P1-01.1 (EU VAT Core): "EU should be a region containing member-state country
 * packs" (backlog §2, European Union section) -- NOT a new schema/table (the whole point
 * of this session's own most-repeated instruction: "one generic Compliance domain plus
 * country/regime packs ... never hard-code country-specific rules into the UI"). This is
 * the ONE place "which countries are EU member states" is named, the same
 * application-code-catalog shape `countries.ts`/`jurisdictions.ts` already established for
 * "which countries/regimes/jurisdictions exist" -- a fixed, structural, non-tax-rate fact
 * (EU membership), not a versioned regulatory rule, so it does NOT go through
 * `gst.tax_rules` the way an actual VAT rate/threshold does (backlog rule 6 applies to tax
 * RULES, not to "which countries are in a trade bloc").
 *
 * This catalog is what COMPLY-P1-01.3 (Intra-EU VAT)'s own `lib/eu-vat/determine.ts` reads
 * to decide whether a transaction is domestic/intra-EU/export -- it does not, by itself,
 * decide anything about tax treatment.
 *
 * Deliberately lists all 27 current EU member states, not just the five this build has
 * working VAT-rate/e-invoicing content for (`countries.ts`'s own `COUNTRY_CATALOG`) --
 * "is this buyer's country in the EU" is a geography fact independent of which member
 * states WonderArc has actually built a working country pack for yet. A seller determining
 * intra-EU treatment for a buyer in an EU country this build has no rate content for yet
 * (e.g. the Netherlands) still needs to know it's intra-EU, even though no rate lookup can
 * complete for it -- `lib/eu-vat/determine.ts`'s own docstring names this gap explicitly.
 *
 * Membership list as of this story's own research date (2026-09-12): the 27 member states
 * of the European Union (the United Kingdom left 1-Feb-2020; Northern Ireland's own
 * post-Brexit VAT-on-goods arrangement, "XI", is a real, separate EU-VIES-adjacent case
 * this catalog deliberately does NOT model -- a genuinely different, smaller-scope fact
 * than "is this an EU member state," left for a future story if a real need appears,
 * matching backlog rule 5's "don't implement future stories implicitly").
 */

export const EU_MEMBER_STATE_CODES = [
  "AT", // Austria
  "BE", // Belgium
  "BG", // Bulgaria
  "HR", // Croatia
  "CY", // Cyprus
  "CZ", // Czechia
  "DK", // Denmark
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "HU", // Hungary
  "IE", // Ireland
  "IT", // Italy
  "LV", // Latvia
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "NL", // Netherlands
  "PL", // Poland
  "PT", // Portugal
  "RO", // Romania
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  "SE", // Sweden
] as const;

export type EuMemberStateCode = (typeof EU_MEMBER_STATE_CODES)[number];

export function isEuMemberState(countryCode: string): boolean {
  return (EU_MEMBER_STATE_CODES as readonly string[]).includes(countryCode);
}

/**
 * The `country` value used for a handful of genuinely pan-EU (not any one member state's
 * own) versioned rules -- the OSS distance-selling threshold and the IOSS consignment-value
 * threshold (COMPLY-P1-01.4), both set at EU level by Council directive, not by any single
 * member state's own legislature. `gst.tax_rules.country` only checks `^[A-Z]{2}$`
 * (COMPLY-P0-02.3's own migration), so this two-letter sentinel fits the column's own
 * format constraint without being a real ISO 3166-1 country code -- documented here, in the
 * one place this module names EU-level concepts, rather than left as a magic string
 * wherever `getEffectiveTaxRule({ country: "EU", ... })` is called.
 */
export const EU_WIDE_RULE_COUNTRY = "EU";
