import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  getAccountUsageAndProspects,
  getAccountWorkspaceEntries,
} from "@cofounderai/module-discovery/lib/dashboard/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import {
  buildIndustryBreakdown,
  buildOutcomeBreakdown,
  buildProspectTrend,
  buildStatusBreakdown,
  computeAvgFitScore,
  computeWinRate,
} from "@cofounderai/module-discovery/lib/dashboard/aggregate";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { ProspectTrendChart } from "@cofounderai/module-discovery/components/dashboard/prospect-trend-chart";
import { BreakdownBars } from "@cofounderai/core/ui/breakdown-bars";
import { listLicensesForBusiness } from "@cofounderai/core/licensing/queries";
import type { License } from "@cofounderai/core/licensing/types";
import { ModuleIcon } from "@cofounderai/core/shell/module-icon";
import { moduleRegistry, type ModuleKey } from "@cofounderai/module-registry";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import { formatDate } from "@cofounderai/core/lib/format";
import { AlertTriangle, ArrowRight, Settings2 } from "lucide-react";
import { DownloadPdfButton } from "@/components/dashboard/download-pdf-button";
import { getOpenJobsCount } from "@cofounderai/module-fsm/lib/dashboard/queries";
import { listLowStockAlerts } from "@cofounderai/module-inventory/contract/index";
import { getOpenTicketsCount } from "@cofounderai/module-crm/lib/dashboard/queries";
import { getEinvoicesThisMonthCount } from "@cofounderai/module-gst/lib/dashboard/queries";
import { getGstProfile } from "@cofounderai/module-gst/lib/profile/queries";

/** S-5: the platform dashboard's module-contributed widget row -- one card per licensed
 * non-discovery module (discovery gets its own dedicated KPI section above, unchanged;
 * this row is what "assembled from module-contributed widgets via the registry" adds).
 * Lives here, not in `packages/core`, because rendering it means importing each
 * module's own dashboard query directly -- `apps/web` is the composition root exempt
 * from the module-to-module contract-only restriction, same reasoning
 * `components/gst/gst-document-panel.tsx` (S-2) already established. A module with zero
 * licensed businesses on this account contributes nothing at all -- ADR-10's own
 * degraded mode, not an error or a placeholder card. */
async function computeModuleWidgets(
  businessIds: string[],
): Promise<{ widgets: { key: ModuleKey; label: string; icon: string; value: number; detail: string }[]; licensesByBusiness: License[][] }> {
  if (businessIds.length === 0) return { widgets: [], licensesByBusiness: [] };

  const licensesByBusiness = await Promise.all(businessIds.map((id) => listLicensesForBusiness(id)));
  const licensedBusinessIdsByModule = new Map<string, string[]>();
  licensesByBusiness.forEach((licenses, i) => {
    for (const license of licenses) {
      if (license.status !== "active" && license.status !== "grace") continue;
      const ids = licensedBusinessIdsByModule.get(license.module_key) ?? [];
      ids.push(businessIds[i]!);
      licensedBusinessIdsByModule.set(license.module_key, ids);
    }
  });

  const widgets: { key: ModuleKey; label: string; icon: string; value: number; detail: string }[] = [];

  const fsmIds = licensedBusinessIdsByModule.get("fsm") ?? [];
  if (fsmIds.length > 0) {
    const openJobs = await getOpenJobsCount(fsmIds);
    widgets.push({ key: "fsm", label: "Service", icon: "Wrench", value: openJobs, detail: "open jobs" });
  }

  const inventoryIds = licensedBusinessIdsByModule.get("inventory") ?? [];
  if (inventoryIds.length > 0) {
    const alertCounts = await Promise.all(inventoryIds.map((id) => listLowStockAlerts(id)));
    const lowStock = alertCounts.reduce((sum, r) => sum + (r.ok ? r.data.length : 0), 0);
    widgets.push({ key: "inventory", label: "Inventory", icon: "Package", value: lowStock, detail: "low-stock alerts" });
  }

  const crmIds = licensedBusinessIdsByModule.get("crm") ?? [];
  if (crmIds.length > 0) {
    const openTickets = await getOpenTicketsCount(crmIds);
    widgets.push({ key: "crm", label: "CRM", icon: "Inbox", value: openTickets, detail: "open tickets" });
  }

  const gstIds = licensedBusinessIdsByModule.get("gst") ?? [];
  if (gstIds.length > 0) {
    const einvoices = await getEinvoicesThisMonthCount(gstIds);
    widgets.push({ key: "gst", label: "Compliance", icon: "Receipt", value: einvoices, detail: "e-invoices this month" });
  }

  return { widgets, licensesByBusiness };
}

type AttentionItem = { key: string; message: string; href: string; actionLabel: string; severity: "warning" | "info" };

/**
 * The Executive Dashboard's own "needs attention" list -- pending license cancellations,
 * licenses already in their read-only grace period, and (for any business with GST/
 * Compliance licensed) a GST profile that's never been filled in. Every item links
 * straight to where it's fixed, per the "actionable data... quick links" ask -- this
 * is meant to be a short, scannable to-do list, not a status report.
 */
async function buildAttentionItems(
  businesses: { id: string; name: string }[],
  licensesByBusiness: License[][],
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  businesses.forEach((business, i) => {
    for (const license of licensesByBusiness[i] ?? []) {
      const moduleLabel = moduleRegistry.find((m) => m.key === license.module_key)?.name ?? license.module_key;
      if (license.status === "active" && license.cancel_at) {
        items.push({
          key: `cancel-${license.id}`,
          message: `${moduleLabel} for ${business.name} cancels on ${formatDate(license.cancel_at)}.`,
          href: "/dashboard/settings/licenses",
          actionLabel: "Undo",
          severity: "warning",
        });
      } else if (license.status === "grace") {
        items.push({
          key: `grace-${license.id}`,
          message: `${moduleLabel} for ${business.name} is in its read-only grace period${
            license.grace_ends_at ? ` until ${formatDate(license.grace_ends_at)}` : ""
          }.`,
          href: "/dashboard/settings/licenses",
          actionLabel: "Reactivate",
          severity: "warning",
        });
      }
    }
  });

  const gstBusinessIds = businesses
    .filter((_, i) => (licensesByBusiness[i] ?? []).some((l) => l.module_key === "gst" && (l.status === "active" || l.status === "grace")))
    .map((b) => b.id);
  if (gstBusinessIds.length > 0) {
    const profiles = await Promise.all(gstBusinessIds.map((id) => getGstProfile(id)));
    profiles.forEach((profile, i) => {
      if (profile?.gstin) return;
      const business = businesses.find((b) => b.id === gstBusinessIds[i]);
      if (!business) return;
      items.push({
        key: `gst-profile-${business.id}`,
        message: `${business.name} has Compliance licensed but no GSTIN set.`,
        href: `/dashboard/businesses/${business.id}/gst/profile`,
        actionLabel: "Set up",
        severity: "info",
      });
    });
  }

  return items;
}

function ModuleWidgetCard({ label, icon, value, detail }: { label: string; icon: string; value: number; detail: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <ModuleIcon name={icon} className="size-3.5" />
        {label}
      </div>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; product?: string; industry?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const { business: businessFilter, product: productFilter, industry: industryFilter } = await searchParams;

  // Both cache()-wrapped by accountId -- when the dashboard layout already ran these for
  // this same request (it always does), this reuses that result instead of re-scanning
  // the account.
  const { businesses, allProducts, entries: workspaceEntries } = await getAccountWorkspaceEntries(
    account.id,
  );
  const { usageByWorkspace, countsByWorkspace, prospects } = await getAccountUsageAndProspects(
    account.id,
  );
  const { widgets: moduleWidgets, licensesByBusiness } = await computeModuleWidgets(businesses.map((b) => b.id));
  const attentionItems = await buildAttentionItems(businesses, licensesByBusiness);

  const prospectCounts = Object.values(countsByWorkspace).reduce(
    (sum, c) => ({
      total: sum.total + c.total,
      new: sum.new + c.new,
      qualified: sum.qualified + c.qualified,
      disqualified: sum.disqualified + c.disqualified,
    }),
    { total: 0, new: 0, qualified: 0, disqualified: 0 },
  );
  const usage = Object.values(usageByWorkspace).reduce(
    (sum, u) => ({ runs: sum.runs + u.totalRuns, cost: sum.cost + u.totalCost }),
    { runs: 0, cost: 0 },
  );

  // Slice-and-dice: a product filter is the most specific slice, then business, then
  // every workspace on the account. No query at all here -- just filtering the
  // account's already-fetched prospect list by which workspaces are in the slice.
  const slicedEntries = productFilter
    ? workspaceEntries.filter((e) => e.product.id === productFilter)
    : businessFilter
      ? workspaceEntries.filter((e) => e.business.id === businessFilter)
      : workspaceEntries;
  const slicedWorkspaceIds = new Set(slicedEntries.map((e) => e.workspace.id));
  // Business/product slice first, then industry -- a fourth dice on top of the same
  // in-memory list, no extra query. Industry lives on the prospect, not the
  // product/workspace, so it can only narrow within whatever business/product slice
  // is already selected.
  const businessOrProductSlicedProspects = prospects.filter((p) => slicedWorkspaceIds.has(p.workspace_id));
  const slicedProspects = industryFilter
    ? businessOrProductSlicedProspects.filter((p) => p.industry === industryFilter)
    : businessOrProductSlicedProspects;
  const funnel = computeConversionFunnel(slicedProspects);
  const wonCount = slicedProspects.filter((p) => p.outcome === "won").length;
  const winRate = computeWinRate(slicedProspects);
  const avgFitScore = computeAvgFitScore(slicedProspects);

  const trend = buildProspectTrend(slicedProspects);
  const statusBreakdown = buildStatusBreakdown(slicedProspects);
  const outcomeBreakdown = buildOutcomeBreakdown(slicedProspects);
  const industryBreakdown = buildIndustryBreakdown(slicedProspects);
  // Options for the industry select come from the business/product slice, before the
  // industry filter itself narrows further -- otherwise picking one industry would
  // immediately shrink the dropdown to just itself.
  const industryOptions = [...new Set(businessOrProductSlicedProspects.map((p) => p.industry).filter((v): v is string => Boolean(v)))].sort();

  const productsForFilter = businessFilter
    ? workspaceEntries.filter((e) => e.business.id === businessFilter)
    : workspaceEntries;

  // Per-product performance table + its "take action" button: prospect/won counts for
  // exactly the products in the current business/product slice (industry doesn't slice
  // this table -- a product either has prospects in that industry or it's still the
  // same product to act on).
  const productRows = slicedEntries.map((entry) => {
    const workspaceProspects = prospects.filter((p) => p.workspace_id === entry.workspace.id);
    return {
      entry,
      total: workspaceProspects.length,
      won: workspaceProspects.filter((p) => p.outcome === "won").length,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Executive Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Actionable data and key configuration across every module -- quick links
              to the areas you manage most.
            </p>
          </div>
          <DownloadPdfButton />
        </div>

        {/* Settings/admin shortcuts -- left out of the downloaded PDF (item #18): these
            are navigation, not report content, and a link is meaningless on paper. */}
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings">
              <Settings2 className="size-3.5" aria-hidden="true" />
              Admin &amp; settings
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings/licenses">Licenses</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings/usage">Usage</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings/billing">Billing</Link>
          </Button>
        </div>

        {attentionItems.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                Needs attention
              </CardTitle>
              <CardDescription>
                Pending license cancellations, licenses in their read-only grace
                period, and Compliance-licensed businesses with no GSTIN on file yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {attentionItems.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={item.severity === "warning" ? "destructive" : "outline"} className="shrink-0">
                      {item.severity === "warning" ? "Action needed" : "Setup"}
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
      </section>

      <section>
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Account-wide totals across every business and product, regardless of which
          modules they have licensed.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Businesses" value={businesses.length} />
          <KpiCard label="Products" value={allProducts.length} />
          <KpiCard
            label="Prospects"
            value={prospectCounts.total}
            detail={
              prospectCounts.total > 0
                ? `${prospectCounts.qualified} qualified · ${prospectCounts.new} new`
                : undefined
            }
          />
          <KpiCard
            label="AI credits (month)"
            value={`${creditsUsedPercent(usage.cost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(workspaceEntries.length, 1))}%`}
            detail={`${usage.runs} run${usage.runs === 1 ? "" : "s"} used`}
          />
        </div>
      </section>

      {moduleWidgets.length > 0 ? (
        <section>
          <h2 className="text-xl font-semibold">Modules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One glance at what each licensed module needs from you right now -- open
            jobs, low-stock alerts, open tickets, or e-invoices generated this month.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {moduleWidgets.map((widget) => (
              <ModuleWidgetCard key={widget.key} label={widget.label} icon={widget.icon} value={widget.value} detail={widget.detail} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Conversions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Discovery's outreach-to-customer pipeline -- win rate, fit scores, and
              the funnel from prospect to won customer. Slice by business, product, or
              industry below.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business">Business</Label>
              <NativeSelect id="business" name="business" defaultValue={businessFilter ?? ""}>
                <option value="">All businesses</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product">Product</Label>
              <NativeSelect id="product" name="product" defaultValue={productFilter ?? ""}>
                <option value="">All products</option>
                {productsForFilter.map((e) => (
                  <option key={e.product.id} value={e.product.id}>
                    {e.product.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="industry">Industry</Label>
              <NativeSelect id="industry" name="industry" defaultValue={industryFilter ?? ""}>
                <option value="">All industries</option>
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            {businessFilter || productFilter || industryFilter ? (
              <Button asChild size="sm" variant="ghost">
                <Link href="/dashboard">Clear</Link>
              </Button>
            ) : null}
          </form>
        </div>

        {workspaceEntries.length === 0 ? (
          <p className="text-muted-foreground">
            Use the business switcher in the sidebar to create your first business and
            start building a GTM workspace for a product.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Win rate" value={winRate === null ? "--" : `${winRate}%`} detail="won / (won + lost)" />
              <KpiCard label="Avg. fit score" value={avgFitScore === null ? "--" : avgFitScore} detail="of scored prospects" />
              <KpiCard label="Reply rate" value={`${funnel.replyRate}%`} />
              <KpiCard label="Customers (won)" value={wonCount} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">New prospects (30 days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProspectTrendChart data={trend} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">By status &amp; outcome</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <BreakdownBars items={statusBreakdown} />
                  <div className="border-t border-border pt-3">
                    <BreakdownBars items={outcomeBreakdown} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {industryBreakdown.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top industries</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownBars items={industryBreakdown} />
                </CardContent>
              </Card>
            ) : null}

            <ConversionFunnelPanel funnel={funnel} wonCount={wonCount} />

            {productRows.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Products in this slice</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col divide-y">
                  {productRows.map(({ entry, total, won }) => {
                    const basePath = `/dashboard/businesses/${entry.business.id}/products/${entry.product.id}`;
                    return (
                      <div key={entry.product.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{entry.product.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{entry.business.name}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <span className="text-xs text-muted-foreground">
                            {total} prospect{total === 1 ? "" : "s"}
                            {won > 0 ? ` · ${won} won` : ""}
                          </span>
                          <Button asChild size="sm" variant="outline">
                            <Link href={total > 0 ? `${basePath}/prospects` : `${basePath}/prospects/discover`}>
                              {total > 0 ? "View" : "Discover"}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
