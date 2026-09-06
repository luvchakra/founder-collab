import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspects } from "@cofounderai/module-discovery/lib/prospects/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";

/**
 * A conversion funnel built entirely from data listProspects already returns -- no new
 * query, no new AI call. computeConversionFunnel (lib/prospects/pipeline.ts) exploits
 * deriveProspectPipelineState's reverse-order stage checks: a prospect's `.stage` is
 * always the furthest point it has reached, so "how many prospects reached stage X or
 * further" is a plain index comparison.
 */
export default async function ConversionsPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const prospects = await listProspects(workspace.id);
  const funnel = computeConversionFunnel(prospects);
  const customers = prospects.filter((p) => p.outcome === "won");
  const basePath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-4">
      <ConversionFunnelPanel funnel={funnel} wonCount={customers.length} />

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <h3 className="font-medium">Customers</h3>
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No won deals yet -- mark a conversation &quot;Won&quot; when it closes to add one here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${basePath}/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent"
                >
                  <span className="font-medium">{c.company_name}</span>
                  <span className="text-xs text-muted-foreground">
                    Closed {new Date(c.lastActivityAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
