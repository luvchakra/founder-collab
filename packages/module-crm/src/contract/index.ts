import { hasModule } from "@cofounderai/core/licensing/queries";
import { num } from "@cofounderai/core/lib/format";
import { getOpenTicketsCount } from "../lib/dashboard/queries";
import { createActivity as createActivityMutation } from "../lib/activities/mutations";
import { getCustomer360 as getCustomer360Query } from "../lib/customer-360/queries";
import { listOpenFollowUps as listOpenFollowUpsQuery } from "../lib/follow-ups/queries";
import { getConversationById, getOpenCommercialInteractions as getOpenCommercialInteractionsQuery } from "../lib/interactions/queries";
import { recordInteraction as recordInteractionMutation } from "../lib/interactions/mutations";
import {
  createLead as createLeadMutation,
  convertLeadToOpportunity as convertLeadToOpportunityMutation,
  promoteProspectToLead,
} from "../lib/leads/mutations";
import { listLeads as listLeadsQuery } from "../lib/leads/queries";
import type { ContractResult } from "./types";
import type { ShellAlert } from "@cofounderai/core/shell/types";
import type { Activity, CreateActivityInput } from "../lib/activities/types";
import type { Customer360 } from "../lib/customer-360/types";
import type { ConversationDetail } from "../lib/conversations/types";
import type { FollowUp } from "../lib/follow-ups/types";
import type { Interaction, RecordInteractionInput } from "../lib/interactions/types";
import type { CreateLeadInput, Lead, LeadStatus } from "../lib/leads/types";

/**
 * module-crm's public API surface (00-MASTER-PLAN.md §6 mechanism 2) -- the first
 * `contract/index.ts` this module has, mirroring module-inventory's/module-fsm's/
 * module-gst's own first ones. The ONLY thing another module may import from this
 * package (CLAUDE.md's architecture rule #3, CI-enforced by lint:boundaries).
 *
 * CRM-01.3 adds the backlog's own required contract surface (getCustomer360,
 * listLeads, createLead, convertLeadToOpportunity, createActivity, listOpenFollowUps,
 * getConversation, recordInteraction, getOpenCommercialInteractions), each a thin
 * license-checked wrapper around a lib/*.ts function -- same "contract wraps lib, never
 * inlines the query itself" shape module-fsm's and module-inventory's own contracts
 * already use. Every function runs as the calling user through the normal RLS-scoped
 * client (crm's `tenant AND licensed` policies, 20260908130000_crm_schema.sql /
 * 20260911000000_crm_backlog_schema_baseline.sql) -- there is no privileged path for a
 * cross-module call, and a caller not licensed for `crm` gets `MODULE_NOT_LICENSED` back
 * as a normal result rather than an exception (ADR-10).
 */

async function requireLicensed(businessId: string): Promise<"MODULE_NOT_LICENSED" | null> {
  const licensed = await hasModule(businessId, "crm");
  return licensed ? null : "MODULE_NOT_LICENSED";
}

/**
 * A short plain-language snapshot of this business's inbox -- what the AI assistant
 * grounds itself in when the founder is looking at CRM, or has opted into "consult all
 * modules." Reuses getOpenTicketsCount(), the same count the platform dashboard's own
 * module-widget row already shows.
 */
export async function getChatContextSummary(businessId: string): Promise<ContractResult<string>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const openTickets = await getOpenTicketsCount([businessId]);
  return {
    ok: true,
    data:
      openTickets > 0
        ? `CRM: ${num.format(openTickets)} open/pending ticket(s) in the inbox.`
        : "CRM: no open tickets in the inbox.",
  };
}

/** Topbar alert-bell entry for this business's inbox -- see module-inventory/contract/
 * index.ts#getAlerts's own doc comment for why `ShellAlert` is core-owned. */
export async function getAlerts(businessId: string): Promise<ContractResult<ShellAlert[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const openTickets = await getOpenTicketsCount([businessId]);
  if (openTickets === 0) return { ok: true, data: [] };

  return {
    ok: true,
    data: [
      {
        id: `crm-open-tickets-${businessId}`,
        severity: "info",
        message: `${num.format(openTickets)} open/pending ticket(s) in the inbox.`,
        href: `/dashboard/businesses/${businessId}/crm`,
        businessId,
      },
    ],
  };
}

/** CRM-01.3: relationship snapshot for one `core.parties` row -- see
 * lib/customer-360/types.ts's own doc comment for why this is CRM-schema-only for now
 * (CRM-02.1 adds the cross-module sections). */
export async function getCustomer360(businessId: string, partyId: string): Promise<ContractResult<Customer360>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await getCustomer360Query(businessId, partyId);
  return { ok: true, data };
}

/** CRM-01.3: list leads for this business, optionally filtered by status/owner. */
export async function listLeads(businessId: string, filter?: { status?: LeadStatus; ownerId?: string }): Promise<ContractResult<Lead[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await listLeadsQuery(businessId, filter);
  return { ok: true, data };
}

/** CRM-01.3: create a lead against an existing `core.parties` row. */
export async function createLead(businessId: string, input: CreateLeadInput): Promise<ContractResult<Lead>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await createLeadMutation(businessId, input);
  return { ok: true, data };
}

/** CRM-01.3: promote a lead to an opportunity (CRM-03.4's minimal state transition --
 * see lib/leads/mutations.ts's own doc comment for what's deferred to that story). */
export async function convertLeadToOpportunity(businessId: string, leadId: string): Promise<ContractResult<{ opportunityId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await convertLeadToOpportunityMutation(businessId, leadId);
  return { ok: true, data };
}

/** CRM-01.3: log an activity against a party, lead, opportunity or conversation. */
export async function createActivity(businessId: string, input: CreateActivityInput): Promise<ContractResult<Activity>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await createActivityMutation(businessId, input);
  return { ok: true, data };
}

/** CRM-01.3: pending follow-ups, soonest-due first. */
export async function listOpenFollowUps(businessId: string, ownerId?: string): Promise<ContractResult<FollowUp[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await listOpenFollowUpsQuery(businessId, ownerId);
  return { ok: true, data };
}

/** CRM-01.3: one conversation with its participants and interaction timeline. */
export async function getConversation(businessId: string, conversationId: string): Promise<ContractResult<ConversationDetail>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await getConversationById(businessId, conversationId);
  if (!data) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, data: data as ConversationDetail };
}

/** CRM-01.3: log an inbound or outbound interaction, finding or creating its
 * conversation -- see lib/interactions/mutations.ts's own doc comment for the
 * CRM-01.6 idempotency behavior on a duplicate `external_message_id`. */
export async function recordInteraction(businessId: string, input: RecordInteractionInput): Promise<ContractResult<Interaction>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await recordInteractionMutation(businessId, input);
  return { ok: true, data };
}

/** CRM-01.3: interactions still awaiting a response, oldest first -- see
 * lib/interactions/queries.ts's own doc comment for why "commercial" is simply
 * `requires_response = true` until CRM-09's rules engine exists. */
export async function getOpenCommercialInteractions(businessId: string): Promise<ContractResult<Interaction[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await getOpenCommercialInteractionsQuery(businessId);
  return { ok: true, data };
}

/** CRM-03.1: Discovery's "Promote to CRM" action -- turns a discovered prospect into a
 * managed CRM lead without re-entering data. See lib/leads/mutations.ts's own
 * `promoteProspectToLead()` docstring for why the richer prospect context (ICP fit,
 * buying signals, research) is carried forward by reference rather than copied, and for
 * the idempotency guarantee (calling this twice for the same prospect never creates a
 * second lead). */
export async function promoteProspectToCrm(
  businessId: string,
  input: { partyId: string; prospectId: string; ownerId?: string | null },
): Promise<ContractResult<{ leadId: string; alreadyPromoted: boolean }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const data = await promoteProspectToLead(businessId, input);
  return { ok: true, data };
}
