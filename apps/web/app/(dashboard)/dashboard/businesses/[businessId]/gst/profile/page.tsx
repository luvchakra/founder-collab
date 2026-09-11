import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getGstProfile } from "@cofounderai/module-gst/lib/profile/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { GstProfileForm } from "@cofounderai/module-gst/components/profile/gst-profile-form";
import { saveGstProfileAction } from "./actions";

export default async function GstProfilePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [profile, canEdit] = await Promise.all([
    getGstProfile(businessId),
    hasPermission(businessId, "settings.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">GST profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {business.name}&apos;s effective GSTIN and state, used to split CGST/SGST vs. IGST on
          sales and purchase documents. If the business holds GSTINs in more than one state,
          manage them all from{" "}
          <a href={`/dashboard/businesses/${businessId}/gst/registrations`} className="underline underline-offset-2">
            GST Registrations
          </a>{" "}
          instead — the one marked primary there keeps this page&apos;s GSTIN/state in sync automatically.
        </p>
      </div>

      <GstProfileForm profile={profile} canEdit={canEdit} action={saveGstProfileAction.bind(null, businessId)} />
    </div>
  );
}
