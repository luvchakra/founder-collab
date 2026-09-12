import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getComplianceDashboard } from "@cofounderai/module-gst/lib/dashboard/queries";
import { getRiskDashboard } from "@cofounderai/module-gst/lib/risk/queries";
import { getFilingCalendar } from "@cofounderai/module-gst/lib/calendar/queries";
import { ComplianceDashboardView } from "@cofounderai/module-gst/components/dashboard/compliance-dashboard-view";
import { RiskSignalsList } from "@cofounderai/module-gst/components/risk/risk-signals-list";
import { UpcomingFilingsList } from "@cofounderai/module-gst/components/calendar/upcoming-filings-list";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";

/**
 * COMPLY-P0-11.1 (Overview Dashboard): extends the existing month-snapshot dashboard
 * (built in an earlier slice, S-2/Epic 6) with the two cross-epic views this whole
 * backlog's own Epic 09/10 work exists to surface -- real compliance risk (COMPLY-P0-09.5)
 * and the real upcoming filing calendar (COMPLY-P0-09.1) -- rather than a second,
 * competing dashboard page. Both sections reuse `RiskSignalsList`/`UpcomingFilingsList`,
 * each a responsive table-on-desktop/cards-on-mobile component with real row-level
 * actions (COMPLY-P0-11.2/11.3/11.4) and a status hierarchy that never relies on color
 * alone (COMPLY-P0-11.5).
 */
export default async function ComplianceDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const asOf = new Date().toISOString().slice(0, 10);
  const [data, riskDashboard, filingCalendar] = await Promise.all([
    getComplianceDashboard(businessId),
    getRiskDashboard(businessId, asOf),
    getFilingCalendar(businessId, { monthsBack: 1, monthsForward: 2, quartersBack: 0, quartersForward: 1 }),
  ]);

  const upcomingFilings = [...filingCalendar].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Compliance dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name} -- this month&apos;s GST snapshot.</p>
      </div>

      <ComplianceDashboardView businessId={businessId} data={data} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-base">Compliance risk</CardTitle>
          {riskDashboard.signals.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {riskDashboard.counts.high} high · {riskDashboard.counts.medium} medium · {riskDashboard.counts.low} low
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          <RiskSignalsList businessId={businessId} signals={riskDashboard.signals} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upcoming filings</CardTitle>
        </CardHeader>
        <CardContent>
          <UpcomingFilingsList businessId={businessId} obligations={upcomingFilings} asOf={asOf} />
        </CardContent>
      </Card>
    </div>
  );
}
