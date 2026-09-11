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
