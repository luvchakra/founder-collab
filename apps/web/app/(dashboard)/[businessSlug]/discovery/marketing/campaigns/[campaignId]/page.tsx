import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import {
  getCampaign,
  listAssets,
  listCampaignMetrics,
  listContent,
  listAttributionCandidates,
  listAttributions,
  listEntityActivity,
} from "@cofounderai/module-discovery/lib/marketing/queries";
import { campaignPacing, campaignTotals, formatMetric } from "@cofounderai/module-discovery/lib/marketing/metrics";
import { allowedCampaignTransitions } from "@cofounderai/module-discovery/lib/marketing/lifecycle";
import {
  CAMPAIGN_OBJECTIVE_LABEL,
  MARKETING_CHANNEL_LABEL,
  type CampaignStatus,
} from "@cofounderai/module-discovery/lib/marketing/types";
import { MetricTile } from "@cofounderai/module-discovery/components/marketing/metric-tile";
import { CampaignStatusBadge, ContentStatusBadge } from "@cofounderai/module-discovery/components/marketing/status";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { MetricFields } from "@cofounderai/module-discovery/components/marketing/metric-fields";
import { ActivityTimeline } from "@cofounderai/module-discovery/components/marketing/activity-timeline";
import {
  deleteAttributionAction,
  duplicateCampaignAction,
  importMetricsAction,
  recordAttributionAction,
  recordMetricAction,
  transitionCampaignAction,
} from "../../actions";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { marketingContext } from "../../context";

const TRANSITION_LABEL: Record<CampaignStatus, string> = {
  draft: "Back to draft",
  planned: "Mark planned",
  active: "Activate",
  paused: "Pause",
  completed: "Complete",
  archived: "Archive",
};

/** MKT-05/06 — one campaign: plan, pacing, recorded results, linked content and assets,
 * status actions and its audit trail (§9.4). */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ businessSlug: string; campaignId: string }>;
}) {
  const { businessSlug, campaignId } = await params;
  const { businessId, root, canManage } = await marketingContext(businessSlug);
  const campaign = await getCampaign(businessId, campaignId);
  if (!campaign) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const from = (campaign.startAt ?? campaign.createdAt).slice(0, 10);
  const [metrics, content, assets, activity, attributions, candidates] = await Promise.all([
    listCampaignMetrics(businessId, { from: from < today ? from : today, to: today }, [campaign.id]),
    listContent(businessId, { campaignId: campaign.id }),
    listAssets(businessId),
    listEntityActivity(businessId, "marketing_campaign", campaign.id),
    listAttributions(businessId, campaign.id),
    canManage ? listAttributionCandidates(businessId, campaign.offeringId) : Promise.resolve(null),
  ]);
  const totals = campaignTotals(metrics);
  const currency = totals.currencies[0] ?? campaign.currency;
  const campaignAssets = assets.filter((a) => a.campaignId === campaign.id);

  const pace = campaignPacing(campaign, totals, new Date());
  const pacing = pace
    ? `${formatMetric(pace.spendShare, "percent")} of budget used, ${formatMetric(pace.timeShare, "percent")} of the run elapsed (${pace.plannedDays} days planned).`
    : null;

  const targets = allowedCampaignTransitions(campaign.status);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {campaign.name} <CampaignStatusBadge status={campaign.status} />
          </span>
        }
        description={`${CAMPAIGN_OBJECTIVE_LABEL[campaign.objective]} · ${MARKETING_CHANNEL_LABEL[campaign.channel]}${campaign.offeringName ? ` · ${campaign.offeringName}` : " · Company-wide"}`}
        breadcrumbs={[{ label: "Campaigns", href: `${root}/campaigns` }, { label: campaign.name }]}
        actions={
          canManage ? (
            <>
              {campaign.status !== "archived" ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`${root}/campaigns/${campaign.id}/edit`}>Edit</Link>
                </Button>
              ) : null}
              <ActionForm action={duplicateCampaignAction.bind(null, businessId, campaign.id)} inline submitLabel="Duplicate" variant="outline" />
            </>
          ) : null
        }
      />

      {canManage && targets.length > 0 ? (
        <TransitionButtons
          action={transitionCampaignAction.bind(null, businessId, campaign.id)}
          targets={targets}
          labels={{ ...TRANSITION_LABEL, active: campaign.status === "paused" ? "Resume" : "Activate" }}
          destructive={["archived"]}
          confirmFor={{ archived: "Archive this campaign? It stays in reports but can no longer change status." }}
        />
      ) : null}

      <section aria-label="Results" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile label="Spend" metric={totals.spend} kind="money" currency={currency} />
        <MetricTile label="Leads" metric={totals.leads} />
        <MetricTile label="Qualified" metric={totals.qualifiedLeads} />
        <MetricTile label="Opportunities" metric={totals.opportunities} />
        <MetricTile label="Customers" metric={totals.customers} />
        <MetricTile label="Cost per lead" metric={totals.costPerLead} kind="money" currency={currency} />
        <MetricTile label="Cost per qualified lead" metric={totals.costPerQualifiedLead} kind="money" currency={currency} />
        <MetricTile label="Cost per opportunity" metric={totals.costPerOpportunity} kind="money" currency={currency} />
        <MetricTile label="Lead → customer" metric={totals.leadToCustomer} kind="percent" />
        <MetricTile label="Revenue" metric={totals.revenue} kind="money" currency={currency} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Detail label="Dates" value={campaign.startAt ? `${campaign.startAt.slice(0, 10)} → ${campaign.endAt?.slice(0, 10) ?? "open"}` : "Not set"} />
                <Detail label="Budget" value={campaign.budget !== null ? formatMetric(campaign.budget, "money", campaign.currency) : "No budget"} />
                <Detail label="Pacing" value={pacing ?? "Needs a budget, dates and reported spend"} />
                <Detail label="Call to action" value={campaign.cta ?? "—"} />
                <Detail
                  label="Landing page"
                  value={
                    campaign.landingPageUrl ? (
                      <a href={campaign.landingPageUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                        {campaign.landingPageUrl}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Detail
                  label="Tracking"
                  value={Object.keys(campaign.utm).length > 0 ? Object.entries(campaign.utm).map(([k, v]) => `utm_${k}=${v}`).join(" · ") : "—"}
                />
                {campaign.message ? <Detail label="Message" value={campaign.message} wide /> : null}
                {campaign.description ? <Detail label="Description" value={campaign.description} wide /> : null}
                {campaign.notes ? <Detail label="Notes" value={campaign.notes} wide /> : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recorded results</CardTitle>
              <CardDescription>One row per day and source. Blank cells were not reported.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {metrics.length === 0 ? (
                <p className="text-sm text-muted-foreground">No results recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Qualified</TableHead>
                        <TableHead className="text-right">Opps</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...metrics].reverse().map((m) => (
                        <TableRow key={`${m.metricDate}-${m.source}`}>
                          <TableCell>{m.metricDate}</TableCell>
                          <TableCell className="capitalize">{m.source}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(m.sessions, "count")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(m.leads, "count")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(m.qualifiedLeads, "count")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(m.opportunities, "count")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(m.customers, "count")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(m.spend, "money", m.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {canManage && campaign.status !== "archived" ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Import from a CSV export</summary>
                  <div className="mt-4">
                    <ActionForm
                      action={importMetricsAction.bind(null, businessId, campaign.id)}
                      submitLabel="Import"
                      pendingText="Importing..."
                      resetOnSuccess
                      encType="multipart/form-data"
                    >
                      <p className="text-xs text-muted-foreground">
                        One row per day with a <code>date</code> column, plus any of impressions, clicks, sessions, engagements, leads,
                        qualified_leads, opportunities, customers, spend, revenue, currency. Blank cells stay unreported. Re-importing a day
                        replaces it.
                      </p>
                      <Field label="CSV file" htmlFor="csv-file">
                        <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" />
                      </Field>
                      <Field label="Or paste" htmlFor="csv-text">
                        <Textarea id="csv-text" name="csv" rows={4} className="font-mono text-xs" placeholder={"date,clicks,leads,spend,currency\n2026-09-01,120,4,5000,INR"} />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
              {canManage && campaign.status !== "archived" ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Record results</summary>
                  <div className="mt-4">
                    <ActionForm
                      action={recordMetricAction.bind(null, businessId, campaign.id)}
                      submitLabel="Save numbers"
                      resetOnSuccess
                    >
                      <MetricFields currency={currency} />
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {content.length === 0 ? (
                <p className="text-sm text-muted-foreground">No content linked to this campaign.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {content.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`${root}/content/${c.id}`} className="truncate hover:underline">
                        {c.title}
                      </Link>
                      <ContentStatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <Link href={`${root}/content/new?campaign=${campaign.id}`} className="text-sm text-primary hover:underline">
                  Add content
                </Link>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
            </CardHeader>
            <CardContent>
              {campaignAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assets linked to this campaign.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {campaignAssets.map((a) => (
                    <li key={a.id} className="truncate">
                      {a.name}
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`${root}/assets`} className="mt-2 inline-block text-sm text-primary hover:underline">
                Manage assets
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Attributed records</CardTitle>
              <CardDescription>Prospects, opportunities and customers this campaign touched — only where you have evidence.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {attributions.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
              <ul className="flex flex-col gap-2 text-sm">
                {attributions.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate">{a.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.entityType} · {a.touchType.replace(/_/g, " ")} · {a.source === "inferred" ? "AI-inferred" : a.source}
                        {a.evidenceNote ? ` · ${a.evidenceNote}` : ""}
                      </p>
                    </div>
                    {canManage ? (
                      <ActionForm action={deleteAttributionAction.bind(null, businessId, a.id)} inline submitLabel="Remove" variant="ghost" />
                    ) : null}
                  </li>
                ))}
              </ul>
              {candidates && (candidates.prospects.length || candidates.opportunities.length || candidates.customers.length) ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Record an attribution</summary>
                  <div className="mt-3">
                    <ActionForm action={recordAttributionAction.bind(null, businessId, campaign.id)} submitLabel="Record" size="sm" resetOnSuccess>
                      <Field label="Record" htmlFor="attr-entity">
                        <NativeSelect id="attr-entity" name="entity" required defaultValue="">
                          <option value="" disabled>
                            Choose
                          </option>
                          {candidates.prospects.length ? (
                            <optgroup label="Prospects">
                              {candidates.prospects.map((p) => (
                                <option key={p.id} value={`prospect:${p.id}`}>
                                  {p.label}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {candidates.opportunities.length ? (
                            <optgroup label="Opportunities">
                              {candidates.opportunities.map((o) => (
                                <option key={o.id} value={`opportunity:${o.id}`}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {candidates.customers.length ? (
                            <optgroup label="Customers">
                              {candidates.customers.map((c) => (
                                <option key={c.id} value={`customer:${c.id}`}>
                                  {c.label}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </NativeSelect>
                      </Field>
                      <Field label="Touch" htmlFor="attr-touch">
                        <NativeSelect id="attr-touch" name="touchType" defaultValue="influenced">
                          <option value="first_touch">First touch</option>
                          <option value="last_touch">Last touch</option>
                          <option value="influenced">Influenced</option>
                        </NativeSelect>
                      </Field>
                      <Field label="Evidence" htmlFor="attr-evidence" hint="Required for customers.">
                        <Input id="attr-evidence" name="evidence" placeholder="e.g. came in through the webinar signup form" />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
