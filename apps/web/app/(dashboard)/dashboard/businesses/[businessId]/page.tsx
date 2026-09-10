import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, Globe, Sparkles } from "lucide-react";
import {
  getBusiness,
  getWorkspaceForProduct,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { listProspectsForWorkspaces } from "@cofounderai/module-discovery/lib/prospects/queries";
import { getWorkspaceUsageForWorkspaces } from "@cofounderai/module-discovery/lib/usage/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import type { Product } from "@cofounderai/module-discovery/lib/tenancy/types";

type ActionItem = { key: string; message: string; href: string; actionLabel: string; severity: "warning" | "info" };

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

/**
 * The Discovery sidebar's "Dashboard" link (packages/core/src/components/shell/
 * app-sidebar.tsx) -- this used to be the business's own editable profile + product
 * list (now moved to ./business/page.tsx, reachable from the sidebar's new "Business"
 * link). This is what a founder actually wants when they click "Dashboard": this one
 * business's key GTM numbers and what to do next, not a form to edit its name.
 */
export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const products = await listProducts(business.id);
  const workspaces = await Promise.all(products.map((p) => getWorkspaceForProduct(p.id)));
  const workspaceByProductId = new Map(products.map((p, i) => [p.id, workspaces[i]] as const));
  const workspaceIds = workspaces.filter((w): w is NonNullable<typeof w> => Boolean(w)).map((w) => w.id);

  const [icpFlags, usageByWorkspace, prospects] = await Promise.all([
    Promise.all(workspaceIds.map((id) => getIcpProfile(id).then((icp) => [id, Boolean(icp)] as const))),
    getWorkspaceUsageForWorkspaces(workspaceIds),
    listProspectsForWorkspaces(workspaceIds),
  ]);
  const hasIcpByWorkspace = new Map(icpFlags);

  const usage = Object.values(usageByWorkspace).reduce(
    (sum, u) => ({ runs: sum.runs + u.totalRuns, cost: sum.cost + u.totalCost }),
    { runs: 0, cost: 0 },
  );

  const businessDetailHref = `/dashboard/businesses/${business.id}/business`;
  const funnel = computeConversionFunnel(prospects);
  const wonCount = prospects.filter((p) => p.outcome === "won").length;

  type ProductRow = { product: Product; hasProfile: boolean; hasIcp: boolean; prospectCount: number; wonCount: number };
  const productRows: ProductRow[] = products.map((product) => {
    const workspace = workspaceByProductId.get(product.id);
    const workspaceProspects = workspace ? prospects.filter((p) => p.workspace_id === workspace.id) : [];
    return {
      product,
      hasProfile: Boolean(product.product_profile),
      hasIcp: workspace ? (hasIcpByWorkspace.get(workspace.id) ?? false) : false,
      prospectCount: workspaceProspects.length,
      wonCount: workspaceProspects.filter((p) => p.outcome === "won").length,
    };
  });

  // "What to do next", one item per product at whatever stage it's stuck on -- ranked
  // by severity (no website/no products first, since nothing else can happen until
  // those are fixed) rather than every possible gap at once.
  const actionItems: ActionItem[] = [];
  if (!business.website) {
    actionItems.push({
      key: "website",
      message: "This business has no website set -- add one to unlock AI auto-populate.",
      href: businessDetailHref,
      actionLabel: "Add website",
      severity: "warning",
    });
  }
  if (products.length === 0) {
    actionItems.push({
      key: "no-products",
      message: "No products yet -- create one to start a GTM workspace.",
      href: businessDetailHref,
      actionLabel: "Create product",
      severity: "warning",
    });
  }
  for (const row of productRows) {
    const base = `/dashboard/businesses/${business.id}/products/${row.product.id}`;
    if (!row.hasProfile) {
      actionItems.push({
        key: `profile-${row.product.id}`,
        message: `${row.product.name} has no product profile yet.`,
        href: base,
        actionLabel: "Generate profile",
        severity: "info",
      });
    } else if (!row.hasIcp) {
      actionItems.push({
        key: `icp-${row.product.id}`,
        message: `${row.product.name}'s ideal customer profile isn't defined yet.`,
        href: `${base}/icp`,
        actionLabel: "Define ICP",
        severity: "info",
      });
    } else if (row.prospectCount === 0) {
      actionItems.push({
        key: `prospects-${row.product.id}`,
        message: `${row.product.name} has an ICP defined but no prospects yet.`,
        href: `${base}/prospects/discover`,
        actionLabel: "Discover prospects",
        severity: "info",
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Breadcrumbs items={[{ label: "Dashboard" }]} />
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={businessDetailHref}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Building2 className="size-3.5" aria-hidden="true" />
              Business
            </Link>
            <Link
              href={`/dashboard/businesses/${business.id}/usage`}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              AI usage
            </Link>
          </div>
        </div>
        <div>
          <h1 className="text-xl font-semibold">{business.name}</h1>
          {business.website ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              {business.website}
            </p>
          ) : null}
        </div>
      </div>

      {actionItems.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Needs attention</CardTitle>
            <CardDescription>What to do next to move this business&apos;s GTM forward.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {actionItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={item.severity === "warning" ? "destructive" : "outline"} className="shrink-0">
                    {item.severity === "warning" ? "Action needed" : "Suggested"}
                  </Badge>
                  <span className="min-w-0 truncate">{item.message}</span>
                </div>
                <Link href={item.href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {item.actionLabel}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Products" value={products.length} />
        <KpiCard label="Prospects" value={prospects.length} detail={wonCount > 0 ? `${wonCount} won` : undefined} />
        <KpiCard label="Reply rate" value={`${funnel.replyRate}%`} />
        <KpiCard
          label="AI credits (month)"
          value={`${creditsUsedPercent(usage.cost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(workspaceIds.length, 1))}%`}
          detail={`${usage.runs} run${usage.runs === 1 ? "" : "s"} used`}
        />
      </div>

      {productRows.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Products</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {productRows.map(({ product, prospectCount, wonCount: productWon }) => {
              const base = `/dashboard/businesses/${business.id}/products/${product.id}`;
              return (
                <div key={product.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <p className="min-w-0 truncate font-medium">{product.name}</p>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {prospectCount} prospect{prospectCount === 1 ? "" : "s"}
                      {productWon > 0 ? ` · ${productWon} won` : ""}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={prospectCount > 0 ? `${base}/prospects` : `${base}/prospects/discover`}>
                        {prospectCount > 0 ? "View" : "Discover"}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {prospects.length > 0 ? <ConversionFunnelPanel funnel={funnel} wonCount={wonCount} /> : null}
    </main>
  );
}
