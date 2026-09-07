import { createClient } from "../db/server";
import type { Party, PartyContact, PartyKind, PartyRole } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function createParty(input: {
  businessId: string;
  kind?: PartyKind;
  name: string;
  email?: string | null;
  phone?: string | null;
}): Promise<Party> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("parties")
    .insert({
      business_id: input.businessId,
      kind: input.kind ?? "company",
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Idempotent -- a party that already holds this role (e.g. winning a prospect twice)
 * is a no-op, not an error, since core.party_roles has a unique(party_id, role). */
export async function addPartyRole(businessId: string, partyId: string, role: PartyRole): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase
    .from("party_roles")
    .upsert(
      { business_id: businessId, party_id: partyId, role },
      { onConflict: "party_id,role", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function addPartyContact(input: {
  businessId: string;
  partyId: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  isPrimary?: boolean;
}): Promise<PartyContact> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("party_contacts")
    .insert({
      business_id: input.businessId,
      party_id: input.partyId,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      job_title: input.jobTitle ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      is_primary: input.isPrimary ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Creates a party with the 'supplier' role and its supplier attrs together, since a
 * core.party_supplier_attrs row without a matching role would be meaningless. */
export async function createSupplierParty(input: {
  businessId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  code?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number;
  rating?: number;
}): Promise<Party> {
  const party = await createParty({
    businessId: input.businessId,
    kind: "company",
    name: input.name,
    email: input.email,
    phone: input.phone,
  });
  await addPartyRole(input.businessId, party.id, "supplier");

  const supabase = await coreClient();
  const { error } = await supabase.from("party_supplier_attrs").insert({
    party_id: party.id,
    business_id: input.businessId,
    code: input.code ?? null,
    payment_terms: input.paymentTerms ?? null,
    lead_time_days: input.leadTimeDays ?? 7,
    rating: input.rating ?? 0,
  });
  if (error) throw error;

  return party;
}
