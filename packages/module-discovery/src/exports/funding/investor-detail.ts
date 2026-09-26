// EXP-FND-06 -- Investor detail export (/discovery/funding/investors/[investorId]).
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import {
  getInvestor,
  listInteractions,
  listInvestorContacts,
  listOutreach,
  listPipeline,
  listResearch,
  listRounds,
} from "../../lib/funding/queries";
import { RESEARCH_FRESHNESS_DAYS, researchState } from "../../lib/funding/metrics";
import {
  INTERACTION_TYPE_LABEL,
  INVESTOR_SOURCE_LABEL,
  INVESTOR_TYPE_LABEL,
  OUTREACH_STATUS_LABEL,
  PIPELINE_STAGE_LABEL,
  PROVENANCE_LABEL,
  RESEARCH_FIELD_LABEL,
  ROUND_STATUS_LABEL,
  ROUND_TYPE_LABEL,
  type FundingRound,
  type Interaction,
  type Investor,
  type InvestorContact,
  type OutreachDraft,
  type PipelineRecord,
  type ResearchFinding,
} from "../../lib/funding/types";
import { RESEARCH_LABEL } from "./investors";
import { idParam } from "./shared";

type Filters = { investorId?: string };

type FieldRow = { field: string; value: unknown };

const INTERACTION_SOURCE_LABEL: Record<Interaction["source"], string> = { manual: "Logged by a person", outreach: "From outreach", import: "Import" };
export const OUTREACH_ORIGIN_LABEL: Record<OutreachDraft["origin"], string> = { user: "Written by a person", ai_draft: "AI draft" };

function investorRows(i: Investor, research: string): FieldRow[] {
  return [
    { field: "Investor", value: i.name },
    { field: "Type", value: INVESTOR_TYPE_LABEL[i.investorType] ?? i.investorType },
    { field: "Status", value: i.status === "archived" ? "Archived" : "Active" },
    { field: "Email", value: i.email },
    { field: "Website", value: i.website },
    { field: "Geography", value: i.geographies },
    { field: "Stage preference", value: i.stages },
    { field: "Sector preference", value: i.sectors },
    { field: "Cheque min", value: i.checkMin },
    { field: "Cheque max", value: i.checkMax },
    { field: "Currency", value: i.currency },
    { field: "Source", value: INVESTOR_SOURCE_LABEL[i.source] ?? i.source },
    { field: "Source note", value: i.sourceNote },
    { field: "Research", value: research },
    { field: "Last researched", value: i.lastResearchedAt },
    { field: "Notes", value: i.notes },
    { field: "Added", value: i.createdAt },
  ];
}

/**
 * One investor as a workbook: the firm, its contacts, research findings (each with its
 * provenance -- source-backed, user-entered or AI-inferred -- its source URL, and a
 * staleness flag past the freshness window), its pipeline in each round, interactions,
 * outreach (metadata; the email body stays in the app) and the rounds it is in. The
 * investor id comes from the request but is only ever loaded together with
 * `context.businessId`; another business's investor is "not found".
 */
export const fundingInvestorExport: ExportAdapter<Filters> = {
  id: "funding.investor",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: (params) => ({ investorId: idParam(params, "investorId") }),
  describeFilters: (f) => ({ Investor: f.investorId ?? "" }),
  async load(context, filters) {
    const investor = filters.investorId ? await getInvestor(context.businessId, filters.investorId) : null;
    if (!investor) throw new ExportDeniedError("Investor not found.", 404);
    const [contacts, research, pipeline, rounds, interactions, outreach] = await Promise.all([
      listInvestorContacts(context.businessId, investor.partyId),
      listResearch(context.businessId, investor.id),
      listPipeline(context.businessId, { investorId: investor.id }),
      listRounds(context.businessId),
      listInteractions(context.businessId, { investorId: investor.id }),
      listOutreach(context.businessId, { investorId: investor.id }),
    ]);
    const now = new Date();
    const staleBefore = now.getTime() - RESEARCH_FRESHNESS_DAYS * 86_400_000;
    const roundById = new Map(rounds.map((r) => [r.id, r]));
    const roundName = (id: string | null) => (id ? (roundById.get(id)?.name ?? null) : null);
    const inRounds = rounds.filter((r) => pipeline.some((p) => p.roundId === r.id));

    const fieldColumns: ExportColumn<FieldRow>[] = [
      { key: "field", header: "Field", getValue: (r) => r.field },
      { key: "value", header: "Value", getValue: (r) => r.value },
    ];
    const contactColumns: ExportColumn<InvestorContact>[] = [
      { key: "name", header: "Name", getValue: (c) => c.name },
      { key: "title", header: "Job title", getValue: (c) => c.jobTitle },
      { key: "email", header: "Email", getValue: (c) => c.email },
      { key: "linkedin", header: "LinkedIn", getValue: (c) => c.linkedinUrl },
      { key: "primary", header: "Primary", type: "boolean", getValue: (c) => c.isPrimary },
    ];
    const researchColumns: ExportColumn<ResearchFinding>[] = [
      { key: "field", header: "Field", getValue: (f) => RESEARCH_FIELD_LABEL[f.field] ?? f.field },
      { key: "finding", header: "Finding", getValue: (f) => f.content },
      { key: "provenance", header: "Provenance", getValue: (f) => PROVENANCE_LABEL[f.provenance] ?? f.provenance },
      { key: "sourceTitle", header: "Source title", getValue: (f) => f.sourceTitle },
      { key: "sourceUrl", header: "Source URL", getValue: (f) => f.sourceUrl },
      { key: "observed", header: "Observed", type: "datetime", getValue: (f) => f.observedAt },
      { key: "stale", header: `Older than ${RESEARCH_FRESHNESS_DAYS} days`, type: "boolean", getValue: (f) => new Date(f.observedAt).getTime() < staleBefore },
    ];
    const pipelineColumns: ExportColumn<PipelineRecord>[] = [
      { key: "round", header: "Round", getValue: (p) => roundName(p.roundId) },
      { key: "stage", header: "Stage", getValue: (p) => PIPELINE_STAGE_LABEL[p.stage] ?? p.stage },
      { key: "previous", header: "Previous stage", getValue: (p) => (p.previousStage ? PIPELINE_STAGE_LABEL[p.previousStage] : null) },
      { key: "entered", header: "Stage entered", type: "datetime", getValue: (p) => p.stageEnteredAt },
      { key: "committed", header: "Committed amount", type: "currency", getValue: (p) => p.committedAmount },
      { key: "invested", header: "Received amount", type: "currency", getValue: (p) => p.investedAmount },
      { key: "currency", header: "Currency", getValue: (p) => p.currency },
      { key: "nextAction", header: "Next action", getValue: (p) => p.nextAction },
      { key: "nextDue", header: "Next action due", type: "date", getValue: (p) => p.nextActionDue },
      { key: "passReason", header: "Pass reason", getValue: (p) => p.passReason },
      { key: "lastInteraction", header: "Last interaction", type: "datetime", getValue: (p) => p.lastInteractionAt },
    ];
    const interactionColumns: ExportColumn<Interaction>[] = [
      { key: "when", header: "When", type: "datetime", getValue: (i) => i.occurredAt },
      { key: "type", header: "Type", getValue: (i) => INTERACTION_TYPE_LABEL[i.interactionType] ?? i.interactionType },
      { key: "round", header: "Round", getValue: (i) => roundName(i.roundId) },
      { key: "subject", header: "Subject", getValue: (i) => i.subject },
      { key: "outcome", header: "Outcome", getValue: (i) => i.outcome },
      { key: "notes", header: "Notes", getValue: (i) => i.notes },
      { key: "nextAction", header: "Next action", getValue: (i) => i.nextAction },
      { key: "nextDue", header: "Next action due", type: "date", getValue: (i) => i.nextActionDue },
      { key: "source", header: "Recorded from", getValue: (i) => INTERACTION_SOURCE_LABEL[i.source] ?? i.source },
    ];
    const outreachColumns: ExportColumn<OutreachDraft>[] = [
      { key: "subject", header: "Subject", getValue: (o) => o.subject },
      { key: "round", header: "Round", getValue: (o) => roundName(o.roundId) },
      { key: "status", header: "Status", getValue: (o) => OUTREACH_STATUS_LABEL[o.status] ?? o.status },
      { key: "origin", header: "Origin", getValue: (o) => OUTREACH_ORIGIN_LABEL[o.origin] ?? o.origin },
      { key: "recipient", header: "Recipient", getValue: (o) => o.recipientEmail },
      { key: "approved", header: "Approved", type: "datetime", getValue: (o) => o.approvedAt },
      { key: "sent", header: "Sent", type: "datetime", getValue: (o) => o.sentAt },
      { key: "failure", header: "Failure reason", getValue: (o) => o.failureReason },
      { key: "updated", header: "Updated", type: "datetime", getValue: (o) => o.updatedAt },
    ];
    const roundColumnsForInvestor: ExportColumn<FundingRound>[] = [
      { key: "round", header: "Round", getValue: (r) => r.name },
      { key: "type", header: "Type", getValue: (r) => ROUND_TYPE_LABEL[r.roundType] ?? r.roundType },
      { key: "status", header: "Status", getValue: (r) => ROUND_STATUS_LABEL[r.status] ?? r.status },
      { key: "target", header: "Target", type: "currency", getValue: (r) => r.targetAmount },
      { key: "currency", header: "Currency", getValue: (r) => r.currency },
      { key: "targetClose", header: "Target close", type: "date", getValue: (r) => r.targetCloseDate },
      { key: "stage", header: "Investor's stage", getValue: (r) => {
        const p = pipeline.find((x) => x.roundId === r.id);
        return p ? (PIPELINE_STAGE_LABEL[p.stage] ?? p.stage) : null;
      } },
    ];

    return {
      module: "discovery",
      resource: "funding-investor",
      title: `Investor: ${investor.name}`,
      metadata: { Investor: investor.name },
      sheets: [
        { sheetName: "Investor", columns: fieldColumns, rows: investorRows(investor, RESEARCH_LABEL[researchState(investor, now)]) },
        { sheetName: "Contacts", columns: contactColumns, rows: contacts },
        { sheetName: "Research", columns: researchColumns, rows: research },
        { sheetName: "Pipeline", columns: pipelineColumns, rows: pipeline },
        { sheetName: "Interactions", columns: interactionColumns, rows: interactions },
        { sheetName: "Outreach", columns: outreachColumns, rows: outreach },
        { sheetName: "Rounds", columns: roundColumnsForInvestor, rows: inRounds },
      ],
    };
  },
};
