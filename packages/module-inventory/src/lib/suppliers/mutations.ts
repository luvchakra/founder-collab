import { createClient } from "../../db/server";
import { isValidGstin } from "@cofounderai/core/lib/gst";

export type SupplierInput = {
  name: string;
  code?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  gst_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  payment_terms?: string | null;
  lead_time_days: number;
  min_order_quantity?: number | null;
  rating: number;
};

/** Throws the same user-facing message stockpilot-ai-ops's `saveSupplier` mutation did
 * when the GSTIN doesn't pass validation. */
function normalizeGstin(gstNumber: string | null | undefined): string | null {
  const gstin = gstNumber?.trim().toUpperCase() || "";
  if (!gstin) return null;
  if (!isValidGstin(gstin)) {
    throw new Error("That GSTIN doesn't look valid — check the 15 characters and try again.");
  }
  return gstin;
}

function payloadFrom(input: SupplierInput) {
  return {
    name: input.name,
    code: input.code || null,
    contact_person: input.contact_person || null,
    email: input.email || null,
    phone: input.phone || null,
    gst_number: normalizeGstin(input.gst_number),
    address: input.address || null,
    city: input.city || null,
    state: input.state || null,
    payment_terms: input.payment_terms || null,
    lead_time_days: input.lead_time_days,
    min_order_quantity: input.min_order_quantity ?? null,
    rating: input.rating,
  };
}

/** Ported from stockpilot-ai-ops's `saveSupplier` mutation -- create branch. */
export async function createSupplier(businessId: string, input: SupplierInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({ org_id: businessId, ...payloadFrom(input) });
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `saveSupplier` mutation -- update branch. */
export async function updateSupplier(supplierId: string, input: SupplierInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update(payloadFrom(input)).eq("id", supplierId);
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `toggleActive` mutation. */
export async function setSupplierActive(supplierId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update({ is_active: isActive }).eq("id", supplierId);
  if (error) throw error;
}
