// EXP-CRM-01 -- CRM Dashboard export: the dashboard's KPI cards as numbers, plus the
// report datasets behind them (Pipeline, Lost Business, Response, Exceptions).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { getCrmDashboardKpis, getPotentialLostBusinessDashboard } from "../lib/dashboard/queries";
import { getResponsePerformance } from "../lib/dashboard/response-performance";
import { listCrossModuleExceptions } from "../lib/exceptions/queries";
import { listStages } from "../lib/opportunities/queries";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { listOpportunitiesForExport, listPotentialLostBusinessQueueForExport } from "./queries";
import {
  exceptionsSheet,
  lostBusinessSheet,
  metricSheet,
  percentToFraction,
  pipelineRows,
  pipelineSheet,
  responseMetricRows,
  type MetricRow,
} from "./sheets";

export const crmDashboardExport: ExportAdapter<Record<string, never>> = {
  id: "crm.dashboard",
  module: "crm",
  // The permission CRM's own catalogue defines for "View CRM dashboards and analytics".
  permissions: ["analytics.view"],
  parseFilters: () => ({}),
  async load(context) {
    const businessId = context.businessId;
    const [atRisk, kpis, exceptions, performance, stages, opportunities, lostBusiness, employees] = await Promise.all([
      getPotentialLostBusinessDashboard(businessId),
      getCrmDashboardKpis(businessId),
      listCrossModuleExceptions(businessId),
      getResponsePerformance(businessId),
      listStages(businessId),
      listOpportunitiesForExport(businessId),
      listPotentialLostBusinessQueueForExport(businessId),
      listEmployeeOptions(businessId),
    ]);

    const atRiskSection = "Potential lost business";
    const pipelineSection = "Pipeline & operations";
    const kpiRows: MetricRow[] = [
      { section: atRiskSection, metric: "Unanswered messages", count: atRisk.unansweredMessages },
      { section: atRiskSection, metric: "Unanswered social questions", count: atRisk.unansweredSocialQuestions },
      { section: atRiskSection, metric: "Reviews requiring action", count: atRisk.unansweredReviewsRequiringAction },
      { section: atRiskSection, metric: "Overdue leads", count: atRisk.overdueLeads },
      { section: atRiskSection, metric: "Stale opportunities", count: atRisk.staleOpportunities, note: "No activity in 14+ days" },
      { section: atRiskSection, metric: "Open high-intent conversations", count: atRisk.openHighIntentConversations },
      { section: atRiskSection, metric: "Open exceptions", count: exceptions.length },
      { section: pipelineSection, metric: "New leads", count: kpis.newLeads },
      { section: pipelineSection, metric: "Open opportunities", count: kpis.openOpportunities },
      { section: pipelineSection, metric: "Pipeline value", amount: kpis.pipelineValue, note: "Open opportunities" },
      { section: pipelineSection, metric: "Won value", amount: kpis.wonValue, note: "All time" },
      { section: pipelineSection, metric: "Open conversations", count: kpis.openConversations },
      { section: pipelineSection, metric: "Unanswered commercial interactions", count: kpis.unansweredCommercialInteractions },
      { section: pipelineSection, metric: "Overdue follow-ups", count: kpis.overdueFollowUps },
      { section: pipelineSection, metric: "Quote follow-ups", count: kpis.quoteFollowUps },
      {
        section: pipelineSection,
        metric: "Response SLA (last 30 days)",
        rate: percentToFraction(kpis.responseSlaPercent),
        note: kpis.responseSlaPercent === null ? "No SLA deadline has passed yet" : null,
      },
    ];

    return {
      module: "crm",
      resource: "dashboard",
      title: "CRM dashboard",
      sheets: [
        metricSheet("KPIs", kpiRows),
        pipelineSheet("Pipeline", pipelineRows(stages, opportunities)),
        lostBusinessSheet("Lost Business", lostBusiness, employees),
        metricSheet("Response", responseMetricRows(performance)),
        exceptionsSheet("Exceptions", exceptions),
      ],
    };
  },
};
