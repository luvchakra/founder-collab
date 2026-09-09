import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { moduleRegistry } from "@cofounderai/module-registry";

const MODULE_NAME = moduleRegistry.find((m) => m.key === "inventory")?.name ?? "Inventory";

/** Gives every inventory route the same "Dashboard / Business / Inventory" trail the
 * UX audit found missing platform-wide (only discovery had one) -- one layout instead
 * of repeating it in each of inventory's 16 leaf pages. Reuses discovery's own
 * Breadcrumbs component rather than the unused vendored shadcn primitive, matching how
 * businesses/[businessId]/page.tsx and products/[productId]/layout.tsx already do it. */
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
          { label: "Dashboard", href: "/dashboard" },
          { label: business.name, href: `/dashboard/businesses/${businessId}` },
          { label: MODULE_NAME },
        ]}
      />
      {children}
    </div>
  );
}
