import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { moduleRegistry } from "@cofounderai/module-registry";

const MODULE_NAME = moduleRegistry.find((m) => m.key === "fsm")?.name ?? "Service";

/** Generic "Business > Service" trail, no "Dashboard" crumb -- matches discovery's own
 * product layout (products/[productId]/layout.tsx), which dropped both the per-instance
 * business name and the Dashboard crumb in favor of a fixed, generic trail. */
export default async function FsmLayout({
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
          { label: "Business", href: `/dashboard/businesses/${businessId}` },
          { label: MODULE_NAME },
        ]}
      />
      {children}
    </div>
  );
}
