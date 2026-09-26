import type { Metadata } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { BRAND_TITLE_TEMPLATE } from "@cofounderai/core/brand/identity";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { moduleRegistry } from "@cofounderai/module-registry";

/** BRAND-07: "Service | WonderArk" in the browser tab. Absolute, with the template
 * re-declared: a plain title here would stop the root "%s | WonderArk" template from
 * reaching the pages below. */
export const metadata: Metadata = { title: { absolute: `Service | ${BRAND_NAME}`, template: BRAND_TITLE_TEMPLATE } };

const MODULE_NAME = moduleRegistry.find((m) => m.key === "fsm")?.name ?? "Service";

/** Generic "Business > Service" trail, no "Dashboard" crumb -- matches discovery's own
 * product layout (products/[productId]/layout.tsx), which dropped both the per-instance
 * business name and the Dashboard crumb in favor of a fixed, generic trail. */
export default async function FsmLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Business", href: `/${businessSlug}/business` },
          { label: MODULE_NAME },
        ]}
      />
      {children}
    </div>
  );
}
