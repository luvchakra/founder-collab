import { createClient } from "../../db/server";
import { isValidGstin } from "../gst";

export type CustomerInput = {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  state?: string | null;
};

/** Throws the same user-facing message stockpilot-ai-ops's `saveCustomer` mutation did
 * when the GSTIN doesn't pass validation -- same helper shape as suppliers'. */
function normalizeGstin(gstin: string | null | undefined): string | null {
  const value = gstin?.trim().toUpperCase() || "";
  if (!value) return null;
  if (!isValidGstin(value)) {
    throw new Error("That GSTIN doesn't look valid — check the 15 characters and try again.");
  }
  return value;
}

function payloadFrom(input: CustomerInput) {
  return {
    name: input.name,
    gstin: normalizeGstin(input.gstin),
    phone: input.phone || null,
    email: input.email || null,
    billing_address: input.billing_address || null,
    shipping_address: input.shipping_address || null,
    state: input.state || null,
  };
}

/** Ported from stockpilot-ai-ops's `saveCustomer` mutation -- create branch. */
export async function createCustomer(businessId: string, input: CustomerInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({ org_id: businessId, ...payloadFrom(input) });
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `saveCustomer` mutation -- update branch. */
export async function updateCustomer(customerId: string, input: CustomerInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(payloadFrom(input)).eq("id", customerId);
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `toggleActive` mutation. */
export async function setCustomerActive(customerId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ is_active: isActive }).eq("id", customerId);
  if (error) throw error;
}
