import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { moduleRegistry } from "@cofounderai/module-registry";

const MODULE_NAME = moduleRegistry.find((m) => m.key === "inventory")?.name ?? "Inventory";

/** Generic "Business > Inventory" trail, no "Control Center" crumb and no per-instance
 * business name -- matches fsm's own layout (fsm/layout.tsx) and discovery's product
 * layout (products/[productId]/layout.tsx), both of which use the fixed, generic label
 * "Business" rather than the business's actual name. Previously inconsistent with
 * fsm's own fix (task #60): this file still had the older "Control Center / [business
 * name] / Inventory" trail from before that generic-terms pass, drifted rather than
 * intentionally different. */
export default async function InventoryLayout({
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
