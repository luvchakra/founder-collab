/**
 * COMPLY-P1-01.5 (VAT ID Validation / VIES Where Supported): format + checksum validation
 * for the EU VAT identification numbers of this build's five supported country packs
 * (Germany, France, Belgium, Poland, Italy) -- the same "format regex + real checksum
 * algorithm" rigor `core/lib/gst.ts`'s own GSTIN validation already established for India
 * (`GSTIN_FORMAT` + its own mod-36 check-character verification), not just a bare regex.
 *
 * Deliberately NOT modeled as a versioned `gst.tax_rules` row the way a VAT RATE or a
 * filing deadline is (backlog rule 6 applies to regulatory facts that can change over
 * time/jurisdiction -- a rate, a threshold, a deadline). A VAT number's own check-digit
 * ALGORITHM is a structural, decades-stable mathematical fact about that country's own
 * numbering scheme, not something a government notification revises the way a rate slab
 * or a due date is revised -- the same "fixed application-code catalog, not a versioned
 * rule" reasoning `lib/compliance/treatments.ts`'s own docstring already applies to the
 * universal treatment vocabulary.
 *
 * **A real, honest scope limitation named rather than silently overclaimed**: this is
 * FORMAT/CHECKSUM validation only -- it confirms a VAT ID is *structurally well-formed* for
 * its country, never that it is *currently registered* to any real business. Confirming
 * registration requires a live VIES lookup (`lib/eu-vat-id/vies-adapter.ts`), which this
 * sandboxed session's own network egress proxy blocks for every EU Commission domain tried
 * (`ec.europa.eu`, `taxation-customs.ec.europa.eu`) -- see that file's own docstring.
 */

export type SupportedEuVatIdCountry = "DE" | "FR" | "BE" | "PL" | "IT";

export const SUPPORTED_EU_VAT_ID_COUNTRIES: readonly SupportedEuVatIdCountry[] = ["DE", "FR", "BE", "PL", "IT"];

export type EuVatIdValidationResult = {
  /** True only when the country prefix is one this build validates AND the remainder
   * passes that country's own format+checksum check. */
  valid: boolean;
  /** False when `countryCode` isn't one of `SUPPORTED_EU_VAT_ID_COUNTRIES` -- this function
   * has no format/checksum rule to apply at all, so `valid` is always `false` in that case
   * too, but a caller needs to distinguish "we checked and it's wrong" from "we don't know
   * how to check this country yet" (the same distinction `isJurisdictionSupported`'s own
   * docstring already draws for a country with no jurisdiction catalog). */
  countrySupported: boolean;
  reason: string;
};

function isDigits(s: string, length: number): boolean {
  return new RegExp(`^[0-9]{${length}}$`).test(s);
}

/** Germany: DE + 9 digits, the 9th being a check digit over the first 8 via ISO 7064
 * MOD 11,10. Verified via WebSearch 2026-09-12 (lookuptax.com, vat-scan.com, vatdb.com,
 * globalidcheck.com, validatelist.com -- all independently describing the same algorithm). */
function validateDe(digits9: string): boolean {
  if (!isDigits(digits9, 9)) return false;
  let product = 10;
  for (let i = 0; i < 8; i++) {
    const d = Number(digits9[i]);
    let sum = (d + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const checkDigit = (11 - product) % 10;
  return checkDigit === Number(digits9[8]);
}

/** France: FR + a 2-character key (digits, or occasionally letters for cases this
 * function doesn't attempt to validate) + the 9-digit SIREN. When the key is purely
 * numeric, verified against `key = (12 + 3 * (SIREN mod 97)) mod 97` -- verified via
 * WebSearch 2026-09-12 (randomsiret.fr, calctools.be, avats.fr, vatdb.com), whose own
 * worked example (SIREN 404833048 -> key 83, i.e. "FR83404833048") this function's own
 * test suite reuses directly. A letter-containing key is accepted as FORMAT-valid without a
 * checksum check -- this module has no documented rule for when/how a letter key is
 * assigned, a named, honest gap rather than a guessed algorithm. */
function validateFr(key: string, siren: string): boolean {
  if (!/^[0-9A-Z]{2}$/.test(key) || !isDigits(siren, 9)) return false;
  if (!/^[0-9]{2}$/.test(key)) return true; // letter key: format-valid, checksum not modeled (see above)
  const expected = (12 + 3 * (Number(siren) % 97)) % 97;
  return Number(key) === expected;
}

/** Belgium: BE + 10 digits (first digit 0 or 1). The last two digits are a modulo-97
 * check: `checkDigits = 97 - (first eight digits mod 97)` (a remainder of 0 yields the
 * valid two-digit checksum "97", not a special-cased "00"). Verified via WebSearch
 * 2026-09-12 (commenda.io, metacpan.org Algorithm::CheckDigits::M97_001, vatdb.com). */
function validateBe(digits10: string): boolean {
  if (!isDigits(digits10, 10)) return false;
  if (digits10[0] !== "0" && digits10[0] !== "1") return false;
  const base = Number(digits10.slice(0, 8));
  const check = Number(digits10.slice(8, 10));
  const expected = 97 - (base % 97);
  return check === expected;
}

/** Poland: PL + 10-digit NIP. The 10th digit is a weighted checksum over the first nine
 * (weights 6,5,7,2,3,4,5,6,7), summed and reduced modulo 11; a remainder of 10 can never
 * appear in a valid NIP. Verified via WebSearch 2026-09-12 (commenda.io, ksef-pl.com,
 * polishdata.eu, nanoutil.com), whose own worked example (NIP 2073786728) this function's
 * own test suite reuses directly. */
function validatePl(digits10: string): boolean {
  if (!isDigits(digits10, 10)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits10[i]) * (weights[i] as number);
  const check = sum % 11;
  if (check === 10) return false; // never a valid NIP -- see docstring
  return check === Number(digits10[9]);
}

/** Italy: IT + 11-digit Partita IVA. The 11th digit is a Luhn-style check digit over the
 * first ten: odd positions (1-indexed: 1,3,5,7,9) sum as-is, even positions double
 * (subtracting 9 if the doubled value exceeds 9) -- verified via WebSearch 2026-09-12
 * (hellotax.com, vatdb.com, vat-scan.com, grokipedia.com). */
function validateIt(digits11: string): boolean {
  if (!isDigits(digits11, 11)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(digits11[i]);
    const positionFromOne = i + 1;
    if (positionFromOne % 2 === 1) {
      sum += d;
    } else {
      const doubled = d * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits11[10]);
}

/**
 * Validates a full VAT ID string (country prefix + the rest, e.g. "DE136695976") against
 * this build's five supported country packs' own format+checksum rules. Whitespace is
 * stripped and the country prefix is upper-cased before matching (the same forgiving
 * normalization `core/lib/gst.ts`'s own GSTIN validation applies) -- but the DIGIT/letter
 * body itself is matched exactly as given, no normalization of a body that isn't well-formed
 * to begin with.
 */
export function validateEuVatId(vatId: string): EuVatIdValidationResult {
  const normalized = vatId.replace(/\s+/g, "").toUpperCase();
  const countryCode = normalized.slice(0, 2);
  const body = normalized.slice(2);

  if (!SUPPORTED_EU_VAT_ID_COUNTRIES.includes(countryCode as SupportedEuVatIdCountry)) {
    return {
      valid: false,
      countrySupported: false,
      reason: `"${countryCode}" isn't a country this build validates VAT ID formats for yet.`,
    };
  }

  let valid: boolean;
  switch (countryCode as SupportedEuVatIdCountry) {
    case "DE":
      valid = validateDe(body);
      break;
    case "FR":
      valid = body.length === 11 && validateFr(body.slice(0, 2), body.slice(2));
      break;
    case "BE":
      valid = validateBe(body);
      break;
    case "PL":
      valid = validatePl(body);
      break;
    case "IT":
      valid = validateIt(body);
      break;
  }

  return {
    valid,
    countrySupported: true,
    reason: valid
      ? "Format and checksum are valid. This confirms the VAT ID is well-formed, not that it is currently registered -- see a live VIES check for that."
      : `"${normalized}" does not pass ${countryCode}'s own VAT ID format/checksum rule.`,
  };
}
