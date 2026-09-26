// EXP-DISC-04 -- Prospect Detail / Buyer Intelligence export
// (/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]).
// Also carries EXP-DISC-07 (research evidence and signals as rows) and EXP-DISC-08
// (outreach records): Discovery has no standalone research, signals or outreach page --
// those datasets are rendered on this page, so they are exported from it.
import { getDiscoveryHandoffLead } from "@cofounderai/module-crm/contract/index";
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import { getBuyerIntelligenceForProspect } from "../../lib/buyer-intelligence/queries";
import {
  CONTACTABILITY_LABEL,
  RELEVANCE_LABEL,
  SENIORITY_LABEL,
  type BuyerPersonIntelligence,
} from "../../lib/buyer-intelligence/types";
import { listContacts } from "../../lib/contacts/queries";
import type { Contact } from "../../lib/contacts/types";
import { listConversations } from "../../lib/conversations/queries";
import type { Conversation } from "../../lib/conversations/types";
import { listMessages } from "../../lib/messages/queries";
import type { Message } from "../../lib/messages/types";
import { getLatestOutreachStrategy } from "../../lib/outreach/queries";
import { PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import { computeDiscoveryOutcomeStage, DISCOVERY_OUTCOME_STAGE_LABEL } from "../../lib/prospects/outcome";
import {
  deriveProspectPipelineState,
  latestTimestamp,
  PROSPECT_STAGE_LABEL,
} from "../../lib/prospects/pipeline";
import { getProspect } from "../../lib/prospects/queries";
import type { Prospect } from "../../lib/prospects/types";
import { getResearchBrief } from "../../lib/research-briefs/queries";
import { getProspectResearch } from "../../lib/research/queries";
import { EVIDENCE_TYPE_LABEL, type EvidenceItem } from "../../lib/research/types";
import { listRecentProspectScores } from "../../lib/scoring/queries";
import type { ProspectScore } from "../../lib/scoring/types";
import { listSignalsForProspect } from "../../lib/signals/queries";
import { SIGNAL_TYPE_LABEL, type Signal } from "../../lib/signals/types";
import { getWatchlistEntryForProspect } from "../../lib/watchlist/queries";
import {
  BASIS,
  CHANNEL_LABEL,
  LEVEL_LABEL,
  PROSPECT_OUTCOME_LABEL,
  PROSPECT_STATUS_LABEL,
  humanize,
  isUuid,
  labelOf,
  readProductId,
  resolveOffering,
} from "./shared";

export type ProspectDetailExportFilters = { productId: string; prospectId: string };

// The prospect page's own inline label maps, same wording.
const MESSAGE_STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved", sent: "Sent", failed: "Failed" };
const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  awaiting_reply: "Awaiting reply",
  replied: "Needs response",
  closed: "Closed",
};
const CLASSIFICATION_LABEL: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  question: "Question",
  objection: "Objection",
  out_of_office: "Out of office",
  unsubscribe: "Unsubscribe",
  other: "Other",
};
const DIRECTION_LABEL: Record<string, string> = { outbound: "Outbound", inbound: "Inbound" };
const CONTACT_STATUS_LABEL: Record<string, string> = { active: "Active", inactive: "Inactive" };
const STRATEGY_STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved" };
const SOURCE_TYPE_LABEL: Record<string, string> = { first_party: "First party", external: "External" };

/** Up to this many scores -- the whole append-only score history of one prospect. */
const SCORE_HISTORY_LIMIT = 1000;

function contactName(contact: Contact | undefined): string | null {
  if (!contact) return null;
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || null;
}

/**
 * One prospect's structured bundle: the prospect and its pipeline position, contacts,
 * research evidence, computed buyer intelligence, signals, score history and outreach
 * history -- a sheet each. Every read is the page's own query; the prospect must sit in
 * the workspace of an offering that belongs to this business, or it is "not found" just
 * as the page 404s. Provider identifiers and template variables on messages are never
 * exported. CRM handoff comes only through CRM's contract; when CRM isn't licensed the
 * handoff cells stay blank and say why.
 */
export const discoveryProspectDetailExport: ExportAdapter<ProspectDetailExportFilters> = {
  id: "discovery.prospect",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params), prospectId: params.get("prospectId") ?? "" }),
  describeFilters: (f) => ({ Offering: f.productId, Prospect: f.prospectId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    if (!isUuid(filters.prospectId)) throw new ExportDeniedError("Prospect not found.", 404);
    const prospect = await getProspect(filters.prospectId);
    if (!prospect || prospect.workspace_id !== workspace.id) throw new ExportDeniedError("Prospect not found.", 404);

    const [contacts, research, scores, strategy, messages, conversations, brief, buyerIntelligence, watchlistEntry, signals, crmLead] =
      await Promise.all([
        listContacts(prospect.id),
        getProspectResearch(prospect.id),
        listRecentProspectScores(prospect.id, SCORE_HISTORY_LIMIT),
        getLatestOutreachStrategy(prospect.id),
        listMessages(prospect.id),
        listConversations(prospect.id),
        getResearchBrief(prospect.id),
        getBuyerIntelligenceForProspect(workspace.id, prospect.id),
        getWatchlistEntryForProspect(prospect.id),
        listSignalsForProspect(prospect.id),
        getDiscoveryHandoffLead(context.businessId, prospect.id),
      ]);

    // Pipeline position, computed exactly as the page computes it.
    const score = scores[0] ?? null;
    const drafts = messages.filter((m) => !m.conversation_id);
    const latestConversation = conversations.reduce<Conversation | null>(
      (latest, c) => (!latest || c.last_message_at > latest.last_message_at ? c : latest),
      null,
    );
    const { stage, nextAction } = deriveProspectPipelineState({
      hasResearch: research !== null,
      hasScore: score !== null,
      latestStrategyStatus: strategy?.status ?? null,
      hasUnsentMessage: drafts.length > 0,
      hasFailedMessage: messages.some((m) => m.status === "failed"),
      hasSentMessage: messages.some((m) => m.status === "sent"),
      latestConversationStatus: latestConversation?.status ?? null,
      lastActivityAt: latestTimestamp(
        prospect.updated_at,
        research?.researched_at,
        score?.created_at,
        strategy?.updated_at,
        ...messages.map((m) => m.created_at),
        latestConversation?.last_message_at,
      ),
    });

    const lead = crmLead.ok ? crmLead.data : null;
    const crmSource = crmLead.ok
      ? null
      : crmLead.error === "MODULE_NOT_LICENSED"
        ? "CRM not licensed"
        : "CRM unavailable";
    const outcomeStage = computeDiscoveryOutcomeStage({
      hasResearch: research !== null,
      prospectStatus: prospect.status,
      hasSentMessage: messages.some((m) => m.status === "sent"),
      hasConversation: conversations.length > 0,
      handedOffToCrm: lead !== null,
      downstreamLeadStatus: lead?.status ?? null,
      prospectOutcome: prospect.outcome,
    });

    const contactById = new Map(contacts.map((c) => [c.id, c] as const));
    const conversationById = new Map(conversations.map((c) => [c.id, c] as const));
    const outreach = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));

    return {
      module: "discovery",
      resource: "prospect",
      title: "Discovery prospect",
      metadata: { Offering: product.name, Prospect: prospect.company_name },
      sheets: [
        {
          sheetName: "Prospect",
          columns: [
            { key: "company", header: "Company", getValue: (p: Prospect) => p.company_name },
            { key: "website", header: "Website", getValue: (p: Prospect) => p.website },
            { key: "domain", header: "Domain", getValue: (p: Prospect) => p.domain },
            { key: "industry", header: "Industry", getValue: (p: Prospect) => p.industry },
            { key: "company_size", header: "Company size", getValue: (p: Prospect) => p.company_size },
            { key: "location", header: "Location", getValue: (p: Prospect) => p.location },
            { key: "description", header: "Description", getValue: (p: Prospect) => p.description },
            { key: "linkedin", header: "Company LinkedIn", getValue: (p: Prospect) => p.linkedin_url },
            { key: "twitter", header: "Company X/Twitter", getValue: (p: Prospect) => p.twitter_url },
            { key: "company_email", header: "General company email", getValue: (p: Prospect) => p.company_email },
            { key: "status", header: "Status", getValue: (p: Prospect) => labelOf(PROSPECT_STATUS_LABEL, p.status) },
            { key: "stage", header: "Stage", getValue: () => PROSPECT_STAGE_LABEL[stage] },
            { key: "next_action", header: "Next action", getValue: () => nextAction },
            { key: "outcome", header: "Outcome", getValue: (p: Prospect) => labelOf(PROSPECT_OUTCOME_LABEL, p.outcome) },
            { key: "discovery_outcome", header: "Discovery outcome stage", getValue: () => DISCOVERY_OUTCOME_STAGE_LABEL[outcomeStage] },
            { key: "fit_score", header: "Fit score", type: "integer", getValue: (p: Prospect) => p.fit_score },
            { key: "fit_score_basis", header: "Fit score basis", getValue: (p: Prospect) => (p.fit_score === null ? null : BASIS.fitScore) },
            { key: "crm_handoff", header: "Handed off to CRM", type: "boolean", getValue: () => (crmLead.ok ? lead !== null : null) },
            { key: "crm_lead_status", header: "CRM lead status", getValue: () => humanize(lead?.status) },
            { key: "crm_source", header: "CRM handoff source", getValue: () => crmSource },
            { key: "watchlist", header: "On watchlist", type: "boolean", getValue: () => watchlistEntry !== null },
            { key: "watch_reason", header: "Watch reason", getValue: () => watchlistEntry?.watch_reason ?? null },
            { key: "next_review", header: "Next review", type: "datetime", getValue: () => watchlistEntry?.next_review_at ?? null },
            { key: "research_summary", header: "Research summary", getValue: () => research?.summary ?? null },
            { key: "pain_points", header: "Pain points", getValue: () => research?.pain_points ?? null },
            { key: "buying_signals", header: "Buying signals", getValue: () => research?.buying_signals ?? null },
            { key: "recent_events", header: "Recent events", getValue: () => research?.recent_events ?? null },
            { key: "recommended_angle", header: "Recommended angle", getValue: () => research?.recommended_angle ?? null },
            { key: "research_basis", header: "Research basis", getValue: () => (research ? BASIS.aiDerived : null) },
            { key: "researched", header: "Researched", type: "datetime", getValue: () => research?.researched_at ?? null },
            { key: "research_expires", header: "Research expires", type: "datetime", getValue: () => research?.expires_at ?? null },
            { key: "brief_offering_fit", header: "Brief: offering fit", getValue: () => brief?.offering_fit ?? null },
            { key: "brief_problem", header: "Brief: problem hypothesis", getValue: () => brief?.problem_hypothesis ?? null },
            { key: "brief_objection", header: "Brief: potential objection", getValue: () => brief?.potential_objection ?? null },
            { key: "brief_opening", header: "Brief: suggested opening", getValue: () => brief?.suggested_opening ?? null },
            { key: "brief_confidence", header: "Brief confidence", getValue: () => labelOf(LEVEL_LABEL, brief?.confidence) },
            { key: "brief_basis", header: "Brief basis", getValue: () => (brief ? BASIS.aiDerived : null) },
            { key: "brief_generated", header: "Brief generated", type: "datetime", getValue: () => brief?.generated_at ?? null },
            { key: "strategy", header: "Outreach strategy", getValue: () => strategy?.strategy ?? null },
            { key: "strategy_channel", header: "Strategy channel", getValue: () => labelOf(CHANNEL_LABEL, strategy?.channel) },
            { key: "strategy_reason", header: "Strategy reason", getValue: () => strategy?.reason ?? null },
            { key: "strategy_key_message", header: "Key message", getValue: () => strategy?.key_message ?? null },
            { key: "strategy_cta", header: "Call to action", getValue: () => strategy?.cta ?? null },
            { key: "strategy_status", header: "Strategy status", getValue: () => labelOf(STRATEGY_STATUS_LABEL, strategy?.status) },
            { key: "created", header: "Created", type: "datetime", getValue: (p: Prospect) => p.created_at },
            { key: "updated", header: "Updated", type: "datetime", getValue: (p: Prospect) => p.updated_at },
          ],
          rows: [prospect],
        },
        {
          sheetName: "Contacts",
          columns: [
            { key: "name", header: "Name", getValue: (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ") || null },
            { key: "job_title", header: "Job title", getValue: (c: Contact) => c.job_title },
            { key: "email", header: "Email", getValue: (c: Contact) => c.email },
            { key: "phone", header: "Phone", getValue: (c: Contact) => c.phone },
            { key: "linkedin", header: "LinkedIn", getValue: (c: Contact) => c.linkedin_url },
            { key: "status", header: "Status", getValue: (c: Contact) => labelOf(CONTACT_STATUS_LABEL, c.status) },
            { key: "created", header: "Added", type: "datetime", getValue: (c: Contact) => c.created_at },
          ],
          rows: contacts,
        },
        {
          sheetName: "Research",
          columns: [
            { key: "finding", header: "Finding", getValue: (e: EvidenceItem) => e.statement },
            { key: "evidence_type", header: "Evidence type", getValue: (e: EvidenceItem) => labelOf(EVIDENCE_TYPE_LABEL, e.evidence_type) },
            { key: "confidence", header: "Confidence", getValue: (e: EvidenceItem) => labelOf(LEVEL_LABEL, e.confidence) },
            { key: "source", header: "Source", getValue: (e: EvidenceItem) => e.source },
            { key: "source_type", header: "Source type", getValue: (e: EvidenceItem) => labelOf(SOURCE_TYPE_LABEL, e.source_type) },
            { key: "url", header: "URL", getValue: (e: EvidenceItem) => e.source_url },
            // Free text as research stated it ("2026-09-01", "Q3 2025") -- not coerced to a date.
            { key: "observed", header: "Observed", getValue: (e: EvidenceItem) => e.observed_at },
            { key: "signal", header: "Supporting signal", getValue: (e: EvidenceItem) => e.supporting_signal },
            { key: "basis", header: "Basis", getValue: () => BASIS.aiDerived },
          ],
          rows: research?.evidence ?? [],
        },
        {
          sheetName: "Buyer Intelligence",
          columns: [
            { key: "name", header: "Name", getValue: (b: BuyerPersonIntelligence) => b.name },
            { key: "title", header: "Title", getValue: (b: BuyerPersonIntelligence) => b.title },
            { key: "seniority", header: "Seniority", getValue: (b: BuyerPersonIntelligence) => SENIORITY_LABEL[b.seniority] },
            { key: "persona", header: "Matched persona", getValue: (b: BuyerPersonIntelligence) => b.persona?.title ?? null },
            { key: "committee_role", header: "Likely committee role", getValue: (b: BuyerPersonIntelligence) => labelOf(PERSONA_ROLE_LABEL, b.persona?.role_in_committee) },
            { key: "relevance", header: "Relevance to offering", getValue: (b: BuyerPersonIntelligence) => RELEVANCE_LABEL[b.relevance] },
            { key: "relevance_reason", header: "Relevance reason", getValue: (b: BuyerPersonIntelligence) => b.relevanceReason },
            { key: "contactability", header: "Contactability", getValue: (b: BuyerPersonIntelligence) => CONTACTABILITY_LABEL[b.contactability] },
            { key: "contactability_reason", header: "Contactability reason", getValue: (b: BuyerPersonIntelligence) => b.contactabilityReason },
            { key: "confidence", header: "Confidence", getValue: (b: BuyerPersonIntelligence) => labelOf(LEVEL_LABEL, b.confidence) },
            { key: "evidence", header: "Supporting evidence", getValue: (b: BuyerPersonIntelligence) => b.supportingEvidence.map((e) => e.statement) },
            { key: "basis", header: "Basis", getValue: () => BASIS.calculated },
          ],
          rows: buyerIntelligence,
        },
        {
          sheetName: "Signals",
          columns: [
            { key: "type", header: "Signal type", getValue: (s: Signal) => labelOf(SIGNAL_TYPE_LABEL, s.signal_type) },
            { key: "signal", header: "Signal", getValue: (s: Signal) => s.description },
            { key: "source", header: "Source", getValue: (s: Signal) => s.source },
            { key: "observed", header: "Signal date", type: "datetime", getValue: (s: Signal) => s.observed_at },
            { key: "basis", header: "Basis", getValue: () => BASIS.aiDerived },
            { key: "created", header: "Recorded", type: "datetime", getValue: (s: Signal) => s.created_at },
          ],
          rows: signals,
        },
        {
          sheetName: "Scores",
          columns: [
            { key: "scored", header: "Scored", type: "datetime", getValue: (s: ProspectScore) => s.created_at },
            { key: "overall", header: "Overall score", type: "integer", getValue: (s: ProspectScore) => s.overall_score },
            { key: "icp", header: "ICP fit", type: "integer", getValue: (s: ProspectScore) => s.icp_score },
            { key: "intent", header: "Intent", type: "integer", getValue: (s: ProspectScore) => s.intent_score },
            { key: "timing", header: "Timing", type: "integer", getValue: (s: ProspectScore) => s.timing_score },
            { key: "reasoning", header: "Reasoning", getValue: (s: ProspectScore) => s.reasoning },
            { key: "basis", header: "Basis", getValue: () => BASIS.fitScore },
          ],
          rows: scores,
        },
        {
          sheetName: "Outreach History",
          columns: [
            { key: "created", header: "Created", type: "datetime", getValue: (m: Message) => m.created_at },
            { key: "channel", header: "Channel", getValue: (m: Message) => labelOf(CHANNEL_LABEL, m.channel) },
            { key: "direction", header: "Direction", getValue: (m: Message) => labelOf(DIRECTION_LABEL, m.direction) },
            { key: "contact", header: "Contact", getValue: (m: Message) => contactName(m.contact_id ? contactById.get(m.contact_id) : undefined) },
            { key: "subject", header: "Subject", getValue: (m: Message) => m.subject },
            { key: "content", header: "Message", getValue: (m: Message) => m.content },
            { key: "template", header: "Template", getValue: (m: Message) => m.resend_template_name },
            { key: "status", header: "Status", getValue: (m: Message) => labelOf(MESSAGE_STATUS_LABEL, m.status) },
            { key: "sent", header: "Sent", type: "datetime", getValue: (m: Message) => m.sent_at },
            { key: "failure", header: "Failure reason", getValue: (m: Message) => m.failure_reason },
            { key: "response", header: "Response classification", getValue: (m: Message) => labelOf(CLASSIFICATION_LABEL, m.classification) },
            { key: "next_action", header: "Recommended next action", getValue: (m: Message) => m.recommended_action },
            {
              key: "conversation",
              header: "Conversation status",
              getValue: (m: Message) => labelOf(CONVERSATION_STATUS_LABEL, m.conversation_id ? conversationById.get(m.conversation_id)?.status : null),
            },
          ],
          rows: outreach,
        },
      ],
    };
  },
};
