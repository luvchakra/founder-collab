import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import {
  listDataRoomItems,
  listDiligence,
  listInteractions,
  listInvestors,
  listOutreach,
  listPipeline,
  listReadinessItems,
  listRounds,
  listShares,
  listStageHistory,
  pickActiveRound,
} from "@cofounderai/module-discovery/lib/funding/queries";
import {
  dataRoomSummary,
  formatAmount,
  investorFunnel,
  readinessSummary,
  roundProgress,
  sourceBreakdown,
  stageEntriesByPeriod,
  timeInStage,
} from "@cofounderai/module-discovery/lib/funding/metrics";
import { PIPELINE_ORDER } from "@cofounderai/module-discovery/lib/funding/lifecycle";
import { INVESTOR_SOURCE_LABEL, PIPELINE_STAGE_LABEL, type InvestorSource } from "@cofounderai/module-discovery/lib/funding/types";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { InvestorFunnel } from "@cofounderai/module-discovery/components/funding/investor-funnel";
import { RoundProgressBar } from "@cofounderai/module-discovery/components/funding/round-progress";
import { fundingContext } from "../context";

const SERIES_STAGES = ["contacted", "meeting", "due_diligence", "term_discussion", "committed", "invested"] as const;

/**
 * FND-14 — Funding analytics (§31). Everything is counted from the business's own records
 * — stage history for conversion and time in stage, logged interactions for meetings,
 * outreach records for replies. A round can be chosen; the default is the live one.
 */
export default async function FundingAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, canView } = await fundingContext(businessSlug);
  if (!canView) return null;
  const rounds = await listRounds(businessId);
  const round = (typeof sp.round === "string" ? rounds.find((r) => r.id === sp.round) : undefined) ?? pickActiveRound(rounds) ?? rounds[0] ?? null;
  const grain = sp.grain === "month" ? "month" : "week";

  const [investors, pipeline, history, meetings, outreach, readiness, dataRoom, shares, diligence] = await Promise.all([
    listInvestors(businessId, "all"),
    round ? listPipeline(businessId, { roundId: round.id }) : Promise.resolve([]),
    round ? listStageHistory(businessId, round.id) : Promise.resolve([]),
    round ? listInteractions(businessId, { roundId: round.id, type: "meeting" }) : Promise.resolve([]),
    listOutreach(businessId),
    listReadinessItems(businessId),
    listDataRoomItems(businessId, { includeSuperseded: true }),
    listShares(businessId),
    listDiligence(businessId),
  ]);

  const funnel = investorFunnel(pipeline, history);
  const stays = timeInStage(history);
  const sources = sourceBreakdown(investors, pipeline);
  const series = stageEntriesByPeriod(history, grain, SERIES_STAGES);
  const readinessS = readinessSummary(readiness, new Date().toISOString().slice(0, 10));
  const dataRoomS = dataRoomSummary(dataRoom, shares, new Date());
  const sent = outreach.filter((o) => o.status === "sent" || o.status === "replied" || (o.status === "closed" && o.sentAt));
  const replied = outreach.filter((o) => o.status === "replied");

  return (
    <>
      <PageHeader title="Funding analytics" description={round ? `Pipeline figures are for ${round.name}.` : "No round yet — pipeline figures appear once a round exists."} />
      <div className="grid max-w-md grid-cols-2 gap-3">
        <UrlSelect name="round" label="Round" value={round?.id ?? ""} options={rounds.map((r) => ({ value: r.id, label: r.name }))} />
        <UrlSelect name="grain" label="Time series" value={grain} options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />
      </div>

      {round ? (
        <Card>
          <CardHeader>
            <CardTitle>Round</CardTitle>
            <CardDescription>
              {round.openedAt ? `Open ${Math.floor((new Date().getTime() - new Date(round.openedAt).getTime()) / 86_400_000)} days` : "Not opened yet"}
              {round.targetCloseDate ? ` · expected close ${round.targetCloseDate}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RoundProgressBar progress={roundProgress(round, pipeline)} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline conversion</CardTitle>
            <CardDescription>Reached · now · share of the previous stage that reached this one.</CardDescription>
          </CardHeader>
          <CardContent>
            {pipeline.length === 0 ? <p className="text-sm text-muted-foreground">No pipeline yet.</p> : <InvestorFunnel steps={funnel.steps} passed={funnel.passed} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Meetings logged" value={String(meetings.length)} />
              <Stat label="Outreach sent" value={String(sent.length)} />
              <Stat label="Replies" value={String(replied.length)} hint={sent.length ? `${Math.round((replied.length / sent.length) * 100)}% of sent` : undefined} />
              <Stat label="Diligence requests" value={String(diligence.length)} />
              <Stat label="Term discussions reached" value={String(funnel.steps.find((s) => s.stage === "term_discussion")?.reached ?? 0)} />
              <Stat label="Commitments" value={String(funnel.steps.find((s) => s.stage === "committed")?.reached ?? 0)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Time in stage</CardTitle>
            <CardDescription>Median days spent in each stage before moving on. Blank where no one has moved on yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {PIPELINE_ORDER.slice(0, -1).map((s) => (
                <li key={s} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{PIPELINE_STAGE_LABEL[s]}</span>
                  <span className="font-medium tabular-nums">{stays[s] === undefined ? "—" : `${stays[s]!.toFixed(1)} d`}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
            <CardDescription>How investors were found, as recorded on each investor.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Investors</TableHead>
                  <TableHead className="text-right">In pipeline</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell>{INVESTOR_SOURCE_LABEL[s.source as InvestorSource] ?? s.source}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.investors}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.inPipeline}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.committed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stage entries over time</CardTitle>
          <CardDescription>How many investors entered each stage per {grain}.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {series.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stage changes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{grain === "week" ? "Week of" : "Month"}</TableHead>
                  {SERIES_STAGES.map((s) => (
                    <TableHead key={s} className="text-right">
                      {PIPELINE_STAGE_LABEL[s]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((row) => (
                  <TableRow key={row.bucket}>
                    <TableCell>{row.bucket}</TableCell>
                    {SERIES_STAGES.map((s) => (
                      <TableCell key={s} className="text-right tabular-nums">
                        {row.counts[s] ?? 0}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Ready" value={String(readinessS.ready)} />
              <Stat label="Needs attention" value={String(readinessS.needsAttention)} />
              <Stat label="Missing" value={String(readinessS.missing)} />
              <Stat label="Overdue" value={String(readinessS.overdue)} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Data room</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Documents ready" value={String(dataRoomS.ready)} />
              <Stat label="Missing" value={String(dataRoomS.missing)} />
              <Stat label="Expired" value={String(dataRoomS.expired)} />
              <Stat label="Live share links" value={String(dataRoomS.activeShares)} />
              <Stat label="Times opened" value={String(dataRoomS.accessEvents)} />
              <Stat
                label="Committed in round"
                value={round ? formatAmount(roundProgress(round, pipeline).committed.value, round.currency) : "—"}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
      {hint ? <dd className="text-[11px] text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}
