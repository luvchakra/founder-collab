import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getEffectiveComplianceProfile } from "@cofounderai/module-gst/lib/compliance/queries";
import { getCountry } from "@cofounderai/module-gst/lib/compliance/countries";
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
 * existing single-value "GST Profile" page (`gst/profile`, India-GST-only). See
 * `lib/tax-registrations/mutations.ts`'s own docstring for why both pages coexist: this
 * one is the real multi-registration source of truth going forward, and (for India/GST
 * specifically) mirrors its primary registration onto the field `GST Profile` (and every
 * other module reading `core.business_settings.gstin`/`state`) already uses.
 *
 * Reads the business's actual Compliance country/regime (`getEffectiveComplianceProfile`)
 * rather than hard-coding India/GST -- `listTaxRegistrationsForRegime` and
 * `createTaxRegistration` were always country-generic (see their own docstrings), the P1
 * country packs (US sales tax, Canada GST/HST, EU VAT) already have real jurisdiction and
 * tax-registration support, but this page never read anything but "IN"/"GST" until now,
 * so a business that switched its Compliance country away from India landed here and saw
 * an empty India-only screen no matter what it had actually registered.
 */
export default async function GstRegistrationsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [profile, canEdit] = await Promise.all([
    getEffectiveComplianceProfile(businessId),
    hasPermission(businessId, "settings.manage"),
  ]);
  const registrations = await listTaxRegistrationsForRegime(businessId, profile.country, profile.regime);
  const regimeName = getCountry(profile.country)?.regimes.find((r) => r.key === profile.regime)?.name ?? profile.regime;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{regimeName} registrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every {regimeName} registration {business.name} holds. The one marked primary is used
          across sales, purchase and service documents for tax splitting/determination.
        </p>
      </div>

      <RegistrationsList
        country={profile.country}
        regime={profile.regime}
        regimeName={regimeName}
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
