import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getDispatcherDashboard } from "@cofounderai/module-fsm/lib/dashboard/queries";
import { DispatcherDashboardView } from "@cofounderai/module-fsm/components/dashboard/dispatcher-dashboard-view";

export default async function FsmDashboardPage({
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

  const range = rangeParam === "week" ? "week" : "today";
  const data = await getDispatcherDashboard(businessId, range);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Service Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name} -- today&apos;s queue, at a glance.</p>
      </div>

      <DispatcherDashboardView businessId={businessId} data={data} range={range} />
    </div>
  );
}
