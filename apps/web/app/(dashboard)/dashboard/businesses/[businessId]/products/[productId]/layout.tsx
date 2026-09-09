import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  getBusiness,
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import { ProductNav } from "@cofounderai/module-discovery/components/tenancy/product-nav";
import { EditableName } from "@cofounderai/module-discovery/components/tenancy/editable-name";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { renameProductAction } from "./actions";

export default async function ProductLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  // Independent lookups (neither depends on the other's result) -- fetched in parallel
  // rather than as two sequential round trips, same pattern as the dashboard layout.
  const [product, business] = await Promise.all([getProduct(productId), getBusiness(businessId)]);
  if (!product || product.business_id !== businessId) notFound();
  if (!business) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  const [icp, prospectCounts] = workspace
    ? await Promise.all([getIcpProfile(workspace.id), getProspectCounts(workspace.id)])
    : [null, null];

  const basePath = `/dashboard/businesses/${businessId}/products/${productId}`;
  const completed = {
    overview: Boolean(product.product_profile),
    icp: Boolean(icp),
    prospects: Boolean(prospectCounts && prospectCounts.total > 0),
  };

  return (
    // max-w-6xl (not the old max-w-2xl): the prospects table and prospect detail page's
    // conversation threads under this layout need real width to read comfortably --
    // 2xl (672px) made every row/thread cramped. Wider also just gives the shorter
    // ICP/conversions/usage pages more breathing room, not a regression for them.
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Business", href: `/dashboard/businesses/${businessId}` },
          { label: "Product" },
        ]}
      />
      <EditableName
        name={product.name}
        action={renameProductAction.bind(null, businessId, productId)}
        headingClassName="text-xl font-semibold"
      />
      <ProductNav basePath={basePath} completed={completed} />
      {children}
    </main>
  );
}
