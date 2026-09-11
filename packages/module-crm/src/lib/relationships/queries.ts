import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { classifyExistingRelationship, type RelationshipCandidateParty } from "./detect";
import type { RelationshipMatch } from "./types";

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * DISC-OFFER-P0-08.2: gathers exactly the real data `classifyExistingRelationship`
 * needs and calls it -- the DB-composing half of the pure/wrapper split, same shape
 * `syncNegativeSignalsForProspect` (module-discovery) already established for its own
 * pure `detectNegativeSignals`. Only ever looks at `core.parties` rows this same
 * business already owns (RLS-scoped) plus this module's own `lead`/`opportunity`
 * tables -- no write, no merge, just a read to inform a human decision before one.
 */
export async function detectExistingRelationship(
  businessId: string,
  input: { companyName: string; excludePartyId?: string | null; contactEmail?: string | null },
): Promise<RelationshipMatch> {
  const core = await createCoreClient({ schema: "core" });
  const crm = await createClient();
  const normalizedTarget = normalize(input.companyName);
  const excludePartyId = input.excludePartyId ?? null;

  const { data: parties, error: partiesError } = await core
    .from("parties")
    .select("id, name")
    .eq("business_id", businessId);
  if (partiesError) throw partiesError;

  const matches = (parties ?? []).filter((party) => {
    if (party.id === excludePartyId) return false;
    const normalizedName = normalize(party.name);
    return normalizedName === normalizedTarget || normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
  });

  const candidateParties: RelationshipCandidateParty[] = await Promise.all(
    matches.map(async (party): Promise<RelationshipCandidateParty> => {
      const [{ data: roles }, { data: openLead }, { data: opportunity }] = await Promise.all([
        core.from("party_roles").select("role").eq("party_id", party.id),
        crm.from("lead").select("id").eq("party_id", party.id).limit(1).maybeSingle(),
        crm.from("opportunity").select("id").eq("party_id", party.id).limit(1).maybeSingle(),
      ]);
      return {
        partyId: party.id,
        name: party.name,
        isExactNameMatch: normalize(party.name) === normalizedTarget,
        hasCustomerRole: (roles ?? []).some((r) => r.role === "customer"),
        hasOpenLead: Boolean(openLead),
        hasOpportunity: Boolean(opportunity),
      };
    }),
  );

  let contactEmailMatch: { partyId: string; partyName: string } | null = null;
  if (input.contactEmail) {
    const { data: contactRow } = await core
      .from("party_contacts")
      .select("party_id")
      .eq("business_id", businessId)
      .eq("email", input.contactEmail)
      .neq("party_id", excludePartyId ?? "00000000-0000-0000-0000-000000000000")
      .limit(1)
      .maybeSingle();
    if (contactRow) {
      const { data: matchedParty } = await core.from("parties").select("id, name").eq("id", contactRow.party_id).maybeSingle();
      if (matchedParty) contactEmailMatch = { partyId: matchedParty.id, partyName: matchedParty.name };
    }
  }

  return classifyExistingRelationship({ candidateParties, contactEmailMatch });
}
