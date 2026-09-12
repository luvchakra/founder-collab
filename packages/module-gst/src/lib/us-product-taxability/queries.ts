import { getItemTaxContext } from "../inventory-tax-context/queries";
import type { ItemTaxContext } from "../inventory-tax-context/types";
import { getEffectiveUsStateSalesTaxRate } from "../tax-rules/us-sales-tax";
import { defaultUsProductTaxCategoryForKind } from "./categories";
import { getItemCategoryTaxClassification } from "./classification";
import { determineUsProductTaxability } from "./determine";
import { getEffectiveUsProductTaxabilityRule } from "./rules";
import type { UsProductTaxCategory, UsProductTaxabilityDetermination } from "./types";

/**
 * COMPLY-P1-02.5: the orchestrator tying together an item's own classification (COMPLY-P0-03.2
 * `ItemTaxContext`, plus this story's own `category_id`-based override), the per-category
 * versioned rule (`rules.ts`), and the state's own general rate (`lib/tax-rules/
 * us-sales-tax.ts`, COMPLY-P1-02.1/02.2) into one callable "is this taxable in this state"
 * answer. No test file -- a thin orchestrator over already-tested pure pieces plus
 * already-tested queries, this module's established convention (matches
 * `getUsRegistrationObligations`).
 */

/** Resolves an item's tax category: an explicit `gst.item_category_tax_classifications`
 * mapping for its `core.item_categories` row wins outright; otherwise falls back to
 * `categories.ts`'s own kind-based default (`null` for an `expense` item -- see that
 * function's own docstring for why). */
export async function resolveItemTaxCategory(businessId: string, item: ItemTaxContext): Promise<UsProductTaxCategory | null> {
  if (item.categoryId) {
    const classified = await getItemCategoryTaxClassification(businessId, item.categoryId);
    if (classified) return classified;
  }
  return defaultUsProductTaxCategoryForKind(item.kind);
}

export async function getUsProductTaxability(
  businessId: string,
  itemId: string,
  stateCode: string,
  asOf?: string,
): Promise<UsProductTaxabilityDetermination | null> {
  const item = await getItemTaxContext(businessId, itemId);
  if (!item) return null;

  const category = await resolveItemTaxCategory(businessId, item);
  if (!category) {
    return {
      category: null,
      notApplicable: true,
      resolved: false,
      treatment: null,
      ratePercent: null,
      ruleRefs: [],
      reason: "This item is an internal expense line, never itself sold/invoiced -- product taxability does not apply.",
    };
  }

  const [categoryRule, generalRule] = await Promise.all([
    getEffectiveUsProductTaxabilityRule(stateCode, category, asOf),
    getEffectiveUsStateSalesTaxRate(stateCode, asOf),
  ]);

  return determineUsProductTaxability({ category, categoryRule, generalRule: generalRule ? { ratePercent: generalRule.ratePercent, rule: generalRule.rule } : null });
}
