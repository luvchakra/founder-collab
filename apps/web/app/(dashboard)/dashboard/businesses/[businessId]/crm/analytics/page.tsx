import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { getResponsePerformance } from "@cofounderai/module-crm/lib/dashboard/response-performance";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { BarChart3 } from "lucide-react";

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "--";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/**
 * CRM-14.3's "Response Performance" -- this module's first Analytics page, added as its
 * own nav item rather than folded into the existing Dashboard (that page is already two
 * sections deep after CRM-14.1; a growing set of full reports belongs on its own page,
 * same reasoning FSM's own Reports page exists separately from its Dashboard). CRM-14.4/
 * 14.5/14.6 add further sections here as their own stories build them, same "grow one
 * page over several stories" pattern CRM-14.1 used for the Dashboard page.
 */
export default async function CrmAnalyticsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const performance = await getResponsePerformance(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s response performance, last 30 days.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-md border p-4">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Median first response</span>
          <span className="text-2xl font-semibold">{formatMinutes(performance.medianFirstResponseMinutes)}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-md border p-4">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">SLA compliance</span>
          <span className="text-2xl font-semibold">{performance.slaCompliancePercent === null ? "--" : `${performance.slaCompliancePercent}%`}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Unresolved interactions by age</CardTitle>
        </CardHeader>
        <CardContent>
          {performance.unresolvedByAge.every((b) => b.count === 0) ? (
            <EmptyState icon={BarChart3} message="No unresolved interactions." />
          ) : (
            <div className="flex flex-col divide-y">
              {performance.unresolvedByAge.map((b) => (
                <div key={b.bucket} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">{b.bucket}</span>
                  <span className="font-medium">{b.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Channel response time</CardTitle>
        </CardHeader>
        <CardContent>
          {performance.channelResponseTime.length === 0 ? (
            <EmptyState icon={BarChart3} message="No responded interactions in the last 30 days." />
          ) : (
            <div className="flex flex-col divide-y">
              {performance.channelResponseTime.map((c) => (
                <div key={c.channel} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="capitalize text-muted-foreground">{c.channel}</span>
                  <span className="font-medium">{formatMinutes(c.medianResponseMinutes)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Owner / team performance</CardTitle>
        </CardHeader>
        <CardContent>
          {performance.ownerPerformance.length === 0 ? (
            <EmptyState icon={BarChart3} message="No responded interactions in the last 30 days." />
          ) : (
            <div className="flex flex-col divide-y">
              {performance.ownerPerformance.map((o) => (
                <div key={o.ownerId ?? "unassigned"} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">{o.ownerName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{o.responded} responded</span>
                    <span className="font-medium">{formatMinutes(o.medianResponseMinutes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
