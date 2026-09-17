import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getEwayBillCredentialsStatus } from "@cofounderai/module-gst/lib/eway-bill/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { EwayBillForm } from "@cofounderai/module-gst/components/eway-bill/eway-bill-form";
import { saveEwayBillCredentialsAction } from "./actions";

export default async function EwayBillPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [status, canEdit] = await Promise.all([
    getEwayBillCredentialsStatus(businessId),
    hasPermission(businessId, "settings.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">e-Way Bill</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GST Suvidha Provider credentials {business.name} uses to generate e-Way Bills.
        </p>
      </div>

      <EwayBillForm status={status} canEdit={canEdit} action={saveEwayBillCredentialsAction.bind(null, businessId)} />
    </div>
  );
}
