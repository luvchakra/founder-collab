import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { campaignTotals, formatMetric } from "../../lib/marketing/metrics";
import { MARKETING_CHANNEL_LABEL, type CampaignMetricRow, type MarketingCampaign } from "../../lib/marketing/types";
import { CampaignStatusBadge } from "./status";

/**
 * MKT-03 — the dashboard's campaign performance panel (§7). A table on desktop and one
 * card per campaign on a phone (§39: "tables become cards on mobile"). Every figure goes
 * through `campaignTotals`, so an unreported number is "—" here exactly as on the
 * campaign's own page.
 */
export function CampaignPerformance({
  campaigns,
  metrics,
  root,
}: {
  campaigns: MarketingCampaign[];
  metrics: CampaignMetricRow[];
  root: string;
}) {
  const rowsByCampaign = new Map<string, CampaignMetricRow[]>();
  const lastActivity = new Map<string, string>();
  for (const m of metrics) {
    const list = rowsByCampaign.get(m.campaignId) ?? [];
    list.push(m);
    rowsByCampaign.set(m.campaignId, list);
    if ((lastActivity.get(m.campaignId) ?? "") < m.metricDate) lastActivity.set(m.campaignId, m.metricDate);
  }

  const rows = campaigns.map((c) => {
    const t = campaignTotals(rowsByCampaign.get(c.id) ?? []);
    const currency = t.currencies[0] ?? c.currency;
    return { c, t, currency, last: lastActivity.get(c.id) ?? null };
  });

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Offering</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Qualified</TableHead>
              <TableHead className="text-right">Opps</TableHead>
              <TableHead className="text-right">Customers</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ c, t, currency, last }) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-48 truncate font-medium">
                  <Link href={`${root}/campaigns/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="max-w-36 truncate text-muted-foreground">{c.offeringName ?? "—"}</TableCell>
                <TableCell>{MARKETING_CHANNEL_LABEL[c.channel]}</TableCell>
                <TableCell>
                  <CampaignStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMetric(t.spend.value, "money", currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMetric(t.leads.value, "count")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMetric(t.qualifiedLeads.value, "count")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMetric(t.opportunities.value, "count")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMetric(t.customers.value, "count")}</TableCell>
                <TableCell className="text-right tabular-nums" title={t.leadToCustomer.definition}>
                  {formatMetric(t.leadToCustomer.value, "percent")}
                </TableCell>
                <TableCell className="text-muted-foreground">{last ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map(({ c, t, currency }) => (
          <li key={c.id}>
            <Link href={`${root}/campaigns/${c.id}`} className="block rounded-lg border bg-card p-3 hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {MARKETING_CHANNEL_LABEL[c.channel]}
                    {c.offeringName ? ` · ${c.offeringName}` : ""}
                  </p>
                </div>
                <CampaignStatusBadge status={c.status} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Spend</dt>
                  <dd className="font-medium tabular-nums">{formatMetric(t.spend.value, "money", currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Leads</dt>
                  <dd className="font-medium tabular-nums">{formatMetric(t.leads.value, "count")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Customers</dt>
                  <dd className="font-medium tabular-nums">{formatMetric(t.customers.value, "count")}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
