import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import {
  listCampaignMetrics,
  listCampaigns,
  listContent,
  listOfferingOptions,
} from "@cofounderai/module-discovery/lib/marketing/queries";
import { campaignTotals, marketingFunnel, type Metric } from "@cofounderai/module-discovery/lib/marketing/metrics";
import { marketingAttention } from "@cofounderai/module-discovery/lib/marketing/attention";
import { MARKETING_PERIODS, MARKETING_PERIOD_LABEL, parsePeriod, periodWindow } from "@cofounderai/module-discovery/lib/marketing/period";
import { MetricTile } from "@cofounderai/module-discovery/components/marketing/metric-tile";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { CampaignPerformance } from "@cofounderai/module-discovery/components/marketing/campaign-performance";
import { MarketingFunnel } from "@cofounderai/module-discovery/components/marketing/funnel";
import { AttentionPanel } from "@cofounderai/module-discovery/components/marketing/attention-panel";
import { marketingContext } from "./context";

/**
 * MKT-03 — Marketing dashboard (§7). Every number is computed from the business's own
 * campaign records and metric snapshots within the selected window; a number nobody
 * reported shows as "—" with its definition one tap away, never as a plausible zero.
 */
export default async function MarketingDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canManage } = await marketingContext(businessSlug);
  const period = parsePeriod(sp.period);
  const window = periodWindow(period);
  const offeringId = typeof sp.offering === "string" && sp.offering ? sp.offering : undefined;

  const [campaigns, content, offerings] = await Promise.all([
    listCampaigns(businessId, { offeringId }),
    listContent(businessId),
    listOfferingOptions(businessId),
  ]);
  const metrics = await listCampaignMetrics(
    businessId,
    window,
    campaigns.map((c) => c.id),
  );

  const totals = campaignTotals(metrics);
  const currency = totals.currencies[0] ?? campaigns.find((c) => c.currency)?.currency ?? null;
  const funnel = marketingFunnel(metrics);
  const scopedContent = offeringId ? content.filter((c) => c.offeringId === offeringId) : content;
  const attention = marketingAttention({ campaigns, metrics, content: scopedContent });

  const activeCount: Metric = {
    value: campaigns.filter((c) => c.status === "active").length,
    definition: "Campaigns whose status is Active.",
  };
  const inProgress: Metric = {
    value: scopedContent.filter((c) => ["idea", "draft", "review", "approved", "scheduled"].includes(c.status)).length,
    definition: "Content items not yet published or archived.",
  };
  const published: Metric = {
    value: scopedContent.filter((c) => c.status === "published").length,
    definition: "Content items marked Published by a person.",
  };

  if (campaigns.length === 0 && content.length === 0) {
    return (
      <>
        <PageHeader title="Marketing" description="Plan campaigns and content, and see what they produce." />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <EmptyState icon={Megaphone} message="No campaigns or content yet. Start with a campaign, or draft a first piece of content." />
            {canManage ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`${root}/campaigns/new`}>
                    <Plus className="size-4" aria-hidden="true" /> Create campaign
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`${root}/content/new`}>Create content</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href={`${root}/strategy`}>Write the strategy first</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Marketing"
        description={`${MARKETING_PERIOD_LABEL[period]} · ${window.from} to ${window.to}`}
        actions={
          <>
            <ExportMenu exportId="marketing.dashboard" businessSlug={businessSlug} params={sp} kind="dashboard" />
            {canManage ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${root}/content/new`}>Create content</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`${root}/campaigns/new`}>
                    <Plus className="size-4" aria-hidden="true" /> Create campaign
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <UrlSelect
          name="period"
          label="Period"
          value={period}
          options={MARKETING_PERIODS.map((p) => ({ value: p, label: MARKETING_PERIOD_LABEL[p] }))}
        />
        <UrlSelect
          name="offering"
          label="Offering"
          value={offeringId ?? ""}
          options={[{ value: "", label: "All offerings" }, ...offerings.map((o) => ({ value: o.id, label: o.name }))]}
        />
      </div>

      {totals.currencies.length > 1 ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Results were recorded in more than one currency ({totals.currencies.join(", ")}), so money totals are not added
          together. Filter by offering or open a campaign to see its own figures.
        </p>
      ) : null}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricTile label="Active campaigns" metric={activeCount} />
        <MetricTile label="Leads" metric={totals.leads} />
        <MetricTile label="Qualified prospects" metric={totals.qualifiedLeads} />
        <MetricTile label="Opportunities influenced" metric={totals.opportunities} />
        <MetricTile label="Customers influenced" metric={totals.customers} />
        <MetricTile label="Spend" metric={totals.spend} kind="money" currency={currency} />
        <MetricTile label="Cost per lead" metric={totals.costPerLead} kind="money" currency={currency} />
        <MetricTile label="Lead → customer" metric={totals.leadToCustomer} kind="percent" />
        <MetricTile label="Revenue influenced" metric={totals.revenue} kind="money" currency={currency} />
        <MetricTile label="Content in progress" metric={inProgress} />
        <MetricTile label="Published content" metric={published} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Campaign performance</CardTitle>
            <CardDescription>Figures are what was recorded for each campaign in this period.</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <EmptyState message="No campaigns match this filter." variant="inline" />
            ) : (
              <CampaignPerformance campaigns={campaigns.slice(0, 20)} metrics={metrics} root={root} />
            )}
            {campaigns.length > 20 ? (
              <Link href={`${root}/campaigns`} className="mt-3 inline-block text-sm text-primary hover:underline">
                See all {campaigns.length} campaigns
              </Link>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
              <CardDescription>Counts with the share of the previous stage, where both were reported.</CardDescription>
            </CardHeader>
            <CardContent>
              <MarketingFunnel stages={funnel} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent>
              <AttentionPanel items={attention} root={root} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
