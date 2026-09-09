import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { moduleRegistry } from "@cofounderai/module-registry";

const MODULE_NAME = moduleRegistry.find((m) => m.key === "gst")?.name ?? "GST";

/** See inventory/layout.tsx's own doc comment -- same fix, same reasoning, one per
 * module rather than duplicated across gst's 4 leaf pages. */
export default async function GstLayout({
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
