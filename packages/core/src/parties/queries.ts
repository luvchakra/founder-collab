import { createClient } from "../db/server";
import type { Party, PartyContact, PartyRole, PartySupplierAttrs } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Every party in a business, regardless of role -- RLS-scoped. */
export async function listPartiesForBusiness(businessId: string): Promise<Party[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("parties").select("*").eq("business_id", businessId);
  if (error) throw error;
  return data;
}

/** Parties in a business holding a specific role (e.g. every 'supplier'). A party with
 * multiple roles appears in more than one of these lists -- that's the point of the
 * party model, not a bug (00-MASTER-PLAN.md §5). */
export async function listPartiesByRole(businessId: string, role: PartyRole): Promise<Party[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("parties")
    .select("*, party_roles!inner(role)")
    .eq("business_id", businessId)
    .eq("party_roles.role", role);
  if (error) throw error;
  return data;
}

export async function getParty(partyId: string): Promise<Party | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("parties").select("*").eq("id", partyId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRolesForParty(partyId: string): Promise<PartyRole[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("party_roles").select("role").eq("party_id", partyId);
  if (error) throw error;
  return data.map((r: { role: PartyRole }) => r.role);
}

export async function listContactsForParty(partyId: string): Promise<PartyContact[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("party_contacts").select("*").eq("party_id", partyId);
  if (error) throw error;
  return data;
}

export async function getSupplierAttrs(partyId: string): Promise<PartySupplierAttrs | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("party_supplier_attrs")
    .select("*")
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
