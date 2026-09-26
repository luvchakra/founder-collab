// EXP-MKT-02 -- Marketing strategy export (/discovery/marketing/strategy).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listOfferingOptions, listStrategies, pickCurrentStrategy } from "../../lib/marketing/queries";
import { MARKETING_CHANNEL_LABEL, type MarketingStrategy, type StrategyGoal } from "../../lib/marketing/types";
import { idParam } from "./shared";

type Filters = { version?: string };

const GOAL_STATUS_LABEL: Record<StrategyGoal["status"], string> = {
  not_started: "Not started",
  on_track: "On track",
  at_risk: "At risk",
  achieved: "Achieved",
  missed: "Missed",
};
const STRATEGY_STATUS_LABEL: Record<MarketingStrategy["status"], string> = { draft: "Draft", active: "Active", archived: "Archived" };
const ORIGIN_LABEL: Record<MarketingStrategy["origin"], string> = { user: "Written by a person", ai_draft: "AI draft" };

type FieldRow = { section: string; field: string; value: string | string[] | null | undefined };

function strategyFields(s: MarketingStrategy, scope: string): FieldRow[] {
  return [
    { section: "Version", field: "Name", value: s.name },
    { section: "Version", field: "Version", value: `v${s.versionNumber}` },
    { section: "Version", field: "Status", value: STRATEGY_STATUS_LABEL[s.status] ?? s.status },
    { section: "Version", field: "Scope", value: scope },
    { section: "Version", field: "Origin", value: ORIGIN_LABEL[s.origin] ?? s.origin },
    { section: "Positioning", field: "Positioning statement", value: s.positioning.statement },
    { section: "Positioning", field: "Category", value: s.positioning.category },
    { section: "Positioning", field: "Target problem", value: s.positioning.targetProblem },
    { section: "Positioning", field: "Market context", value: s.positioning.marketContext },
    { section: "Value proposition", field: "Headline", value: s.valueProposition.headline },
    { section: "Value proposition", field: "Supporting points", value: s.valueProposition.supportingPoints },
    { section: "Value proposition", field: "Proof points", value: s.valueProposition.proofPoints },
    { section: "Differentiation", field: "Differentiators", value: s.differentiation.differentiators },
    { section: "Differentiation", field: "Competitor statements", value: s.differentiation.competitorStatements },
    { section: "Differentiation", field: "Why us", value: s.differentiation.whyUs },
    { section: "Target markets", field: "Regions", value: s.targetMarkets.regions },
    { section: "Target markets", field: "Industries", value: s.targetMarkets.industries },
    { section: "Target markets", field: "Company segments", value: s.targetMarkets.companySegments },
    { section: "Target markets", field: "Buyer segments", value: s.targetMarkets.buyerSegments },
    { section: "Messaging", field: "Key messages", value: s.messaging.keyMessages },
    {
      section: "Messaging",
      field: "Objections",
      value: (s.messaging.objections ?? []).map((o) => (o.response ? `${o.objection} -> ${o.response}` : o.objection)),
    },
    { section: "Channels", field: "Channels", value: s.channels.map((c) => MARKETING_CHANNEL_LABEL[c] ?? c) },
  ];
}

/**
 * The strategy the page is showing (`?version=`, else the current one by the page's own
 * rule), its goals, and the version history. A version id from the request is only ever
 * looked up among this business's own strategies, exactly as the page does.
 */
export const marketingStrategyExport: ExportAdapter<Filters> = {
  id: "marketing.strategy",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: (params) => ({ version: idParam(params, "version") }),
  describeFilters: (f) => ({ Version: f.version ?? "" }),
  async load(context, filters) {
    const [strategies, offerings] = await Promise.all([listStrategies(context.businessId), listOfferingOptions(context.businessId)]);
    const selected = (filters.version ? strategies.find((s) => s.id === filters.version) : undefined) ?? pickCurrentStrategy(strategies);
    const scopeOf = (id: string | null) => (id ? (offerings.find((o) => o.id === id)?.name ?? "Offering") : "Whole company");

    const fieldColumns: ExportColumn<FieldRow>[] = [
      { key: "section", header: "Section", getValue: (r) => r.section },
      { key: "field", header: "Field", getValue: (r) => r.field },
      { key: "value", header: "Value", getValue: (r) => r.value ?? null },
    ];
    const goalColumns: ExportColumn<StrategyGoal>[] = [
      { key: "goal", header: "Goal", getValue: (g) => g.name },
      { key: "metric", header: "Metric", getValue: (g) => g.metric },
      { key: "target", header: "Target", type: "number", getValue: (g) => g.target },
      { key: "period", header: "Period", getValue: (g) => g.period },
      { key: "status", header: "Status", getValue: (g) => GOAL_STATUS_LABEL[g.status] ?? g.status },
    ];
    const versionColumns: ExportColumn<MarketingStrategy>[] = [
      { key: "version", header: "Version", type: "integer", getValue: (s) => s.versionNumber },
      { key: "name", header: "Name", getValue: (s) => s.name },
      { key: "status", header: "Status", getValue: (s) => STRATEGY_STATUS_LABEL[s.status] ?? s.status },
      { key: "scope", header: "Scope", getValue: (s) => scopeOf(s.offeringId) },
      { key: "origin", header: "Origin", getValue: (s) => ORIGIN_LABEL[s.origin] ?? s.origin },
      { key: "goals", header: "Goals", type: "integer", getValue: (s) => s.goals.length },
      { key: "updated", header: "Updated", type: "datetime", getValue: (s) => s.updatedAt },
    ];

    return {
      module: "discovery",
      resource: "marketing-strategy",
      title: "Marketing strategy",
      metadata: (selected
        ? { Version: `v${selected.versionNumber} · ${selected.name}`, Scope: scopeOf(selected.offeringId) }
        : { Version: "No strategy yet" }) as Record<string, string>,
      sheets: [
        { sheetName: "Strategy", columns: fieldColumns, rows: selected ? strategyFields(selected, scopeOf(selected.offeringId)) : [] },
        { sheetName: "Goals", columns: goalColumns, rows: selected?.goals ?? [] },
        { sheetName: "Versions", columns: versionColumns, rows: strategies },
      ],
    };
  },
};
