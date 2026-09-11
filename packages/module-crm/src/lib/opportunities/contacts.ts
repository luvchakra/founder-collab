import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";

export type OpportunityContact = {
  id: string;
  partyContactId: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  role: string | null;
};

/**
 * CRM-04.5: "Opportunity can have multiple contacts, one can be primary." Reads
 * `crm.opportunity_contact` (this story's own junction table -- see its migration's
 * header comment for why it isn't `core.party_contacts.is_primary` reused directly) and
 * `core.party_contacts` for display fields. Different schemas, so a separate lookup
 * rather than a PostgREST embedded select -- same limitation customer-360/queries.ts and
 * opportunities/products.ts already work around.
 */
export async function listOpportunityContacts(businessId: string, opportunityId: string): Promise<OpportunityContact[]> {
  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const { data: rows, error } = await supabase
    .from("opportunity_contact")
    .select("id, party_contact_id, is_primary, role")
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (rows.length === 0) return [];

  const contactIds = rows.map((r) => r.party_contact_id);
  const { data: contacts, error: contactsError } = await core
    .from("party_contacts")
    .select("id, first_name, last_name, job_title, email, phone")
    .in("id", contactIds);
  if (contactsError) throw contactsError;
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  return rows.map((row) => {
    const contact = contactById.get(row.party_contact_id);
    return {
      id: row.id,
      partyContactId: row.party_contact_id,
      name: [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unnamed contact",
      jobTitle: contact?.job_title ?? null,
      email: contact?.email ?? null,
      phone: contact?.phone ?? null,
      isPrimary: row.is_primary,
      role: row.role,
    };
  });
}

export async function addOpportunityContact(businessId: string, opportunityId: string, partyContactId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("opportunity_contact").insert({
    business_id: businessId,
    opportunity_id: opportunityId,
    party_contact_id: partyContactId,
  });
  if (error) throw error;
}

export async function removeOpportunityContact(businessId: string, opportunityId: string, opportunityContactId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunity_contact")
    .delete()
    .eq("id", opportunityContactId)
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
}

/** Two sequential updates, not one atomic statement -- the DB-level
 * `opportunity_contact_one_primary_uq` partial unique index (at most one primary per
 * opportunity) would reject setting a second primary before the first is unset, so the
 * unset has to land first. Demo-scale, single-admin-at-a-time usage; a genuine race here
 * would just mean nobody ends up primary, which the unique index still leaves safe to
 * retry rather than corrupting data. */
export async function setPrimaryOpportunityContact(businessId: string, opportunityId: string, opportunityContactId: string): Promise<void> {
  const supabase = await createClient();
  const { error: unsetError } = await supabase
    .from("opportunity_contact")
    .update({ is_primary: false })
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId)
    .eq("is_primary", true);
  if (unsetError) throw unsetError;

  const { error: setError } = await supabase
    .from("opportunity_contact")
    .update({ is_primary: true })
    .eq("id", opportunityContactId)
    .eq("business_id", businessId)
    .eq("opportunity_id", opportunityId);
  if (setError) throw setError;
}
