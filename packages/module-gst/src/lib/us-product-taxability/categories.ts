import type { UsProductTaxCategory, UsProductTaxCategoryCatalogEntry } from "./types";

/**
 * COMPLY-P1-02.5: the fixed, closed product/service tax-category vocabulary a business
 * tags its OWN `core.item_categories` rows against (see `classification.ts`), the same
 * "small closed vocabulary, not a table" shape `lib/compliance/treatments.ts`
 * (COMPLY-P0-02.4) already established for `TaxTreatment`. Seven categories, chosen to
 * exercise the two real category SHAPES this story's own research found: a "goods-like"
 * category (safe to assume taxed like general tangible personal property absent a specific
 * carve-out) and a "service-like" one (no safe default -- see each entry's own
 * `defaultsToGeneralRate`).
 */
export const US_PRODUCT_TAX_CATEGORY_CATALOG: UsProductTaxCategoryCatalogEntry[] = [
  {
    code: "general",
    name: "General merchandise",
    description: "Ordinary tangible personal property with no special carve-out -- the catch-all default for a good/part item.",
    defaultsToGeneralRate: true,
  },
  {
    code: "clothing",
    name: "Clothing and footwear",
    description: "Apparel and footwear intended for everyday wear -- several states carve out a full or threshold-based exemption.",
    defaultsToGeneralRate: true,
  },
  {
    code: "groceries",
    name: "Groceries (unprepared food for home consumption)",
    description: "Unprepared food products intended for home consumption -- exempt from state-level sales tax in most states.",
    defaultsToGeneralRate: true,
  },
  {
    code: "prepared_food",
    name: "Prepared food",
    description: "Restaurant meals and other ready-to-eat food -- typically taxable even in states that exempt groceries.",
    defaultsToGeneralRate: true,
  },
  {
    code: "digital_goods",
    name: "Digital goods",
    description: "Digital downloads (e-books, music, movies, apps) delivered electronically rather than on physical media.",
    defaultsToGeneralRate: true,
  },
  {
    code: "saas",
    name: "Software as a service",
    description: "Remotely accessed, cloud-hosted software -- taxability varies state-by-state with no safe universal default.",
    defaultsToGeneralRate: false,
  },
  {
    code: "services",
    name: "Services (general)",
    description: "Professional/personal services not separately enumerated -- most states do not tax services by default, but enumerated exceptions exist, so this platform never guesses.",
    defaultsToGeneralRate: false,
  },
];

export function getUsProductTaxCategory(code: string): UsProductTaxCategoryCatalogEntry | undefined {
  return US_PRODUCT_TAX_CATEGORY_CATALOG.find((c) => c.code === code);
}

export function isUsProductTaxCategorySupported(code: string): boolean {
  return getUsProductTaxCategory(code) !== undefined;
}

/** The default category for an item with no explicit `gst.item_category_tax_classifications`
 * mapping -- keyed off `core.items.kind` (COMPLY-P0-03.2's own `ItemTaxContext.kind`), the
 * same "kind implies a sensible default, an explicit mapping overrides it" shape
 * `lib/inventory-tax-context/hsn-sac.ts`'s own `hsnSacRequirementForKind` already
 * established for HSN/SAC. `null` for `expense` -- an internal expense line is never itself
 * sold/invoiced to a customer, so product taxability doesn't apply to it at all (the same
 * `not_applicable` short-circuit that function already uses). */
export function defaultUsProductTaxCategoryForKind(kind: "good" | "service" | "labour" | "part" | "expense"): UsProductTaxCategory | null {
  switch (kind) {
    case "good":
    case "part":
      return "general";
    case "service":
    case "labour":
      return "services";
    case "expense":
      return null;
  }
}
