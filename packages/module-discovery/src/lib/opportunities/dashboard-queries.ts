import { computeBuyerIntelligence } from "../buyer-intelligence/intelligence";
import { computeBuyerFitScores } from "../buyer-intelligence/scoring";
import { listContacts } from "../contacts/queries";
import { getIcpProfile } from "../icp/queries";
import { listBuyerPersonas } from "../personas/queries";
import { getProspect } from "../prospects/queries";
import type { Prospect } from "../prospects/types";
import { getProspectResearch } from "../research/queries";
import { getSignalCorrelation } from "../signals/queries";
import { classifyOpportunityForDashboard, type DashboardBin } from "./dashboard";
import { selectTopGateOpportunity } from "./gate";
import { listOpportunities } from "./queries";
import type { Opportunity } from "./types";

export type OpportunityDashboardRow = {
  opportunity: Opportunity;
  prospect: Prospect;
  bin: DashboardBin;
  /** "Contact" (doc's own field) -- the strongest real candidate buyer's own display
   * name (06.3's own `computeBuyerFitScores`), or the first contact on file if none has
   * assessable relevance yet, or null with no contacts at all. Never invented. */
  contactName: string | null;
  /** "Top Signal" (doc's own field) -- the exact `signal_correlations` row this
   * opportunity's `signal_strength_score` was last computed from (05.3), or null when
   * no correlation has ever been attached. */
  topSignal: string | null;
};

/**
 * DISC-OFFER-P0-07.2: "Today's Opportunities" -- one row per active (non-resolved)
 * opportunity in the workspace, enriched with exactly the fields the doc's own row
 * shape asks for that aren't already plain columns on `Opportunity` itself (Company,
 * Score, Priority, Offering Fit [`why_them`], Why Now, Recommended Action all are).
 * Computed fresh per request, never persisted -- the same discipline
 * `getBuyerIntelligenceForProspect` (06.3) already established, since contacts/signals/
 * research can each change independently of the opportunity row.
 */
export async function getOpportunityDashboardRows(workspaceId: string): Promise<OpportunityDashboardRow[]> {
  const opportunities = await listOpportunities(workspaceId);

  const rows = await Promise.all(
    opportunities.map(async (opportunity): Promise<OpportunityDashboardRow | null> => {
      const bin = classifyOpportunityForDashboard(opportunity);
      if (!bin) return null;

      const prospect = await getProspect(opportunity.prospect_id);
      if (!prospect) return null;

      const [correlation, contacts, personas, icp, research] = await Promise.all([
        opportunity.signal_correlation_id ? getSignalCorrelation(opportunity.signal_correlation_id) : null,
        listContacts(prospect.id),
        listBuyerPersonas(workspaceId),
        getIcpProfile(workspaceId),
        getProspectResearch(prospect.id),
      ]);

      const intelligence = computeBuyerIntelligence(contacts, personas, icp?.roles ?? [], research?.evidence ?? []);
      const { primaryContactId } = computeBuyerFitScores(intelligence);
      const primary = intelligence.find((person) => person.contact.id === primaryContactId) ?? intelligence[0] ?? null;

      return {
        opportunity,
        prospect,
        bin,
        contactName: primary?.name ?? null,
        topSignal: correlation?.rationale ?? null,
      };
    }),
  );

  return rows.filter((row): row is OpportunityDashboardRow => row !== null);
}

/**
 * DISC-OFFER-P0-15.1: "Final Human Action Gate" -- the single opportunity a founder
 * should decide on right now, or `null` when nothing qualifies (a fresh offering, or
 * every open opportunity already resolved/watched). Reuses `getOpportunityDashboardRows`
 * wholesale rather than a second, parallel query -- the gate needs exactly the same
 * enriched row shape (contact name, top signal) "Today's Opportunities" (07.2) already
 * computes, just reduced to `selectTopGateOpportunity`'s own single pick.
 */
export async function getTopGateOpportunity(workspaceId: string): Promise<OpportunityDashboardRow | null> {
  const rows = await getOpportunityDashboardRows(workspaceId);
  return selectTopGateOpportunity(rows.map((row) => ({ ...row, status: row.opportunity.status, score: row.opportunity.score, created_at: row.opportunity.created_at })));
}
