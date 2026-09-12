/**
 * COMPLY-P0-02.2 (Tax Jurisdiction): per-country state/province/local jurisdiction
 * support -- the `TaxJurisdiction` concept from the backlog's own §4 generic data model.
 *
 * `gst.tax_registrations.jurisdiction` (COMPLY-P0-02.1) was added as a plain nullable
 * text column with no validation, on purpose, waiting for this story ("COMPLY-P0-02.2
 * adds the validated catalog this column is checked against, in application code, not a
 * schema change" -- that migration's own comment). This file is that catalog. It is a
 * lookup table, not tenant data -- "which jurisdictions exist for country X" has no
 * per-business rows, no history, no RLS -- so it lives here as application code, the same
 * shape `countries.ts` already established for the country/regime catalog (COMPLY-P0-01.2/
 * 01.3), not a new `gst`-schema table. A generic multi-country jurisdiction *table* would
 * be exactly the speculative functionality backlog rule 4 forbids: only India has any
 * jurisdiction data to validate in P0.
 *
 * Reuses `@cofounderai/core`'s existing `INDIAN_STATES` list rather than re-encoding a
 * second India states list here (CLAUDE.md non-negotiable #5 / backlog rule 1 -- check
 * before creating a parallel one) -- `INDIAN_STATES` is already the source of truth for
 * India's states in the GST profile form (`gst-profile-form.tsx`) and
 * `core.business_settings.state`. The value stored (and validated) here is the state
 * *name* ("Maharashtra"), matching that existing convention -- not the GST numeric state
 * code (`GST_STATE_CODES`'s "27"), which is a GSTIN-specific encoding, not a portable
 * cross-regime jurisdiction identifier.
 */

import { INDIAN_STATES } from "@cofounderai/core/lib/gst";
import { CA_PROVINCES } from "./ca-provinces";
import { US_STATES } from "./us-states";

export type JurisdictionLevel = "state" | "province" | "local";

export type JurisdictionCatalogEntry = {
  /** The value stored in `gst.tax_registrations.jurisdiction`. */
  name: string;
  level: JurisdictionLevel;
};

/**
 * India and (as of COMPLY-P1-02.1) the United States have real jurisdiction data. Every
 * other country in `countries.ts` -- still `status: "planned"` -- has no jurisdiction
 * catalog yet either; its own country pack (a later P1 story) is responsible for adding one
 * (e.g. Canada's provinces) alongside the rest of that regime's working logic, not this
 * story reaching ahead to guess their shape.
 *
 * The value stored for a US jurisdiction is its own two-letter USPS code (e.g. "CA"), NOT
 * the full state name the way India's own convention stores "Maharashtra" -- deliberately
 * different from India's own `name` convention because `lib/tax-rules/us-sales-tax.ts`'s
 * own versioned `gst.tax_rules` rows are keyed by that same two-letter code (matching
 * `gst.tax_registrations.jurisdiction`'s own eventual match target), and because a US
 * state's own two-letter code is already the unambiguous, universally-recognized identifier
 * for it (unlike India, which has no equivalent short-code convention already in use
 * anywhere else in this platform).
 */
const JURISDICTIONS_BY_COUNTRY: Record<string, JurisdictionCatalogEntry[]> = {
  IN: INDIAN_STATES.map((s) => ({ name: s.name, level: "state" })),
  US: US_STATES.map((s) => ({ name: s.code, level: "state" })),
  // COMPLY-P1-03.1: Canada's own provinces/territories, stored by their own two-letter
  // Canada Post code -- same "short code, not full name" convention as the US entry above,
  // for the same reason (lib/tax-rules/ca-gst-hst.ts's own versioned rows are keyed by
  // this same code).
  CA: CA_PROVINCES.map((p) => ({ name: p.code, level: "province" })),
};

export function getJurisdictions(countryCode: string): JurisdictionCatalogEntry[] {
  return JURISDICTIONS_BY_COUNTRY[countryCode] ?? [];
}

function findJurisdiction(countryCode: string, jurisdictionName: string): JurisdictionCatalogEntry | undefined {
  const normalized = jurisdictionName.trim().toLowerCase();
  return getJurisdictions(countryCode).find((j) => j.name.toLowerCase() === normalized);
}

/**
 * True only when `jurisdictionName` matches one of `countryCode`'s own known
 * jurisdictions (case-insensitively). A country with no jurisdiction catalog yet (every
 * P1-planned country today) always returns false for any non-empty name -- there is
 * nothing to validate against, so none is accepted, the same "refuse rather than silently
 * accept" stance `isRegimeSupported` already takes for an unsupported country/regime.
 * Whether a jurisdiction is required at all (e.g. every Indian registration names a
 * state) is a caller's own business rule, not this function's -- a `null`/empty
 * jurisdiction is a separate case callers must handle themselves, since plenty of regimes
 * (VAT countries with no sub-national jurisdiction concept, say) have none to validate.
 */
export function isJurisdictionSupported(countryCode: string, jurisdictionName: string): boolean {
  return findJurisdiction(countryCode, jurisdictionName) !== undefined;
}

/** The catalog's own canonical spelling for a jurisdiction name, regardless of the
 * casing/whitespace a caller passed in -- `undefined` when it isn't a known jurisdiction
 * for that country. Callers (e.g. `createTaxRegistration`) use this to store one
 * consistent spelling rather than whatever casing a form/API caller happened to submit. */
export function canonicalJurisdictionName(countryCode: string, jurisdictionName: string): string | undefined {
  return findJurisdiction(countryCode, jurisdictionName)?.name;
}
