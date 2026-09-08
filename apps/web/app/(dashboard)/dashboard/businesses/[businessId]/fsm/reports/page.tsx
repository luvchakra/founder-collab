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

export default async function ReportsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [jobsCompleted, revenueByService, revenueByTag, revenueByChargeType, revenueByMarketingSource, customerBalances, aging, payments, timecards, productivity] =
    await Promise.all([
      listJobsCompletedReport(businessId),
      listRevenueByServiceReport(businessId),
      listRevenueByTagReport(businessId),
      listRevenueByChargeTypeReport(businessId),
      listRevenueByMarketingSourceReport(businessId),
      listCustomerBalancesReport(businessId),
      listAccountAgingReport(businessId),
      listPaymentsReport(businessId),
      listTimecardsReport(businessId),
      listProductivityReport(businessId),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}</p>
      </div>

      <ReportsView
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
      />
    </div>
  );
}
