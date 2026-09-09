import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";

export type StockMovementInput = {
  product_id: string;
  warehouse_id: string;
  type: string;
  quantity: number;
  reference?: string | null;
  notes?: string | null;
};

/** Ported from stockpilot-ai-ops's `recordMovement` mutation. `apply_stock_movement()`
 * (SP-3b, a trigger on this same table) posts the resulting stock_levels update --
 * there's no separate RPC to call, just the insert. */
export async function recordStockMovement(businessId: string, input: StockMovementInput): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");

  const { error } = await supabase.from("stock_movements").insert({
    business_id: businessId,
    item_id: input.product_id,
    warehouse_id: input.warehouse_id,
    type: input.type,
    quantity: input.quantity,
    reference: input.reference || null,
    notes: input.notes || null,
    created_by: userData.user.id,
  });
  if (error) throw error;
}
