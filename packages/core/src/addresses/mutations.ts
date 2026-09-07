import { createClient } from "../db/server";
import type { Address, AddressKind, GstRegistrationType, TaxIdentity } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Adding a primary address unsets any existing primary of the same kind first --
 * core.addresses' partial unique index (party_id, kind) where is_primary would
 * otherwise reject the insert. */
export async function addAddress(input: {
  businessId: string;
  partyId: string;
  kind: AddressKind;
  isPrimary?: boolean;
  formatted?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<Address> {
  const supabase = await coreClient();

  if (input.isPrimary) {
    const { error: unsetError } = await supabase
      .from("addresses")
      .update({ is_primary: false })
      .eq("party_id", input.partyId)
      .eq("kind", input.kind)
      .eq("is_primary", true);
    if (unsetError) throw unsetError;
  }

  const { data, error } = await supabase
    .from("addresses")
    .insert({
      business_id: input.businessId,
      party_id: input.partyId,
      kind: input.kind,
      is_primary: input.isPrimary ?? false,
      formatted: input.formatted ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postal_code: input.postalCode ?? null,
      country: input.country ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertTaxIdentity(input: {
  businessId: string;
  partyId: string;
  gstin?: string | null;
  state?: string | null;
  gstRegistrationType?: GstRegistrationType;
}): Promise<TaxIdentity> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("tax_identities")
    .upsert(
      {
        party_id: input.partyId,
        business_id: input.businessId,
        gstin: input.gstin ?? null,
        state: input.state ?? null,
        gst_registration_type: input.gstRegistrationType ?? "regular",
      },
      { onConflict: "party_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
