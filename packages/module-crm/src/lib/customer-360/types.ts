import type { FollowUp } from "../follow-ups/types";
import type { Lead } from "../leads/types";

export type Customer360OpportunitySummary = {
  id: string;
  status: string;
  stageId: string | null;
  createdAt: string;
};

export type Customer360ConversationSummary = {
  id: string;
  primaryChannel: string;
  status: string;
  lastInteractionAt: string | null;
};

/**
 * CRM-01.3's `getCustomer360()` contract operation -- deliberately CRM-schema-only.
 * CRM-02.1 ("Customer/Contact 360 View") is the story that builds the actual UI panel
 * and pulls in the cross-module sections (Discovery prospect stage, Inventory orders,
 * FSM jobs, GST filing status, core payment balance) per its own acceptance criteria --
 * pre-building that aggregation here would be implementing a later story early. This
 * type only carries what CRM's own new tables can answer today: open leads,
 * opportunities, follow-ups and recent conversations for the party.
 */
export type Customer360 = {
  partyId: string;
  openLeads: Lead[];
  openOpportunities: Customer360OpportunitySummary[];
  openFollowUps: FollowUp[];
  recentConversations: Customer360ConversationSummary[];
};
