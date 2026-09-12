import { listOpportunitiesForProspect } from "../opportunities/queries";
import { attachSignalCorrelation, setOpportunityWhyNow, setOpportunityNextBestAction } from "../opportunities/mutations";
import { correlateSignalsForProspect, syncSignalsFromResearch } from "../signals/mutations";
import { syncNegativeSignalsForProspect } from "../negative-signals/mutations";
import { buildNextBestActionInput } from "./handlers";
import type { Opportunity, OpportunityStatus } from "../opportunities/types";

/** Same "nothing left to act on" set `activeOpportunities` (DISC-OFFER-P0-10.1) already
 * uses -- a resolved opportunity has nothing for fresh evidence to update. */
const RESOLVED_STATUSES: OpportunityStatus[] = ["sent_to_crm", "dismissed", "expired"];

/**
 * DISC-OFFER-P1-01.2: "Incremental Re-Run" -- the doc's own exact three-step example
 * ("New signal → Re-score affected opportunity → Recalculate Why Now → Update
 * recommended action"), triggered by fresh evidence on one specific prospect rather than
 * a full walk through all fourteen pipeline stages.
 *
 * **The real gap this closes**: every pipeline stage handler in `handlers.ts` only ever
 * fills in a value an opportunity doesn't have yet (`!o.signal_correlation_id`,
 * `!o.why_now`, `!o.recommended_action`) -- by design, so a rerun of "AI Discovery" never
 * redoes work already done. That means today, once an opportunity has its first
 * correlation/why-now/recommendation, *nothing* ever revisits it again, even when a
 * founder manually re-researches that same prospect from the Prospect Detail page
 * (`researchProspectAction`) and genuinely new evidence comes back -- the prior
 * "still-missing" filters would just skip it forever. This function is the deliberately
 * separate "revisit because something changed" path those stage handlers were never
 * meant to be, called explicitly by the one place new evidence for an *existing*
 * opportunity actually enters this module today (a manual "Research" click) --
 * `discoverProspects`'s own pipeline-driven path never re-researches a prospect that
 * already has an opportunity in the first place (`prospectsPendingOpportunity`,
 * DISC-OFFER-P0-10.1, excludes it), so that path has no such gap to close.
 *
 * Scoped to *this one prospect's* own open opportunities only -- never touches any other
 * opportunity in the workspace, unlike a full pipeline run, which is exactly the doc's
 * own "do not rerun the whole pipeline". A prospect with no open opportunity at all
 * (brand new, or every one already resolved) is a no-op -- there is nothing for fresh
 * evidence to update yet; the pipeline's own `signals` stage is what creates the first
 * one.
 */
export async function applyIncrementalSignalUpdate(workspaceId: string, prospectId: string): Promise<{ updated: number }> {
  const opportunities = (await listOpportunitiesForProspect(prospectId)).filter((o) => !RESOLVED_STATUSES.includes(o.status));
  if (opportunities.length === 0) return { updated: 0 };

  // One prospect-level sync each, not per-opportunity -- signals/negative-signals belong
  // to the prospect, not to any one of its opportunities, the same modeling
  // `syncSignalsFromResearch`/`syncNegativeSignalsForProspect` already use everywhere
  // else they're called.
  await syncSignalsFromResearch(workspaceId, prospectId);
  await syncNegativeSignalsForProspect(workspaceId, prospectId);

  let updated = 0;
  for (const opportunity of opportunities) {
    let current: Opportunity = opportunity;
    const correlation = await correlateSignalsForProspect(workspaceId, prospectId);
    if (correlation) current = await attachSignalCorrelation(current.id, correlation);
    current = await setOpportunityWhyNow(current.id, correlation);
    const input = await buildNextBestActionInput(workspaceId, current);
    await setOpportunityNextBestAction(current.id, input);
    updated += 1;
  }
  return { updated };
}
