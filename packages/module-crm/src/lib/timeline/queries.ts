import { listRecentOrdersForParty } from "@cofounderai/module-inventory/contract/index";
import { listRecentJobsForParty } from "@cofounderai/module-fsm/contract/index";
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { listActivitiesForParty } from "../activities/queries";
import { listInteractionsForParty } from "../interactions/queries";
import { getOpportunity, getFsmQuoteStatusForOpportunity, listOpportunitiesWithFsmQuoteForParty } from "../opportunities/queries";
import type { Activity } from "../activities/types";
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

/**
 * INT-01.3's "Journey State History" -- the same merge-and-sort shape
 * `listRelationshipTimeline()` above already established (CRM-02.3), scoped to one
 * *opportunity* instead of a party's entire history, and extended with the state
 * transitions the cross-module journey introduces (a product being linked, an FSM
 * quote/job being created or completed). "Each event identifies owning module" is
 * `TimelineEntry.source`, already required by that type; "source entity remains
 * clickable/openable" is `detailHref`, set wherever a real detail page exists, same as
 * every entry above already does. "Duplicate events do not duplicate visible business
 * outcomes" and "out-of-order events do not corrupt state" both fall out for free from
 * this being a pure read over each module's own source-of-truth rows (Rule 3 "never
 * copy ownership") -- there is no separate event log of this history's own to
 * accidentally duplicate or replay out of order; a row appears here exactly once
 * because it exists exactly once in its owning table.
 */
export async function listOpportunityJourneyHistory(businessId: string, opportunityId: string): Promise<TimelineEntry[]> {
  const opportunity = await getOpportunity(businessId, opportunityId);
  if (!opportunity) return [];

  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const [activitiesRes, conversationsRes, prospectResult, fsmQuoteStatus, productInterestRes] = await Promise.all([
    // Queried directly by opportunity_id (not listActivitiesForParty()) -- an activity
    // created straight against this opportunity (CRM-05.2's own "Add next action" form)
    // may have no party_id set at all, so filtering a party-scoped list down would miss
    // it; crm.activity's own check constraint only requires one of the four anchors.
    supabase.from("activity").select("*").eq("business_id", businessId).eq("opportunity_id", opportunityId),
    supabase.from("conversation").select("id").eq("business_id", businessId).eq("opportunity_id", opportunityId),
    getProspectSummaryForParty(businessId, opportunity.party_id),
    getFsmQuoteStatusForOpportunity(businessId, opportunity),
    supabase.from("product_interest").select("id, item_id, created_at").eq("business_id", businessId).eq("opportunity_id", opportunityId),
  ]);
  if (activitiesRes.error) throw activitiesRes.error;
  if (conversationsRes.error) throw conversationsRes.error;
  if (productInterestRes.error) throw productInterestRes.error;
  const activities = activitiesRes.data as Activity[];

  const entries: TimelineEntry[] = [
    {
      id: `opportunity-${opportunity.id}`,
      source: "crm.opportunity",
      occurredAt: opportunity.created_at,
      label: "Opportunity created",
      detail: null,
      detailHref: null,
    },
  ];

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

  const conversationIds = conversationsRes.data.map((c) => c.id);
  if (conversationIds.length > 0) {
    const { data: interactions, error: interactionsError } = await supabase
      .from("interaction")
      .select("id, direction, channel, content_excerpt, occurred_at")
      .eq("business_id", businessId)
      .in("conversation_id", conversationIds);
    if (interactionsError) throw interactionsError;
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
  }

  if (productInterestRes.data.length > 0) {
    const itemIds = [...new Set(productInterestRes.data.map((p) => p.item_id))];
    const { data: items, error: itemsError } = await core.from("items").select("id, name").in("id", itemIds);
    if (itemsError) throw itemsError;
    const itemNameById = new Map(items.map((i) => [i.id, i.name]));
    for (const productInterest of productInterestRes.data) {
      entries.push({
        id: `product-interest-${productInterest.id}`,
        source: "inventory.product_interest",
        occurredAt: productInterest.created_at,
        label: `Product linked: ${itemNameById.get(productInterest.item_id) ?? "Unknown product"}`,
        detail: null,
        detailHref: null,
      });
    }
  }

  if (prospectResult.ok && prospectResult.data) {
    entries.push({
      id: `prospect-${prospectResult.data.prospectId}`,
      source: "discovery.prospect",
      occurredAt: opportunity.created_at,
      label: `Discovery: ${prospectResult.data.productName} -- ${prospectResult.data.status}/${prospectResult.data.outcome}`,
      detail: null,
      detailHref: null,
    });
  }

  if (fsmQuoteStatus) {
    entries.push({
      id: `fsm-quote-${fsmQuoteStatus.fsmOpportunityId}`,
      source: "fsm.quote",
      occurredAt: fsmQuoteStatus.fsmOpportunityCreatedAt,
      label: `FSM quote created${fsmQuoteStatus.estimateStatus ? ` -- ${fsmQuoteStatus.estimateStatus}` : ""}`,
      detail: null,
      detailHref: `/dashboard/businesses/${businessId}/crm/opportunities/${opportunity.id}`,
    });
    if (fsmQuoteStatus.jobId && fsmQuoteStatus.jobCreatedAt) {
      entries.push({
        id: `fsm-job-created-${fsmQuoteStatus.jobId}`,
        source: "fsm.job",
        occurredAt: fsmQuoteStatus.jobCreatedAt,
        label: "FSM job created",
        detail: null,
        detailHref: `/dashboard/businesses/${businessId}/fsm/jobs/${fsmQuoteStatus.jobId}`,
      });
    }
    if (fsmQuoteStatus.jobId && fsmQuoteStatus.jobCompletedAt) {
      entries.push({
        id: `fsm-job-completed-${fsmQuoteStatus.jobId}`,
        source: "fsm.job",
        occurredAt: fsmQuoteStatus.jobCompletedAt,
        label: "FSM job completed",
        detail: null,
        detailHref: `/dashboard/businesses/${businessId}/fsm/jobs/${fsmQuoteStatus.jobId}`,
      });
    }
  }

  return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
