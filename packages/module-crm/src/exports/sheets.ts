import type { ExportSheet } from "@cofounderai/core/exports/types";
import type { ResponsePerformance } from "../lib/dashboard/types";
import type { CrossModuleException } from "../lib/exceptions/types";
import { formatAge } from "../lib/interactions/lost-business";
import type { PotentialLostBusinessQueueEntry } from "../lib/interactions/queries";
import { isHighCommercialIntent, type MessageIntent } from "../lib/interactions/intent-classification";
import type { Opportunity, OpportunityStage } from "../lib/opportunities/types";
import type { EmployeeOption } from "../lib/tickets/types";
import { CHANNEL_LABEL, EXCEPTION_KIND_LABEL, MODULE_LABEL, employeeMap, humanize, labelOf, ownerName } from "./labels";

/**
 * EXP-CRM-01/03/04/05/10 -- sheets more than one CRM export carries (the dashboard
 * workbook repeats the Pipeline, Lost Business, Response and Exceptions datasets its
 * own report pages export), so each dataset is described exactly once.
 */

/** A metric row: exactly one of count / amount / rate / minutes is set; a figure that
 * doesn't exist yet stays blank with the reason in `note` -- never a made-up zero. */
export type MetricRow = {
  section: string;
  metric: string;
  count?: number | null;
  amount?: number | null;
  rate?: number | null;
  minutes?: number | null;
  note?: string | null;
};

export function metricSheet(sheetName: string, rows: MetricRow[]): ExportSheet<MetricRow> {
  return {
    sheetName,
    columns: [
      { key: "section", header: "Section", getValue: (r) => r.section },
      { key: "metric", header: "Metric", getValue: (r) => r.metric },
      { key: "count", header: "Count", type: "integer", getValue: (r) => r.count ?? null },
      { key: "amount", header: "Amount (INR)", type: "currency", currency: "INR", getValue: (r) => r.amount ?? null },
      { key: "rate", header: "Rate", type: "percent", getValue: (r) => r.rate ?? null },
      { key: "minutes", header: "Minutes", type: "number", getValue: (r) => r.minutes ?? null },
      { key: "note", header: "Note", getValue: (r) => r.note ?? "" },
    ],
    rows,
  };
}

/** Whole-number percent (the dashboards' own `slaCompliancePercent`) as a fraction. */
export function percentToFraction(percent: number | null): number | null {
  return percent === null ? null : percent / 100;
}

// ---- Pipeline (EXP-CRM-01, EXP-CRM-03's Kanban dataset) -----------------------------

export type PipelineRow = { stage: string; status: string; currency: string; opportunities: number; value: number | null };

/** One row per stage (in board order) and currency -- the Kanban board's columns as
 * numbers. An opportunity with no estimate is counted but adds nothing to `value`;
 * a stage where nothing is estimated has a blank value, not 0. */
export function pipelineRows(stages: OpportunityStage[], opportunities: Opportunity[]): PipelineRow[] {
  const stageOrder = new Map(stages.map((s, index) => [s.id, index]));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const groups = new Map<string, PipelineRow & { order: number }>();
  for (const o of opportunities) {
    const stage = o.stage_id ? stageById.get(o.stage_id) : undefined;
    const stageName = stage?.name ?? "No stage";
    const key = `${o.stage_id ?? ""}|${o.currency}`;
    const row = groups.get(key) ?? {
      stage: stageName,
      status: stage ? (stage.is_won ? "Won" : stage.is_lost ? "Lost" : "Open") : humanize(o.status),
      currency: o.currency,
      opportunities: 0,
      value: null,
      order: o.stage_id ? (stageOrder.get(o.stage_id) ?? stages.length) : stages.length,
    };
    row.opportunities += 1;
    if (o.estimated_value !== null && o.estimated_value !== undefined) row.value = (row.value ?? 0) + Number(o.estimated_value);
    groups.set(key, row);
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.currency.localeCompare(b.currency))
    .map((row) => ({ stage: row.stage, status: row.status, currency: row.currency, opportunities: row.opportunities, value: row.value }));
}

export function pipelineSheet(sheetName: string, rows: PipelineRow[]): ExportSheet<PipelineRow> {
  return {
    sheetName,
    columns: [
      { key: "stage", header: "Stage", getValue: (r) => r.stage },
      { key: "status", header: "Stage type", getValue: (r) => r.status },
      { key: "opportunities", header: "Opportunities", type: "integer", getValue: (r) => r.opportunities },
      { key: "value", header: "Estimated value", type: "currency", getValue: (r) => r.value },
      { key: "currency", header: "Currency", getValue: (r) => r.currency },
    ],
    rows,
  };
}

// ---- Potential lost business (EXP-CRM-01, EXP-CRM-05) --------------------------------

/**
 * The queue's own columns. Raw message content (`contentExcerpt`) is deliberately not
 * a column: EXP-CRM-05 excludes it by default and no CRM permission opts into it.
 */
export function lostBusinessSheet(
  sheetName: string,
  rows: PotentialLostBusinessQueueEntry[],
  employees: EmployeeOption[],
): ExportSheet<PotentialLostBusinessQueueEntry> {
  const employeeById = employeeMap(employees);
  return {
    sheetName,
    columns: [
      { key: "received", header: "Received", type: "datetime", getValue: (r) => r.occurredAt },
      { key: "age", header: "Age", getValue: (r) => formatAge(r.ageMs) },
      { key: "contact", header: "Contact", getValue: (r) => r.partyName ?? "Unknown contact" },
      { key: "channel", header: "Channel", getValue: (r) => labelOf(CHANNEL_LABEL, r.channel) },
      { key: "intent", header: "Message intent", getValue: (r) => humanize(r.intent) },
      {
        key: "high_intent",
        header: "High commercial intent",
        type: "boolean",
        getValue: (r) => isHighCommercialIntent(r.intent as MessageIntent | null),
      },
      { key: "opportunity_value", header: "Opportunity value", type: "currency", getValue: (r) => r.opportunityValue },
      { key: "opportunity_currency", header: "Currency", getValue: (r) => (r.opportunityValue !== null ? (r.opportunityCurrency ?? "") : "") },
      { key: "owner", header: "Owner", getValue: (r) => ownerName(employeeById, r.ownerId) },
      { key: "sla", header: "SLA", getValue: (r) => (r.overdue ? "Overdue" : "On track") },
      { key: "response_due", header: "Response due", type: "datetime", getValue: (r) => r.responseDueAt },
      { key: "resolution", header: "Resolution state", getValue: () => "Awaiting reply" },
    ],
    rows,
  };
}

// ---- Exceptions (EXP-CRM-01, EXP-CRM-10) ---------------------------------------------

export function exceptionsSheet(sheetName: string, rows: CrossModuleException[]): ExportSheet<CrossModuleException> {
  return {
    sheetName,
    columns: [
      { key: "exception", header: "Exception", getValue: (r) => labelOf(EXCEPTION_KIND_LABEL, r.kind) },
      { key: "module", header: "Module", getValue: (r) => labelOf(MODULE_LABEL, r.module) },
      { key: "subject", header: "Customer / job", getValue: (r) => r.label },
      { key: "detail", header: "Detail", getValue: (r) => r.detail ?? "" },
      { key: "status", header: "Status", getValue: () => "Open" },
      {
        key: "resolution",
        header: "Resolution",
        getValue: (r) =>
          r.kind === "assessment_pending"
            ? r.assessmentRequested
              ? "Assessment requested, awaiting outcome"
              : "Assessment not yet requested"
            : "Awaiting a shortage decision",
      },
    ],
    rows,
  };
}

// ---- Response performance (EXP-CRM-01, EXP-CRM-04) -----------------------------------

export function responseMetricRows(performance: ResponsePerformance): MetricRow[] {
  const noData = "No responded interactions in the last 30 days";
  return [
    {
      section: "Response performance (last 30 days)",
      metric: "Median first response",
      minutes: performance.medianFirstResponseMinutes,
      note: performance.medianFirstResponseMinutes === null ? noData : null,
    },
    {
      section: "Response performance (last 30 days)",
      metric: "SLA compliance",
      rate: percentToFraction(performance.slaCompliancePercent),
      note: performance.slaCompliancePercent === null ? "No SLA deadline has passed yet" : null,
    },
    ...performance.unresolvedByAge.map((bucket) => ({
      section: "Unresolved interactions by age",
      metric: bucket.bucket,
      count: bucket.count,
    })),
  ];
}

export type OwnerPerformanceRow = ResponsePerformance["ownerPerformance"][number];
export type ChannelResponseRow = ResponsePerformance["channelResponseTime"][number];

export function ownerPerformanceSheet(rows: OwnerPerformanceRow[]): ExportSheet<OwnerPerformanceRow> {
  return {
    sheetName: "Owner Performance",
    columns: [
      { key: "owner", header: "Owner", getValue: (r) => r.ownerName },
      { key: "responded", header: "Responded", type: "integer", getValue: (r) => r.responded },
      { key: "median", header: "Median response (minutes)", type: "number", getValue: (r) => r.medianResponseMinutes },
    ],
    rows,
  };
}

export function channelResponseSheet(rows: ChannelResponseRow[]): ExportSheet<ChannelResponseRow> {
  return {
    sheetName: "Channel Response Time",
    columns: [
      { key: "channel", header: "Channel", getValue: (r) => labelOf(CHANNEL_LABEL, r.channel) },
      { key: "median", header: "Median response (minutes)", type: "number", getValue: (r) => r.medianResponseMinutes },
    ],
    rows,
  };
}
