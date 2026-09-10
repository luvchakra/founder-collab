import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../db/server";
import type { Party, PartyContact, PartyKind, PartyRole } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/**
 * `client`, when passed, is a service-role admin client for a caller with no logged-in
 * user -- e.g. crm's inbound-webhook message ingestion (docs/design/crm-module-design.md
 * Part A, A2) creating a lead-only party for a brand-new external sender it has no
 * session to attribute the write to. Same optional-client-override shape
 * resolveAiModel()/getAccountIdForWorkspace() already use for their own webhook/no-
 * session callers -- defaults to the normal RLS-scoped client for every existing caller.
 */
export async function createParty(
  input: {
    businessId: string;
    kind?: PartyKind;
    name: string;
    email?: string | null;
    phone?: string | null;
  },
  client?: SupabaseClient,
): Promise<Party> {
  const supabase = client ?? (await coreClient());
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

/** Generic party field edit -- name/email/phone are the fields every module-specific
 * "customer"/"prospect"/"supplier" screen surfaces for the same underlying `core.parties`
 * row (00-MASTER-PLAN.md §5's "one row, many roles"), so this lives here rather than
 * duplicated per module. Scoped by `businessId` in addition to RLS's own tenant check,
 * so a mismatched partyId/businessId pair is a clear no-op rather than a silent write to
 * the wrong tenant's row. */
export async function updateParty(
  businessId: string,
  partyId: string,
  patch: { name?: string; email?: string | null; phone?: string | null },
): Promise<void> {
  const supabase = await coreClient();
  const update: Record<string, unknown> = {};
  if ("name" in patch) update.name = patch.name;
  if ("email" in patch) update.email = patch.email;
  if ("phone" in patch) update.phone = patch.phone;
  const { error } = await supabase.from("parties").update(update).eq("id", partyId).eq("business_id", businessId);
  if (error) throw error;
}

/** Only fills in a party's email when it's currently null -- never overwrites a value
 * the founder (or an earlier sync) already set. Used to backfill a customer party's
 * email from its first known contact (module-discovery/lib/prospects/party-sync.ts) when
 * winning a prospect that has a real contact but whose party itself was created with no
 * email of its own. */
export async function backfillPartyEmail(partyId: string, email: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.from("parties").update({ email }).eq("id", partyId).is("email", null);
  if (error) throw error;
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
