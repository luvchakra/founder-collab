import { createClient } from "../../db/server";
import { getOpenCommercialInteractions } from "../interactions/queries";
import { isHighCommercialIntent } from "../interactions/intent-classification";
import type { MessageIntent } from "../interactions/intent-classification";
import type { PotentialLostBusinessDashboard } from "./types";

/** S-5's own registry-driven dashboard: an open+pending ticket count across every
 * business the caller already knows has `crm` licensed -- see
 * `module-fsm/lib/dashboard/queries.ts#getOpenJobsCount`'s own docstring for the
 * "trusts the caller's license filtering" reasoning. */
export async function getOpenTicketsCount(businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds)
    .in("status", ["open", "pending"]);
  if (error) throw error;
  return count ?? 0;
}

/** CRM-08.x's own social channels (Instagram/Facebook Messenger/Google Business
 * Messages) -- none of them are wired up yet (CRM-08.2/08.3, P1, not built), so this
 * always returns 0 for `unansweredSocialQuestions` today. Splitting the query on this
 * list rather than hardcoding a separate metric means the number starts reporting for
 * real the moment those channels start writing `crm.interaction` rows, with no change
 * needed here. */
const SOCIAL_CHANNELS = ["instagram", "facebook_messenger", "google_business_messages"];

/** No per-stage staleness configuration exists yet (CRM-04.6 "Stale Opportunity
 * Detection" is a separate, not-yet-built P1 story) -- this is the simplest defensible
 * definition that needs no new schema: an open opportunity nothing has touched in two
 * weeks. `crm.opportunity.updated_at` is kept current by the generic
 * `set_updated_at()` trigger every crm-schema table already has, so this reflects any
 * real change (stage, value, owner, ...), not just creation. */
const STALE_OPPORTUNITY_DAYS = 14;

/**
 * CRM-14.2's "Potential Lost Business Dashboard" -- six KPI counts, verbatim from the
 * backlog. Distinct from CRM-09.2's queue (a list of individual interactions to act on
 * one at a time): this is the aggregate view "make the differentiator visible" calls
 * for. Reuses `getOpenCommercialInteractions()` (CRM-01.3/09.2) for three of the six
 * metrics rather than three separate count queries, since "unanswered messages",
 * "unanswered social questions", and "open high-intent conversations" are all different
 * slices of that exact same row set. Raised its limit generously (1000) since this needs
 * every open commercial interaction to count correctly, not a paginated page of them --
 * a business with more than that many simultaneously unanswered commercial messages has
 * a bigger problem than this dashboard undercounting by a few.
 */
export async function getPotentialLostBusinessDashboard(businessId: string): Promise<PotentialLostBusinessDashboard> {
  const supabase = await createClient();
  const staleThreshold = new Date(Date.now() - STALE_OPPORTUNITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const [openCommercialInteractions, reviewsRes, overdueFollowUpsRes, staleOpportunitiesRes] = await Promise.all([
    getOpenCommercialInteractions(businessId, 1000),
    supabase.from("review_item").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["new", "in_progress"]),
    supabase.from("follow_up").select("lead_id").eq("business_id", businessId).eq("status", "pending").lt("due_at", now).not("lead_id", "is", null),
    supabase.from("opportunity").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "open").lt("updated_at", staleThreshold),
  ]);
  if (reviewsRes.error) throw reviewsRes.error;
  if (overdueFollowUpsRes.error) throw overdueFollowUpsRes.error;
  if (staleOpportunitiesRes.error) throw staleOpportunitiesRes.error;

  const unansweredMessages = openCommercialInteractions.filter((i) => !SOCIAL_CHANNELS.includes(i.channel)).length;
  const unansweredSocialQuestions = openCommercialInteractions.filter((i) => SOCIAL_CHANNELS.includes(i.channel)).length;
  const openHighIntentConversations = new Set(
    openCommercialInteractions.filter((i) => isHighCommercialIntent(i.intent as MessageIntent | null)).map((i) => i.conversation_id),
  ).size;

  const overdueLeadIds = [...new Set((overdueFollowUpsRes.data ?? []).map((row) => row.lead_id as string))];
  let overdueLeads = 0;
  if (overdueLeadIds.length > 0) {
    const { count, error } = await supabase
      .from("lead")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .in("id", overdueLeadIds)
      .not("status", "in", "(won,lost)");
    if (error) throw error;
    overdueLeads = count ?? 0;
  }

  return {
    unansweredMessages,
    unansweredSocialQuestions,
    unansweredReviewsRequiringAction: reviewsRes.count ?? 0,
    overdueLeads,
    staleOpportunities: staleOpportunitiesRes.count ?? 0,
    openHighIntentConversations,
  };
}
