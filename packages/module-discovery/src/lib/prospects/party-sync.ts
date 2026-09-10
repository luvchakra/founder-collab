import { addPartyContact, addPartyRole, backfillPartyEmail, createParty } from "@cofounderai/core/parties/mutations";
import { listContactsForParty } from "@cofounderai/core/parties/queries";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { listContacts } from "../contacts/queries";

/**
 * Links a prospect to a core.parties row with the 'prospect' role -- the bridge D-1/D-3
 * establish so a discovery prospect and an FSM/inventory customer can become the same
 * row (00-MASTER-PLAN.md §5: "winning a prospect adds the customer role; it does not
 * copy a record"). Creates the party if `existingPartyId` isn't already set (new
 * prospects go through here at creation time; historical rows were backfilled by
 * supabase/migrations/20260906102000_discovery_prospects_party_backfill.sql).
 */
export async function ensureProspectParty(
  workspaceId: string,
  existingPartyId: string | null | undefined,
  party: { name: string; email?: string | null },
): Promise<string> {
  if (existingPartyId) return existingPartyId;

  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error(`No business found for workspace ${workspaceId}.`);

  const created = await createParty({
    businessId,
    kind: "company",
    name: party.name,
    email: party.email ?? null,
  });
  await addPartyRole(businessId, created.id, "prospect");
  return created.id;
}

/** Adds the 'customer' role to a prospect's existing party when its outcome becomes
 * 'won' -- a no-op (via addPartyRole's own idempotency) if called more than once. */
export async function markProspectPartyWon(workspaceId: string, partyId: string): Promise<void> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error(`No business found for workspace ${workspaceId}.`);
  await addPartyRole(businessId, partyId, "customer");
}

/**
 * Ensures a won prospect's own contact(s) are usable the moment the party becomes a
 * customer -- "the contact a message was sent to should be created as a customer in
 * both inventory and service" (a cross-module UX pass). createContact() already mirrors
 * a `discovery.contacts` row into `core.party_contacts` *at creation time*, so this is a
 * no-op for the common case; it exists for the party whose contacts predate that mirror
 * (the one-time backfill migration for prospects created before D-3), so a customer
 * created from an older prospect isn't left with no usable email the first time Inventory
 * or FSM tries to bill it (both read core.parties/core.party_contacts directly --
 * 00-MASTER-PLAN.md §5 -- so there's nothing else for either module to fall back to).
 * Deduped by email against what's already mirrored; also backfills the party's own
 * email from the first contact that has one, but never overwrites one already set.
 */
export async function backfillCustomerContactsForWonProspect(
  businessId: string,
  partyId: string,
  prospectId: string,
): Promise<void> {
  const contacts = await listContacts(prospectId);
  if (contacts.length === 0) return;

  const existingContacts = await listContactsForParty(partyId);
  const existingEmails = new Set(
    existingContacts.map((c) => c.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email)),
  );

  for (const contact of contacts) {
    const email = contact.email?.trim().toLowerCase();
    if (email && existingEmails.has(email)) continue;
    await addPartyContact({
      businessId,
      partyId,
      firstName: contact.first_name,
      lastName: contact.last_name,
      jobTitle: contact.job_title,
      email: contact.email,
      phone: contact.phone,
      linkedinUrl: contact.linkedin_url,
    });
    if (email) existingEmails.add(email);
  }

  const firstEmail = contacts.find((c) => c.email)?.email;
  if (firstEmail) {
    await backfillPartyEmail(partyId, firstEmail);
  }
}
