import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { getEffectiveComplianceProfile } from "@cofounderai/module-gst/lib/compliance/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { CountryBar } from "@cofounderai/module-gst/components/compliance/country-bar";
import { moduleRegistry } from "@cofounderai/module-registry";
import { setComplianceCountryAction, setComplianceRegimeAction } from "./actions";

const MODULE_NAME = moduleRegistry.find((m) => m.key === "gst")?.name ?? "Compliance";

/** Item #19 of a UX pass: this had drifted from inventory/layout.tsx's fixed, generic
 * "Business > [module]" trail (no "Control Center" crumb, no per-instance business
 * name) -- same fix, same reasoning, one per module rather than duplicated across
 * gst's 4 leaf pages. */
export default async function GstLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const [business, profile, canEdit] = await Promise.all([
    getBusiness(businessId),
    getEffectiveComplianceProfile(businessId),
    hasPermission(businessId, "settings.manage"),
  ]);
  if (!business) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Business", href: `/dashboard/businesses/${businessId}/business` },
          { label: MODULE_NAME },
        ]}
      />
      <CountryBar
        profile={profile}
        canEdit={canEdit}
        countryAction={setComplianceCountryAction.bind(null, businessId)}
        regimeAction={setComplianceRegimeAction.bind(null, businessId)}
      />
      {children}
    </div>
  );
}
