import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isUsProductTaxCategorySupported } from "./categories";
import type { UsProductTaxCategory } from "./types";

/**
 * COMPLY-P1-02.5: `gst.item_category_tax_classifications` -- how a business's OWN
 * `core.item_categories` row (a business-chosen name like "Kids Apparel") maps onto this
 * platform's fixed `UsProductTaxCategory` vocabulary ("clothing"). Reuses
 * `core.item_categories` (00-MASTER-PLAN.md §5's own canonical "Item category" home)
 * rather than inventing a parallel product taxonomy -- this table adds only the missing
 * link between a business's own free-text category and the closed tax-category vocabulary
 * a versioned `gst.tax_rules` row can actually key off of.
 *
 * A tenant-owned CONFIGURATION choice (not an immutable fact-of-record the way
 * `gst.tax_determinations`/`gst.us_physical_nexus_facts` are) -- a business may reclassify
 * or remove a mapping at any time without needing to preserve the old value, so this table
 * supports UPDATE and DELETE, matching `gst.compliance_profiles`/`gst.tax_registrations`'s
 * own mutable-config precedent rather than the append-only-evidence precedent.
 */

export type ItemCategoryTaxClassification = {
  id: string;
  businessId: string;
  categoryId: string;
  taxCategory: UsProductTaxCategory;
};

function mapRow(row: { id: string; business_id: string; category_id: string; tax_category: string }): ItemCategoryTaxClassification {
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    taxCategory: row.tax_category as UsProductTaxCategory,
  };
}

export async function listItemCategoryTaxClassifications(businessId: string): Promise<ItemCategoryTaxClassification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_category_tax_classifications")
    .select("id, business_id, category_id, tax_category")
    .eq("business_id", businessId);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** The tax category a business has tagged one of its own `core.item_categories` rows
 * with, or `null` if it has none. */
export async function getItemCategoryTaxClassification(businessId: string, categoryId: string): Promise<UsProductTaxCategory | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_category_tax_classifications")
    .select("tax_category")
    .eq("business_id", businessId)
    .eq("category_id", categoryId)
    .maybeSingle();
  if (error) throw error;
  return (data?.tax_category as UsProductTaxCategory | undefined) ?? null;
}

/** Upserts the classification for one item category. Validates `taxCategory` against
 * `categories.ts`'s own catalog in application code, not a DB enum -- same convention
 * `isTreatmentSupported`/`isJurisdictionSupported` already use for every other
 * app-validated free-text column in this schema. */
export async function setItemCategoryTaxClassification(businessId: string, categoryId: string, taxCategory: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  if (!isUsProductTaxCategorySupported(taxCategory)) {
    throw new Error(`"${taxCategory}" isn't a recognized product/service tax category.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_category_tax_classifications")
    .upsert({ business_id: businessId, category_id: categoryId, tax_category: taxCategory }, { onConflict: "business_id,category_id" });
  if (error) throw error;
}

export async function removeItemCategoryTaxClassification(businessId: string, categoryId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_category_tax_classifications")
    .delete()
    .eq("business_id", businessId)
    .eq("category_id", categoryId);
  if (error) throw error;
}
