import { addPartyRole, createParty } from "@cofounderai/core/parties/mutations";
import { getBusinessIdForWorkspace } from "../tenancy/queries";

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
