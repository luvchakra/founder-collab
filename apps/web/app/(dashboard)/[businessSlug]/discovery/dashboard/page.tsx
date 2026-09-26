import Link from "next/link";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ArrowRight, Globe, Package, Sparkles, Target, TrendingUp, Users } from "lucide-react";
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
import { getBusinessPortfolioData } from "@cofounderai/module-discovery/lib/portfolio/queries";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { OfferingPortfolioTable } from "@cofounderai/module-discovery/components/portfolio/offering-portfolio-table";
import { CrossOfferingAccounts } from "@cofounderai/module-discovery/components/portfolio/cross-offering-accounts";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@cofounderai/core/ui/card";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import type { Product } from "@cofounderai/module-discovery/lib/tenancy/types";

type ActionItem = { key: string; message: string; href: string; actionLabel: string; severity: "warning" | "info" };

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
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const products = await listProducts(business.id);
  const workspaces = await Promise.all(products.map((p) => getWorkspaceForProduct(p.id)));
  const workspaceByProductId = new Map(products.map((p, i) => [p.id, workspaces[i]] as const));
  const workspaceIds = workspaces.filter((w): w is NonNullable<typeof w> => Boolean(w)).map((w) => w.id);

  const [icpFlags, usageByWorkspace, prospects, portfolio] = await Promise.all([
    Promise.all(workspaceIds.map((id) => getIcpProfile(id).then((icp) => [id, Boolean(icp)] as const))),
    getWorkspaceUsageForWorkspaces(workspaceIds),
    listProspectsForWorkspaces(workspaceIds),
    // DISC-OFFER-P1 §7-04 "Multi-Offering Intelligence" -- its own batched reads over
    // this business's own products/workspaces; a no-op ({ offeringRows: [],
    // crossOfferingAccounts: [] }) for a business with zero products yet.
    getBusinessPortfolioData(business.id),
  ]);
  const hasIcpByWorkspace = new Map(icpFlags);

  const usage = Object.values(usageByWorkspace).reduce(
    (sum, u) => ({ runs: sum.runs + u.totalRuns, cost: sum.cost + u.totalCost }),
    { runs: 0, cost: 0 },
  );

  const businessDetailHref = `/${businessSlug}/business`;
  const usageHref = `/${businessSlug}/usage`;
  const funnel = computeConversionFunnel(prospects);
  const wonCount = prospects.filter((p) => p.outcome === "won").length;
  const qualifiedCount = prospects.filter((p) => p.status === "qualified").length;
  const sentCount = funnel.steps.find((s) => s.stage === "sent")?.reached ?? 0;
  const repliedCount = funnel.steps.find((s) => s.stage === "replied")?.reached ?? 0;
  // Only unambiguous when there's exactly one product -- with more than one, "Prospects"/
  // "Reply rate" aggregate across all of them, so there's no single list to send the click
  // to; the Business page (where every product is listed) is the honest fallback there.
  const singleProduct = products.length === 1 ? products[0] : null;
  const prospectsHref = singleProduct
    ? `/${businessSlug}/discovery/offerings/${singleProduct.id}/prospects${prospects.length > 0 ? "" : "/discover"}`
    : businessDetailHref;

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
  const readyProductCount = productRows.filter((r) => r.hasProfile && r.hasIcp).length;

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
      message: "No business offerings yet -- create one to start a GTM workspace.",
      href: businessDetailHref,
      actionLabel: "Create offering",
      severity: "warning",
    });
  }
  for (const row of productRows) {
    const base = `/${businessSlug}/discovery/offerings/${row.product.id}`;
    if (!row.hasProfile) {
      actionItems.push({
        key: `profile-${row.product.id}`,
        message: `${row.product.name} has no offering profile yet.`,
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
          <Breadcrumbs items={[{ label: "Business", href: businessDetailHref }, { label: "Discovery" }]} />
          <div className="flex shrink-0 items-center gap-2">
            {/* No separate "Business" button here -- the breadcrumb's own "Business"
                crumb already links to the same place, so this was a redundant second
                copy of the same link right next to it. */}
            <ExportMenu exportId="discovery.dashboard" businessSlug={businessSlug} kind="dashboard" />
            <Link
              href={`/${businessSlug}/usage`}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              AI usage
            </Link>
          </div>
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Discovery Dashboard</h1>
          <p className="mt-1 text-base text-muted-foreground">{business.name}</p>
          {business.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{business.description}</p>
          ) : null}
          {business.website ? (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              {business.website}
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Offerings"
          value={products.length}
          icon={Package}
          detail={products.length > 0 ? `${readyProductCount} of ${products.length} ready to prospect` : undefined}
          href={businessDetailHref}
        />
        <StatCard
          label="Prospects"
          value={prospects.length}
          icon={Users}
          tone="success"
          detail={
            prospects.length > 0
              ? [qualifiedCount > 0 ? `${qualifiedCount} qualified` : null, wonCount > 0 ? `${wonCount} won` : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              : undefined
          }
          href={prospectsHref}
        />
        <StatCard
          label="Reply rate"
          value={`${funnel.replyRate}%`}
          icon={TrendingUp}
          tone="warning"
          detail={sentCount > 0 ? `${repliedCount} of ${sentCount} sent replied` : undefined}
          href={prospectsHref}
        />
        <StatCard
          label="AI credits (month)"
          icon={Target}
          value={`${creditsUsedPercent(usage.cost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(workspaceIds.length, 1))}%`}
          detail={`${usage.runs} run${usage.runs === 1 ? "" : "s"} used`}
          href={usageHref}
        />
      </div>

      {prospects.length > 0 ? <ConversionFunnelPanel funnel={funnel} wonCount={wonCount} /> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Needs attention</CardTitle>
          <CardDescription>What to do next to move this business&apos;s GTM forward.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {actionItems.length === 0 ? (
            <EmptyState variant="inline" message="Nothing needs your attention right now." />
          ) : (
            actionItems.map((item) => (
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
            ))
          )}
        </CardContent>
      </Card>

      {/* DISC-OFFER-P1 §7-04.2 "Offering Portfolio Dashboard" -- only worth a whole
          section once there's more than one offering to compare; with exactly one, this
          would just repeat the KPI cards above for the same single product. */}
      {products.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Offering portfolio</CardTitle>
            <CardDescription>Hot and new opportunities, and open conversations, per offering.</CardDescription>
          </CardHeader>
          <CardContent>
            <OfferingPortfolioTable basePath={`/${businessSlug}/discovery/offerings`} rows={portfolio.offeringRows} />
          </CardContent>
        </Card>
      ) : null}

      {/* DISC-OFFER-P1 §7-04.1 "Cross-Offering Account View" -- hidden entirely (not an
          empty state) when no company is on file under two or more offerings yet, same
          "nothing to show yet" precedent as the Conversion Funnel panel above. */}
      {portfolio.crossOfferingAccounts.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Accounts across offerings</CardTitle>
            <CardDescription>Companies your discovery pipeline has found under more than one offering.</CardDescription>
          </CardHeader>
          <CardContent>
            <CrossOfferingAccounts basePath={`/${businessSlug}/discovery/offerings`} accounts={portfolio.crossOfferingAccounts} />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
