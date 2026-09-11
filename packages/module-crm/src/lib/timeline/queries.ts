import { listRecentOrdersForParty } from "@cofounderai/module-inventory/contract/index";
import { listRecentJobsForParty } from "@cofounderai/module-fsm/contract/index";
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { listActivitiesForParty } from "../activities/queries";
import { listInteractionsForParty } from "../interactions/queries";
import { getFsmQuoteStatusForOpportunity, listOpportunitiesWithFsmQuoteForParty } from "../opportunities/queries";
import type { TimelineEntry } from "./types";

/**
 * CRM-02.3's Relationship Timeline -- merges CRM's own activity/interaction history
 * (always available) with the cross-module sections listed in the backlog's "Timeline
 * sources" (Inventory orders, FSM jobs, Discovery prospect state), each omitted rather
 * than erroring when that module isn't licensed (ADR-10), so "Timeline remains useful
 * with only CRM licensed" holds -- the CRM-owned entries alone are still a real,
 * chronological timeline, not an empty page.
 *
 * CRM-11.4's "Job Timeline in Customer 360" (fsm.quote entries below) is what this
 * file's own earlier comment anticipated once a real FSM quote-status contract existed
 * (CRM-11.2's `getFsmQuoteStatus()`) -- reviews (CRM-08.5) shipped separately, on their
 * own page, not through this timeline.
 */
export async function listRelationshipTimeline(businessId: string, partyId: string): Promise<TimelineEntry[]> {
  const [activities, interactions, ordersResult, jobsResult, prospectResult, opportunitiesWithFsmQuote] = await Promise.all([
    listActivitiesForParty(businessId, partyId),
    listInteractionsForParty(businessId, partyId),
    listRecentOrdersForParty(businessId, partyId),
    listRecentJobsForParty(businessId, partyId),
    getProspectSummaryForParty(businessId, partyId),
    listOpportunitiesWithFsmQuoteForParty(businessId, partyId),
  ]);

  const entries: TimelineEntry[] = [];

  for (const activity of activities) {
    entries.push({
      id: `activity-${activity.id}`,
      source: "crm.activity",
      occurredAt: activity.created_at,
      label: activity.subject || activity.type,
      detail: activity.body,
      detailHref: null,
    });
  }

  for (const interaction of interactions) {
    entries.push({
      id: `interaction-${interaction.id}`,
      source: "crm.interaction",
      occurredAt: interaction.occurred_at,
      label: `${interaction.direction === "inbound" ? "Received" : "Sent"} ${interaction.channel} message`,
      detail: interaction.content_excerpt,
      detailHref: null,
    });
  }

  if (ordersResult.ok) {
    for (const order of ordersResult.data) {
      entries.push({
        id: `order-${order.id}`,
        source: "inventory.order",
        occurredAt: order.orderDate,
        label: `${order.kind === "invoice" ? "Invoice" : "Order"} ${order.number} -- ${order.status}`,
        detail: null,
        detailHref: null,
      });
    }
  }

  if (jobsResult.ok) {
    for (const job of jobsResult.data) {
      entries.push({
        id: `job-${job.id}`,
        source: "fsm.job",
        occurredAt: job.scheduledAt ?? job.createdAt,
        label: `${job.number ? `Job ${job.number}` : "Job"} -- ${job.status}`,
        detail: job.description,
        detailHref: `/dashboard/businesses/${businessId}/fsm/jobs/${job.id}`,
      });
    }
  }

  if (prospectResult.ok && prospectResult.data) {
    entries.push({
      id: `prospect-${prospectResult.data.prospectId}`,
      source: "discovery.prospect",
      // No timestamp is returned by getProspectSummaryForParty -- this represents
      // current prospect state, so it sorts to "now" rather than an invented date.
      occurredAt: new Date().toISOString(),
      label: `Discovery: ${prospectResult.data.productName} -- ${prospectResult.data.status}/${prospectResult.data.outcome}`,
      detail: null,
      detailHref: null,
    });
  }

  for (const opportunity of opportunitiesWithFsmQuote) {
    const quoteStatus = await getFsmQuoteStatusForOpportunity(businessId, opportunity);
    if (!quoteStatus) continue;
    entries.push({
      id: `fsm-quote-${opportunity.id}`,
      source: "fsm.quote",
      // Same "no real timestamp -- represents current state" precedent as the
      // discovery.prospect entry above: quote/job status is a live projection
      // (CRM-11.2), not a dated event, so it sorts to "now".
      occurredAt: new Date().toISOString(),
      label: quoteStatus.jobStatus
        ? `FSM quote ${quoteStatus.estimateStatus ?? quoteStatus.opportunityStatus} -- job ${quoteStatus.jobStatus}`
        : `FSM quote ${quoteStatus.estimateStatus ?? quoteStatus.opportunityStatus}`,
      detail: null,
      detailHref: `/dashboard/businesses/${businessId}/crm/opportunities/${opportunity.id}`,
    });
  }

  return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
