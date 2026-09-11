import type { ContractOrderSummary } from "@cofounderai/module-inventory/contract/types";
import type { ContractJobSummary } from "@cofounderai/module-fsm/contract/types";
import type { ContractProspectSummary } from "@cofounderai/module-discovery/contract/types";
import type { FollowUp } from "../follow-ups/types";
import type { Lead, LeadStatus, SourceChannel } from "../leads/types";

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

export type Customer360ProductInterest = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number | null;
};

export type Customer360Note = {
  id: string;
  body: string;
  authorId: string | null;
  createdAt: string;
};

/**
 * CRM-02.1's Customer/Contact 360 view. Identity (name/contactMethods) is
 * `core.parties` directly -- no second customer master (Section 4's reuse map).
 * `lifecycleStatus`/`owner`/`source` are read off the party's single most recent
 * `crm.lead` (reusing the CRM-04.1 lifecycle vocabulary rather than inventing a second
 * one) since a party may have no lead at all yet.
 *
 * `prospect`/`recentOrders`/`recentJobs` are the cross-module sections -- each calls the
 * owning module's own public contract (`getProspectSummaryForParty`,
 * `listRecentOrdersForParty`, `listRecentJobsForParty`, all of which already existed
 * before this story, built for this exact panel per docs/design/crm-module-design.md
 * Part B/B1) and is simply omitted (`null` / empty array) when that module isn't
 * licensed -- `MODULE_NOT_LICENSED` is a normal, expected result (ADR-10), not an error
 * to surface. GST filing status and payment aging are left for a later story: neither is
 * in CRM-02.1's own "Show" list, and pulling them in now would be implementing ahead of
 * the story that actually needs them.
 */
export type Customer360 = {
  partyId: string;
  name: string;
  contactMethods: { email: string | null; phone: string | null };
  lifecycleStatus: LeadStatus | null;
  ownerId: string | null;
  source: SourceChannel | null;
  productsOfInterest: Customer360ProductInterest[];
  openLeads: Lead[];
  openOpportunities: Customer360OpportunitySummary[];
  openFollowUps: FollowUp[];
  recentConversations: Customer360ConversationSummary[];
  notes: Customer360Note[];
  /** null when Discovery isn't licensed for this business, or the party has no
   * prospect history at all. */
  prospect: ContractProspectSummary | null;
  /** Empty both when Inventory isn't licensed and when there are simply no orders yet --
   * same as every other contract call in this type, `MODULE_NOT_LICENSED` collapses to
   * "nothing to show" rather than a distinguishable error state (ADR-10). */
  recentOrders: ContractOrderSummary[];
  recentJobs: ContractJobSummary[];
};
