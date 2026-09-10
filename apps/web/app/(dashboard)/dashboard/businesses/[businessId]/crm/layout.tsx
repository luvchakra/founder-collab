import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { moduleRegistry } from "@cofounderai/module-registry";

const MODULE_NAME = moduleRegistry.find((m) => m.key === "crm")?.name ?? "CRM";

/** Item #19 of a UX pass: this had drifted from inventory/layout.tsx's fixed, generic
 * "Business > [module]" trail (no "Control Center" crumb, no per-instance business
 * name) -- same fix, same reasoning, one per module rather than duplicated across
 * crm's 3 leaf pages. */
export default async function CrmLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Business", href: `/dashboard/businesses/${businessId}/business` },
          { label: MODULE_NAME },
        ]}
      />
      {children}
    </div>
  );
}
