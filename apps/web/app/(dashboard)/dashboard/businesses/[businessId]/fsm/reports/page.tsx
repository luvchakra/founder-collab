import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import {
  listAccountAgingReport,
  listCustomerBalancesReport,
  listJobsCompletedReport,
  listPaymentsReport,
  listProductivityReport,
  listRevenueByChargeTypeReport,
  listRevenueByMarketingSourceReport,
  listRevenueByServiceReport,
  listRevenueByTagReport,
  listTimecardsReport,
} from "@cofounderai/module-fsm/lib/reports/queries";
import { ReportsView } from "@cofounderai/module-fsm/components/reports/reports-view";
import { DateRangeControl, resolveReportRange, type ReportRangePreset } from "@cofounderai/module-fsm/components/reports/date-range-control";

const VALID_PRESETS = new Set<ReportRangePreset>(["7d", "30d", "90d", "month", "year", "all"]);

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { businessId } = await params;
  const { range: rangeParam } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const activePreset: ReportRangePreset = VALID_PRESETS.has(rangeParam as ReportRangePreset) ? (rangeParam as ReportRangePreset) : "all";
  const range = resolveReportRange(activePreset);

  const [jobsCompleted, revenueByService, revenueByTag, revenueByChargeType, revenueByMarketingSource, customerBalances, aging, payments, timecards, productivity] =
    await Promise.all([
      listJobsCompletedReport(businessId, range),
      listRevenueByServiceReport(businessId, range),
      listRevenueByTagReport(businessId, range),
      listRevenueByChargeTypeReport(businessId, range),
      listRevenueByMarketingSourceReport(businessId, range),
      listCustomerBalancesReport(businessId),
      listAccountAgingReport(businessId),
      listPaymentsReport(businessId, range),
      listTimecardsReport(businessId, range),
      listProductivityReport(businessId, range),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">{business.name}</p>
        </div>
        <DateRangeControl basePath={`/dashboard/businesses/${businessId}/fsm/reports`} active={activePreset} />
      </div>

      <ReportsView
        businessId={businessId}
        jobsCompleted={jobsCompleted}
        revenueByService={revenueByService}
        revenueByTag={revenueByTag}
        revenueByChargeType={revenueByChargeType}
        revenueByMarketingSource={revenueByMarketingSource}
        customerBalances={customerBalances}
        aging={aging}
        payments={payments}
        timecards={timecards}
        productivity={productivity}
        isDefaultRange={activePreset === "all"}
      />
    </div>
  );
}
