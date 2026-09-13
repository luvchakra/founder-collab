import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getEinvoiceCredentialsStatus } from "@cofounderai/module-gst/lib/einvoicing/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { EinvoicingForm } from "@cofounderai/module-gst/components/einvoicing/einvoicing-form";
import { saveEinvoiceCredentialsAction } from "./actions";

export default async function EinvoicingPage({
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
    getEinvoiceCredentialsStatus(businessId),
    hasPermission(businessId, "settings.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">e-Invoicing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GST Suvidha Provider credentials {business.name} uses to generate IRNs and QR codes.
        </p>
      </div>

      <EinvoicingForm
        status={status}
        canEdit={canEdit}
        action={saveEinvoiceCredentialsAction.bind(null, businessId)}
      />
    </div>
  );
}
