import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { listCampaignMetrics, listCampaigns, listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { formatMetric, marketingFunnel } from "@cofounderai/module-discovery/lib/marketing/metrics";
import {
  campaignReport,
  channelReport,
  offeringReport,
  timeSeries,
  type ReportRow,
} from "@cofounderai/module-discovery/lib/marketing/analytics";
import { MARKETING_PERIODS, MARKETING_PERIOD_LABEL, parsePeriod, periodWindow } from "@cofounderai/module-discovery/lib/marketing/period";
import {
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABEL,
  type MarketingChannel,
} from "@cofounderai/module-discovery/lib/marketing/types";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { MarketingFunnel } from "@cofounderai/module-discovery/components/marketing/funnel";
import { marketingContext } from "../context";

const REPORTS = [
  { value: "campaign", label: "By campaign" },
  { value: "channel", label: "By channel" },
  { value: "offering", label: "By offering" },
] as const;

/**
 * MKT-14 — Marketing analytics (§17). Reports group the business's recorded metric
 * snapshots; every figure has the same "reported, or —" rule as the dashboard. ICP and
 * geography breakdowns (§17.2) need attribution data this business does not record yet,
 * so they are not offered rather than shown empty.
 */
export default async function MarketingAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId } = await marketingContext(businessSlug);
  const period = parsePeriod(sp.period);
  const window = periodWindow(period);
  const report = REPORTS.some((r) => r.value === sp.report) ? (sp.report as (typeof REPORTS)[number]["value"]) : "campaign";
  const grain = sp.grain === "day" || sp.grain === "month" ? sp.grain : "week";
  const channel = (MARKETING_CHANNELS as readonly string[]).includes(String(sp.channel)) ? (sp.channel as MarketingChannel) : "all";
  const offeringId = typeof sp.offering === "string" && sp.offering ? sp.offering : undefined;

  const [campaigns, offerings] = await Promise.all([
    listCampaigns(businessId, { status: "all", channel, offeringId }),
    listOfferingOptions(businessId),
  ]);
  const metrics = await listCampaignMetrics(businessId, window, campaigns.map((c) => c.id));

  const rows: ReportRow[] =
    report === "channel"
      ? channelReport(campaigns, metrics, (c) => MARKETING_CHANNEL_LABEL[c])
      : report === "offering"
        ? offeringReport(campaigns, metrics)
        : campaignReport(campaigns, metrics);
  const series = timeSeries(metrics, grain);

  return (
    <>
      <PageHeader
        title="Marketing analytics"
        description={`${MARKETING_PERIOD_LABEL[period]} · ${window.from} to ${window.to} · ${metrics.length} recorded snapshot${metrics.length === 1 ? "" : "s"}`}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <UrlSelect name="period" label="Period" value={period} options={MARKETING_PERIODS.map((p) => ({ value: p, label: MARKETING_PERIOD_LABEL[p] }))} />
        <UrlSelect name="report" label="Report" value={report} options={REPORTS.map((r) => ({ value: r.value, label: r.label }))} />
        <UrlSelect
          name="channel"
          label="Channel"
          value={channel}
          options={[{ value: "all", label: "All channels" }, ...MARKETING_CHANNELS.map((c) => ({ value: c, label: MARKETING_CHANNEL_LABEL[c] }))]}
        />
        <UrlSelect
          name="offering"
          label="Offering"
          value={offeringId ?? ""}
          options={[{ value: "", label: "All offerings" }, ...offerings.map((o) => ({ value: o.id, label: o.name }))]}
        />
        <UrlSelect
          name="grain"
          label="Time series"
          value={grain}
          options={[
            { value: "day", label: "Daily" },
            { value: "week", label: "Weekly" },
            { value: "month", label: "Monthly" },
          ]}
        />
      </div>

      {metrics.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState message="No results have been recorded for these campaigns in this period. Record numbers from a campaign's page." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <MarketingFunnel stages={marketingFunnel(metrics)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Over time</CardTitle>
                <CardDescription>Reported counts per {grain}. Blank means nothing was reported.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{grain === "day" ? "Day" : grain === "week" ? "Week of" : "Month"}</TableHead>
                      <TableHead className="text-right">Traffic</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Qualified</TableHead>
                      <TableHead className="text-right">Opps</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {series.map((p) => (
                      <TableRow key={p.bucket}>
                        <TableCell>{grain === "month" ? p.bucket.slice(0, 7) : p.bucket}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(p.sessions, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(p.leads, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(p.qualifiedLeads, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(p.opportunities, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(p.customers, "count")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{REPORTS.find((r) => r.value === report)?.label}</CardTitle>
              <CardDescription>
                Cost figures divide reported spend by the reported count, and are blank when either is missing or the
                snapshots use more than one currency.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{report === "campaign" ? "Campaign" : report === "channel" ? "Channel" : "Offering"}</TableHead>
                    {report !== "campaign" ? <TableHead className="text-right">Campaigns</TableHead> : null}
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Qualified</TableHead>
                    <TableHead className="text-right">Opps</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="text-right">Cost / qualified</TableHead>
                    <TableHead className="text-right">Cost / opp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const t = r.totals;
                    const cur = t.currencies[0] ?? null;
                    return (
                      <TableRow key={r.key}>
                        <TableCell className="max-w-48 truncate font-medium">{r.label}</TableCell>
                        {report !== "campaign" ? <TableCell className="text-right tabular-nums">{r.campaignCount}</TableCell> : null}
                        <TableCell className="text-right tabular-nums">{formatMetric(t.spend.value, "money", cur)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.impressions.value, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.clicks.value, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.leads.value, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.qualifiedLeads.value, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.opportunities.value, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.customers.value, "count")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.revenue.value, "money", cur)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.costPerLead.value, "money", cur)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.costPerQualifiedLead.value, "money", cur)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMetric(t.costPerOpportunity.value, "money", cur)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
