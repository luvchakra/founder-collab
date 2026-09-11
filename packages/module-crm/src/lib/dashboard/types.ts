/**
 * CRM-14.2's exact metric list, verbatim from the backlog. "This is a primary dashboard,
 * not a hidden report" -- each count is a founder-facing KPI, not an internal debugging
 * number.
 */
export type PotentialLostBusinessDashboard = {
  unansweredMessages: number;
  unansweredSocialQuestions: number;
  unansweredReviewsRequiringAction: number;
  overdueLeads: number;
  staleOpportunities: number;
  openHighIntentConversations: number;
};

/**
 * CRM-14.1's "CRM Dashboard" -- nine KPI cards, verbatim from the backlog. Complements
 * (never duplicates) CRM-14.2's Potential Lost Business Dashboard: that one is "what's
 * at risk of falling through," this one is "what's the current state of the pipeline
 * and my response performance." `responseSlaPercent` is `null` when no interaction in
 * the window has had its SLA deadline pass yet -- a founder with zero decided outcomes
 * has no compliance rate to report, not a fabricated 0% or 100%.
 */
export type CrmDashboardKpis = {
  newLeads: number;
  openOpportunities: number;
  pipelineValue: number;
  wonValue: number;
  openConversations: number;
  unansweredCommercialInteractions: number;
  overdueFollowUps: number;
  quoteFollowUps: number;
  responseSlaPercent: number | null;
};

/**
 * CRM-14.3's "Response Performance" -- five metrics, verbatim from the backlog. All
 * `null`/empty values mean "no decided data in the window yet," never a fabricated
 * zero -- see `response-performance.ts` for exactly which rows qualify for each.
 */
export type ResponsePerformance = {
  medianFirstResponseMinutes: number | null;
  slaCompliancePercent: number | null;
  unresolvedByAge: { bucket: string; count: number }[];
  ownerPerformance: { ownerId: string | null; ownerName: string; responded: number; medianResponseMinutes: number | null }[];
  channelResponseTime: { channel: string; medianResponseMinutes: number | null }[];
};
