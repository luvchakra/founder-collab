import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import type { Warehouse } from "./types";

export type WarehouseInput = {
  name: string;
  code: string;
  type: string;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

/** Ported from stockpilot-ai-ops's `saveWarehouse` mutation -- create branch. */
export async function createWarehouse(businessId: string, input: WarehouseInput): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const { error } = await supabase.from("warehouses").insert({
    business_id: businessId,
    name: input.name,
    code: input.code,
    type: input.type,
    city: input.city || null,
    state: input.state || null,
    address: input.address || null,
    postal_code: input.postal_code || null,
    contact_name: input.contact_name || null,
    contact_phone: input.contact_phone || null,
  });
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `saveWarehouse` mutation -- update branch. */
export async function updateWarehouse(warehouseId: string, input: WarehouseInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouses")
    .update({
      name: input.name,
      code: input.code,
      type: input.type,
      city: input.city || null,
      state: input.state || null,
      address: input.address || null,
      postal_code: input.postal_code || null,
      contact_name: input.contact_name || null,
      contact_phone: input.contact_phone || null,
    })
    .eq("id", warehouseId);
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `toggleActive` mutation. */
export async function setWarehouseActive(warehouseId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouses")
    .update({ is_active: isActive })
    .eq("id", warehouseId);
  if (error) throw error;
}

export type { Warehouse };
