import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspects } from "@cofounderai/module-discovery/lib/prospects/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { getHandoffStatusForProspect } from "@cofounderai/module-fsm/contract/index";
import { CreateOpportunityButton } from "./create-opportunity-button";
import { createOpportunityAction } from "./actions";

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

  // Per-customer handoff state (contract call, ADR-10) -- small lists in practice (a
  // business's own won deals), so N calls here reads fine against one extra query each,
  // same reasoning the prospect detail page's own single-customer version already uses.
  const handoffStates = await Promise.all(
    customers.map(async (c) => {
      const status = await getHandoffStatusForProspect(businessId, c.id);
      if (!status.ok && status.error === "MODULE_NOT_LICENSED") {
        return { kind: "not_licensed" as const };
      }
      if (status.ok) {
        return { kind: "exists" as const, opportunityId: status.data.opportunityId, opportunityStatus: status.data.opportunityStatus };
      }
      return { kind: "missing" as const };
    }),
  );

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
            {customers.map((c, i) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <Link href={`${basePath}/${c.id}`} className="flex-1 hover:underline">
                  <span className="font-medium">{c.company_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Closed {new Date(c.lastActivityAt).toLocaleDateString()}
                  </span>
                </Link>
                {c.party_id ? (
                  <CreateOpportunityButton
                    state={handoffStates[i]!}
                    businessId={businessId}
                    createAction={createOpportunityAction.bind(null, businessId, productId, {
                      prospectId: c.id,
                      partyId: c.party_id,
                      companyName: c.company_name,
                      workspaceId: workspace.id,
                    })}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
