import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { listTaxRegistrationsForRegime } from "@cofounderai/module-gst/lib/tax-registrations/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { RegistrationsList } from "@cofounderai/module-gst/components/registrations/registrations-list";
import {
  createTaxRegistrationAction,
  setGstRegistrationProfileAction,
  setPrimaryTaxRegistrationAction,
  setTaxRegistrationStatusAction,
} from "./actions";

/**
 * COMPLY-P0-04.1 (GSTIN Management) -- the multi-registration screen this table's own
 * migration comment named as this story's job, living alongside (not replacing) the
 * existing single-value "GST Profile" page (`gst/profile`). See
 * `lib/tax-registrations/mutations.ts`'s own docstring for why both pages coexist: this
 * one is the real multi-GSTIN source of truth going forward, and it mirrors its primary
 * registration onto the field `GST Profile` (and every other module reading
 * `core.business_settings.gstin`/`state`) already uses -- no other module needed to
 * change for this page to take effect.
 */
export default async function GstRegistrationsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [registrations, canEdit] = await Promise.all([
    listTaxRegistrationsForRegime(businessId, "IN", "GST"),
    hasPermission(businessId, "settings.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">GST registrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every GSTIN {business.name} holds, one per state of operation. The one marked primary
          is the GSTIN used across sales, purchase and service documents for CGST/SGST vs. IGST
          splitting.
        </p>
      </div>

      <RegistrationsList
        registrations={registrations}
        canEdit={canEdit}
        createAction={createTaxRegistrationAction.bind(null, businessId)}
        setPrimaryAction={setPrimaryTaxRegistrationAction.bind(null, businessId)}
        setStatusAction={setTaxRegistrationStatusAction.bind(null, businessId)}
        setProfileAction={setGstRegistrationProfileAction.bind(null, businessId)}
      />
    </div>
  );
}
