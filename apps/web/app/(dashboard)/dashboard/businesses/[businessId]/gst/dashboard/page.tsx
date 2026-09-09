import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getComplianceDashboard } from "@cofounderai/module-gst/lib/dashboard/queries";
import { ComplianceDashboardView } from "@cofounderai/module-gst/components/dashboard/compliance-dashboard-view";

export default async function ComplianceDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const data = await getComplianceDashboard(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Compliance dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name} -- this month&apos;s GST snapshot.</p>
      </div>

      <ComplianceDashboardView businessId={businessId} data={data} />
    </div>
  );
}
