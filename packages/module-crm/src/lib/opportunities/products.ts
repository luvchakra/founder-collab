import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";

export type OpportunityProduct = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number | null;
  unitPrice: number;
  /** quantity * unitPrice, or null when no quantity has been captured yet -- an
   * opportunity line with an item but no quantity contributes nothing concrete rather
   * than a fabricated single-unit value. */
  lineValue: number | null;
};

export function computeLineValue(quantity: number | null, unitPrice: number): number | null {
  return quantity ? quantity * unitPrice : null;
}

/**
 * CRM-04.4: "Opportunity can reference multiple Inventory products where Inventory is
 * licensed" -- reuses `crm.product_interest` (CRM-01.2/CRM-10.1's provider-neutral
 * product-of-interest table, already used by Customer 360's own "products of interest"
 * section) rather than a new table; CRM never gets its own copy of the product catalog
 * (Section 4). `core.items` is a different schema than `crm.product_interest` --
 * PostgREST embedded selects don't span schemas (same limitation customer-360/queries.ts
 * already works around), so item name/price is a separate lookup, not a join.
 */
export async function listOpportunityProducts(businessId: string, opportunityId: string): Promise<OpportunityProduct[]> {
  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const { data: rows, error } = await supabase
    .from("product_interest")
    .select("id, item_id, quantity")
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id))];
  const { data: items, error: itemsError } = await core.from("items").select("id, name, selling_price").in("id", itemIds);
  if (itemsError) throw itemsError;
  const itemById = new Map(items.map((item) => [item.id, item]));

  return rows.map((row) => {
    const item = itemById.get(row.item_id);
    const unitPrice = item?.selling_price ?? 0;
    return {
      id: row.id,
      itemId: row.item_id,
      itemName: item?.name ?? "Unknown product",
      quantity: row.quantity,
      unitPrice,
      lineValue: computeLineValue(row.quantity, unitPrice),
    };
  });
}

/** Gated on the Inventory module specifically (not just CRM's own license, which RLS
 * already enforces) -- per ADR-10's degraded-mode pattern, an opportunity can exist
 * fine with no Inventory license, it just can't reference the product catalog that only
 * Inventory populates. The page hides this section entirely when Inventory isn't
 * licensed; this check is the defense-in-depth backstop for the write path itself. */
export async function addOpportunityProduct(
  businessId: string,
  opportunityId: string,
  itemId: string,
  quantity: number | null,
): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase.from("product_interest").insert({
    business_id: businessId,
    opportunity_id: opportunityId,
    item_id: itemId,
    quantity,
  });
  if (error) throw error;
}

/** INT-05.1's "cancel unavailable quantity" / "change requested quantity" decisions --
 * both are the same underlying edit (set the line to a smaller, or any other, number),
 * just pre-filled differently by the caller (available quantity vs. a free-form value).
 * No audit log here, matching this file's own sibling functions above. */
export async function updateOpportunityProductQuantity(businessId: string, opportunityId: string, productInterestId: string, quantity: number): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_interest")
    .update({ quantity })
    .eq("id", productInterestId)
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
}

export async function removeOpportunityProduct(businessId: string, opportunityId: string, productInterestId: string): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_interest")
    .delete()
    .eq("id", productInterestId)
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
}
