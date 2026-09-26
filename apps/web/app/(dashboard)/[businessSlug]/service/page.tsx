import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getDispatcherDashboard } from "@cofounderai/module-fsm/lib/dashboard/queries";
import { DispatcherDashboardView } from "@cofounderai/module-fsm/components/dashboard/dispatcher-dashboard-view";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function FsmDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const { range: rangeParam } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const range = rangeParam === "week" ? "week" : "today";
  const data = await getDispatcherDashboard(businessId, range);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Service Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">{business.name} -- today&apos;s queue, at a glance.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="fsm.dashboard" businessSlug={businessSlug} params={{ range: rangeParam }} kind="dashboard" />
        </div>
      </div>

      <DispatcherDashboardView businessId={businessId} data={data} range={range} />
    </div>
  );
}
