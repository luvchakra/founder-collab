import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getDispatcherDashboard } from "@cofounderai/module-fsm/lib/dashboard/queries";
import { DispatcherDashboardView } from "@cofounderai/module-fsm/components/dashboard/dispatcher-dashboard-view";

export default async function FsmDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const data = await getDispatcherDashboard(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dispatcher dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name} -- today&apos;s queue, at a glance.</p>
      </div>

      <DispatcherDashboardView businessId={businessId} data={data} />
    </div>
  );
}
