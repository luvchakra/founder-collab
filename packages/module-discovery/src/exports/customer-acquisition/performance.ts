// EXP-DISC-11 -- Offering Performance export (/[businessSlug]/discovery/offerings/[productId]/performance).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { computeOfferingPerformanceAnalysis } from "../../lib/performance-analysis/analysis";
import { DISCOVERY_PLAYS_NOTE, type RateBucket } from "../../lib/performance-analysis/types";
import { SIGNAL_TYPE_LABEL } from "../../lib/signals/types";
import { getPerformanceAnalysisRawDataForExport, type PerformanceExportRawData } from "./queries";
import { BASIS, CHANNEL_LABEL, PROSPECT_OUTCOME_LABEL, labelOf, ratio, readProductId, resolveOffering } from "./shared";

// Conversation statuses as the prospect page words them.
const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  awaiting_reply: "Awaiting reply",
  replied: "Needs response",
  closed: "Closed",
};

type AnalysisRow = RateBucket & { question: string; matchedMeans: string };
type ProspectRow = PerformanceExportRawData["prospects"][number];
type SignalRow = PerformanceExportRawData["signals"][number] & { company: string | null; producedConversation: boolean };
type ConversationRow = PerformanceExportRawData["conversations"][number] & { company: string | null; jobTitle: string | null };

/**
 * The performance analysis and every row it was computed from. The analysis is
 * deterministic arithmetic over Discovery's own data (no model call), so each rate is
 * "Calculated", exported as an exact fraction next to the counts it came from. The
 * evidence sheets say what each input is: outcomes are recorded by the founder, fit
 * scores are calculated from ICP match and AI research signals, signals are AI-derived
 * from research. Read through an uncapped copy of the page's own four queries.
 */
export const discoveryPerformanceExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.performance",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const raw = await getPerformanceAnalysisRawDataForExport(workspace.id);
    const analysis = computeOfferingPerformanceAnalysis(raw);

    const section = (question: string, matchedMeans: string, buckets: RateBucket[]): AnalysisRow[] =>
      buckets.map((bucket) => ({ ...bucket, question, matchedMeans }));
    const analysisRows: AnalysisRow[] = [
      ...section("Which signals produce conversations?", "Prospects with a conversation", analysis.signalsProducingConversations),
      ...section("Which industries convert?", "Won", analysis.industryConversionRates),
      ...section("Which locations convert?", "Won", analysis.locationConversionRates),
      ...section("Which buyer roles respond?", "Replied", analysis.buyerRolesThatRespond),
      ...section("Does a higher fit score mean better outcomes?", "Won", analysis.scoreVsOutcome),
      // DISC-OFFER-P1-02.3
      ...section("Which Discovery Plays perform best?", "Opportunities whose account has a conversation", analysis.discoveryPlayPerformance),
    ];

    const companyById = new Map(raw.prospects.map((p) => [p.id, p.company_name] as const));
    const withConversation = new Set(raw.conversations.map((c) => c.prospect_id));
    const jobTitleById = new Map(raw.contacts.map((c) => [c.id, c.job_title] as const));
    const signalRows: SignalRow[] = raw.signals.map((s) => ({
      ...s,
      company: companyById.get(s.prospect_id) ?? null,
      producedConversation: withConversation.has(s.prospect_id),
    }));
    const conversationRows: ConversationRow[] = raw.conversations.map((c) => ({
      ...c,
      company: companyById.get(c.prospect_id) ?? null,
      jobTitle: c.contact_id ? (jobTitleById.get(c.contact_id) ?? null) : null,
    }));

    return {
      module: "discovery",
      resource: "performance",
      title: "Offering performance analysis",
      metadata: { Offering: product.name, "Discovery Plays": DISCOVERY_PLAYS_NOTE },
      sheets: [
        {
          sheetName: "Analysis",
          columns: [
            { key: "question", header: "Question", getValue: (r: AnalysisRow) => r.question },
            { key: "group", header: "Group", getValue: (r: AnalysisRow) => r.label },
            { key: "total", header: "Total", type: "integer", getValue: (r: AnalysisRow) => r.total },
            { key: "matched_means", header: "Counted as success", getValue: (r: AnalysisRow) => r.matchedMeans },
            { key: "matched", header: "Successes", type: "integer", getValue: (r: AnalysisRow) => r.matched },
            { key: "rate", header: "Rate", type: "percent", getValue: (r: AnalysisRow) => ratio(r.matched, r.total) },
            { key: "basis", header: "Basis", getValue: () => BASIS.calculated },
          ],
          rows: analysisRows,
        },
        {
          sheetName: "Prospects",
          columns: [
            { key: "company", header: "Company", getValue: (p: ProspectRow) => p.company_name },
            { key: "industry", header: "Industry", getValue: (p: ProspectRow) => p.industry },
            { key: "location", header: "Location", getValue: (p: ProspectRow) => p.location },
            { key: "fit_score", header: "Fit score", type: "integer", getValue: (p: ProspectRow) => p.fit_score },
            { key: "fit_basis", header: "Fit score basis", getValue: (p: ProspectRow) => (p.fit_score === null ? null : BASIS.fitScore) },
            { key: "outcome", header: "Outcome", getValue: (p: ProspectRow) => labelOf(PROSPECT_OUTCOME_LABEL, p.outcome) },
            { key: "outcome_basis", header: "Outcome basis", getValue: () => BASIS.recorded },
          ],
          rows: raw.prospects,
        },
        {
          sheetName: "Signals",
          columns: [
            { key: "company", header: "Company", getValue: (s: SignalRow) => s.company },
            { key: "type", header: "Signal type", getValue: (s: SignalRow) => labelOf(SIGNAL_TYPE_LABEL, s.signal_type) },
            { key: "signal", header: "Signal", getValue: (s: SignalRow) => s.description },
            { key: "source", header: "Source", getValue: (s: SignalRow) => s.source },
            { key: "observed", header: "Signal date", type: "datetime", getValue: (s: SignalRow) => s.observed_at },
            { key: "conversation", header: "Prospect has a conversation", type: "boolean", getValue: (s: SignalRow) => s.producedConversation },
            { key: "basis", header: "Basis", getValue: () => BASIS.aiDerived },
          ],
          rows: signalRows,
        },
        {
          sheetName: "Conversations",
          columns: [
            { key: "company", header: "Company", getValue: (c: ConversationRow) => c.company },
            { key: "job_title", header: "Contact job title", getValue: (c: ConversationRow) => c.jobTitle },
            { key: "channel", header: "Channel", getValue: (c: ConversationRow) => labelOf(CHANNEL_LABEL, c.channel) },
            { key: "status", header: "Status", getValue: (c: ConversationRow) => labelOf(CONVERSATION_STATUS_LABEL, c.status) },
            { key: "replied", header: "Replied", type: "boolean", getValue: (c: ConversationRow) => c.status === "replied" },
            { key: "basis", header: "Basis", getValue: () => BASIS.recorded },
          ],
          rows: conversationRows,
        },
      ],
    };
  },
};
