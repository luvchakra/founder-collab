import { isCaProvince } from "../compliance/ca-provinces";
import type { CaPlaceOfSupply } from "./types";

/**
 * COMPLY-P1-03.3 (Place of Supply): a documented SIMPLIFICATION of the CRA's own real
 * place-of-supply rules (GST/HST Memorandum 3-3-x, formerly Technical Information Bulletin
 * B-103), the same "simplify, name the gap, don't guess the full sub-rules" precedent
 * COMPLY-P0-04.4 already established for India's own place-of-supply.
 *
 * The CRA's own real rules cascade through several tests depending on supply type (goods:
 * generally the delivery address; services: a multi-step test starting with the
 * recipient's own home/business address obtained in the normal course of business, falling
 * back to the supplier's own address, then other tie-breakers; intangible personal
 * property has its own further rules). This function does NOT implement that cascade --
 * it resolves place of supply from a single already-known buyer province, the same
 * "shipping-then-billing address preference already resolved by the caller" convention
 * `lib/place-of-supply/determine.ts` (India) already established, not a second
 * implementation of the underlying address-selection logic.
 *
 * A buyer outside Canada is `"export"` -- Canada zero-rates most exported goods and
 * services (a real, source-cited fact this session did not further seed as a versioned
 * rule, since `lib/compliance/treatments.ts`'s own `zero_rated` treatment code already
 * covers the classification; the actual GST/HST rate that would otherwise apply is simply
 * not charged). An unset/unrecognized province with a Canadian (or unset) country falls
 * through to `"unknown"` rather than guessing -- the same "never default to domestic"
 * discipline `determinePlaceOfSupply` (India) already established for its own unset-
 * country case.
 */
export function determineCaPlaceOfSupply(buyerProvinceCode: string | null, buyerCountry: string | null): CaPlaceOfSupply {
  const isCanada = buyerCountry == null || buyerCountry.trim() === "" ? null : /^(canada|ca)$/i.test(buyerCountry.trim());

  if (isCanada === false) {
    return { province: null, treatment: "export" };
  }

  if (buyerProvinceCode && isCaProvince(buyerProvinceCode)) {
    return { province: buyerProvinceCode, treatment: "domestic" };
  }

  return { province: null, treatment: "unknown" };
}
