import { createClient } from "../db/server";
import type { Address, AddressKind, TaxIdentity } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function listAddressesForParty(partyId: string): Promise<Address[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("addresses").select("*").eq("party_id", partyId);
  if (error) throw error;
  return data;
}

export async function getPrimaryAddress(partyId: string, kind: AddressKind): Promise<Address | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("party_id", partyId)
    .eq("kind", kind)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTaxIdentity(partyId: string): Promise<TaxIdentity | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("tax_identities")
    .select("*")
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
