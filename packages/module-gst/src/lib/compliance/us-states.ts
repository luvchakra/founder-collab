/**
 * COMPLY-P1-02.1 (United States -- State/Local Jurisdictions): the backlog's own §2 US
 * section says outright "the US country pack needs a jurisdiction engine rather than one
 * tax rate" -- unlike every VAT country pack (COMPLY-P1-01), which has exactly one
 * national rate, the US taxes at the STATE level (and, below that, a genuinely enormous
 * number of county/city/special-district jurisdictions this session deliberately does NOT
 * attempt to catalog -- see below).
 *
 * This is the 50-states-plus-DC catalog itself -- a structural, decades-stable geographic/
 * legal-status fact (which states exist, which of them impose ANY state-level sales tax at
 * all), the same "fixed application-code catalog, not a versioned rule" shape
 * `lib/compliance/eu.ts`'s own EU member-state list already established. The actual NUMBER
 * (a state's own rate, its own economic nexus threshold) is exactly what
 * `lib/tax-rules/us-sales-tax.ts`'s own versioned `gst.tax_rules` rows hold -- this file
 * only says which jurisdictions exist and whether the concept of a state sales tax applies
 * to them at all.
 *
 * **The five "NOMAD" states have NO state-level sales tax whatsoever** (Alaska, Delaware,
 * Montana, New Hampshire, Oregon) -- verified via WebSearch 2026-09-12 (commenda.io,
 * kiplinger.com, taxfoundation.org, galvix.com, reversesalestaxcalc.org, all independently
 * agreeing). Alaska is a genuine partial exception worth naming: it has no STATE sales tax,
 * but over 100 Alaskan municipalities impose their OWN local sales tax (up to 7.5%) -- a
 * real, source-cited nuance this catalog records (`hasLocalSalesTaxWithNoStateTax: true`
 * for Alaska only) without attempting to catalog any of those 100+ municipal rates
 * individually (exactly the "don't compete on the size of a proprietary tax database"
 * principle this backlog's own §1 conclusion states -- Avalara's own 12,000+ US
 * sales-tax-jurisdiction count is precisely the kind of granularity this platform is not
 * trying to replicate; WonderArc's own differentiator is nexus tracking and obligation
 * guidance, not address-level rate precision).
 *
 * **Only a subset of states have real, versioned rate/nexus-threshold content yet
 * (`lib/tax-rules/us-sales-tax.ts`'s own "initial focus" list, the same "five of 27 EU
 * member states" precedent COMPLY-P1-01.2 already established for a country pack that is
 * genuinely too large to fully seed in one story)** -- this catalog itself still lists
 * every one of the 50 states + DC, so `isEuMemberState`-style completeness questions
 * ("is this a real US jurisdiction at all") can be answered for all of them, even before a
 * real rate rule exists for most.
 */

export type UsStateEntry = {
  /** USPS two-letter state code. */
  code: string;
  name: string;
  /** False for the five NOMAD states -- no state-level sales tax exists to look up a rate
   * for at all (not "rate not yet seeded," a genuinely different, structural fact). */
  hasStateSalesTax: boolean;
  /** True only for Alaska: no state sales tax, but real local (municipal) sales taxes
   * exist -- named so a caller doesn't conflate "no state tax" with "no tax anywhere in
   * this state," without this platform attempting to catalog any specific municipality's
   * own rate (see this file's own docstring). */
  hasLocalSalesTaxWithNoStateTax?: boolean;
};

export const US_STATES: UsStateEntry[] = [
  { code: "AL", name: "Alabama", hasStateSalesTax: true },
  { code: "AK", name: "Alaska", hasStateSalesTax: false, hasLocalSalesTaxWithNoStateTax: true },
  { code: "AZ", name: "Arizona", hasStateSalesTax: true },
  { code: "AR", name: "Arkansas", hasStateSalesTax: true },
  { code: "CA", name: "California", hasStateSalesTax: true },
  { code: "CO", name: "Colorado", hasStateSalesTax: true },
  { code: "CT", name: "Connecticut", hasStateSalesTax: true },
  { code: "DE", name: "Delaware", hasStateSalesTax: false },
  { code: "DC", name: "District of Columbia", hasStateSalesTax: true },
  { code: "FL", name: "Florida", hasStateSalesTax: true },
  { code: "GA", name: "Georgia", hasStateSalesTax: true },
  { code: "HI", name: "Hawaii", hasStateSalesTax: true },
  { code: "ID", name: "Idaho", hasStateSalesTax: true },
  { code: "IL", name: "Illinois", hasStateSalesTax: true },
  { code: "IN", name: "Indiana", hasStateSalesTax: true },
  { code: "IA", name: "Iowa", hasStateSalesTax: true },
  { code: "KS", name: "Kansas", hasStateSalesTax: true },
  { code: "KY", name: "Kentucky", hasStateSalesTax: true },
  { code: "LA", name: "Louisiana", hasStateSalesTax: true },
  { code: "ME", name: "Maine", hasStateSalesTax: true },
  { code: "MD", name: "Maryland", hasStateSalesTax: true },
  { code: "MA", name: "Massachusetts", hasStateSalesTax: true },
  { code: "MI", name: "Michigan", hasStateSalesTax: true },
  { code: "MN", name: "Minnesota", hasStateSalesTax: true },
  { code: "MS", name: "Mississippi", hasStateSalesTax: true },
  { code: "MO", name: "Missouri", hasStateSalesTax: true },
  { code: "MT", name: "Montana", hasStateSalesTax: false },
  { code: "NE", name: "Nebraska", hasStateSalesTax: true },
  { code: "NV", name: "Nevada", hasStateSalesTax: true },
  { code: "NH", name: "New Hampshire", hasStateSalesTax: false },
  { code: "NJ", name: "New Jersey", hasStateSalesTax: true },
  { code: "NM", name: "New Mexico", hasStateSalesTax: true },
  { code: "NY", name: "New York", hasStateSalesTax: true },
  { code: "NC", name: "North Carolina", hasStateSalesTax: true },
  { code: "ND", name: "North Dakota", hasStateSalesTax: true },
  { code: "OH", name: "Ohio", hasStateSalesTax: true },
  { code: "OK", name: "Oklahoma", hasStateSalesTax: true },
  { code: "OR", name: "Oregon", hasStateSalesTax: false },
  { code: "PA", name: "Pennsylvania", hasStateSalesTax: true },
  { code: "RI", name: "Rhode Island", hasStateSalesTax: true },
  { code: "SC", name: "South Carolina", hasStateSalesTax: true },
  { code: "SD", name: "South Dakota", hasStateSalesTax: true },
  { code: "TN", name: "Tennessee", hasStateSalesTax: true },
  { code: "TX", name: "Texas", hasStateSalesTax: true },
  { code: "UT", name: "Utah", hasStateSalesTax: true },
  { code: "VT", name: "Vermont", hasStateSalesTax: true },
  { code: "VA", name: "Virginia", hasStateSalesTax: true },
  { code: "WA", name: "Washington", hasStateSalesTax: true },
  { code: "WV", name: "West Virginia", hasStateSalesTax: true },
  { code: "WI", name: "Wisconsin", hasStateSalesTax: true },
  { code: "WY", name: "Wyoming", hasStateSalesTax: true },
];

export function getUsState(code: string): UsStateEntry | undefined {
  return US_STATES.find((s) => s.code === code);
}

export function isUsState(code: string): boolean {
  return getUsState(code) !== undefined;
}

/** The five NOMAD states (no state-level sales tax) -- named as its own function since
 * "has no state sales tax" is exactly the fact several later stories (economic nexus,
 * registration obligations) need to short-circuit on: there is no rate/threshold to look
 * up, ever, for these states, not merely "not yet seeded." */
export function hasStateSalesTax(code: string): boolean {
  return getUsState(code)?.hasStateSalesTax === true;
}
