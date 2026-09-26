import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { getRound, listEntityActivity, listInvestors, listPipeline, listStageHistory } from "@cofounderai/module-discovery/lib/funding/queries";
import { formatAmount, investorFunnel, roundProgress } from "@cofounderai/module-discovery/lib/funding/metrics";
import { allowedRoundMoves, PIPELINE_ORDER } from "@cofounderai/module-discovery/lib/funding/lifecycle";
import { PIPELINE_STAGE_LABEL, ROUND_TYPE_LABEL, type RoundStatus } from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { ActivityTimeline } from "@cofounderai/module-discovery/components/marketing/activity-timeline";
import { RoundFields } from "@cofounderai/module-discovery/components/funding/round-fields";
import { RoundProgressBar } from "@cofounderai/module-discovery/components/funding/round-progress";
import { InvestorFunnel } from "@cofounderai/module-discovery/components/funding/investor-funnel";
import { RoundBadge, StageBadge } from "@cofounderai/module-discovery/components/funding/status";
import { StageMoveForm } from "@cofounderai/module-discovery/components/funding/stage-move";
import { addToRoundAction, moveStageAction, transitionRoundAction, updateRoundAction } from "../../actions";
import { fundingContext } from "../../context";

const ROUND_LABEL: Record<RoundStatus, string> = {
  planning: "Back to planning",
  open: "Open round",
  paused: "Pause",
  closed: "Close round",
  cancelled: "Cancel round",
};

/** FND-06/FND-09 — one round: progress, the investor pipeline grouped by stage with
 * the legal stage moves, the round's details and its audit trail. */
export default async function RoundPage({ params }: { params: Promise<{ businessSlug: string; roundId: string }> }) {
  const { businessSlug, roundId } = await params;
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const round = await getRound(businessId, roundId);
  if (!round) notFound();
  const [pipeline, history, investors, activity] = await Promise.all([
    listPipeline(businessId, { roundId: round.id }),
    listStageHistory(businessId, round.id),
    listInvestors(businessId),
    listEntityActivity(businessId, "funding_round", round.id),
  ]);
  const progress = roundProgress(round, pipeline);
  const funnel = investorFunnel(pipeline, history);
  const inRound = new Set(pipeline.map((p) => p.investorId));
  const addable = investors.filter((i) => !inRound.has(i.id));
  const stages = [...PIPELINE_ORDER, "passed" as const].filter((s) => pipeline.some((p) => p.stage === s));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {round.name} <RoundBadge status={round.status} />
          </span>
        }
        description={`${ROUND_TYPE_LABEL[round.roundType]} · target ${formatAmount(round.targetAmount, round.currency)}${round.instrument ? ` · ${round.instrument}` : ""}`}
        breadcrumbs={[{ label: "Fundraising", href: `${root}/rounds` }, { label: round.name }]}
        actions={<ExportMenu exportId="funding.pipeline" businessSlug={businessSlug} params={{ roundId: round.id }} kind="report" />}
      />

      {canManage ? (
        <TransitionButtons
          action={transitionRoundAction.bind(null, businessId, round.id)}
          targets={allowedRoundMoves(round.status)}
          labels={ROUND_LABEL}
          destructive={["cancelled", "closed"]}
          confirmFor={{ closed: "Close this round? It cannot be reopened.", cancelled: "Cancel this round? It cannot be reopened." }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>Committed is what investors said they will put in; raised is what was received.</CardDescription>
        </CardHeader>
        <CardContent>
          <RoundProgressBar progress={progress} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Investors in this round</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {pipeline.length === 0 ? <p className="text-sm text-muted-foreground">No investors added yet.</p> : null}
              {stages.map((stage) => (
                <section key={stage} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">
                    {PIPELINE_STAGE_LABEL[stage]} <span className="text-muted-foreground">({pipeline.filter((p) => p.stage === stage).length})</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {pipeline
                      .filter((p) => p.stage === stage)
                      .map((p) => (
                        <li key={p.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link href={`${root}/investors/${p.investorId}`} className="font-medium hover:underline">
                                {p.investorName}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                Since {p.stageEnteredAt.slice(0, 10)}
                                {p.nextAction ? ` · next: ${p.nextAction}${p.nextActionDue ? ` (${p.nextActionDue})` : ""}` : ""}
                                {p.committedAmount !== null ? ` · committed ${formatAmount(p.committedAmount, p.currency)}` : ""}
                                {p.investedAmount !== null ? ` · received ${formatAmount(p.investedAmount, p.currency)}` : ""}
                                {p.passReason ? ` · passed: ${p.passReason}` : ""}
                              </p>
                            </div>
                            <StageBadge stage={p.stage} />
                          </div>
                          {canManage ? (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-muted-foreground">Move stage</summary>
                              <div className="mt-2">
                                <StageMoveForm record={p} action={moveStageAction.bind(null, businessId, p.id)} />
                              </div>
                            </details>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
              {canManage && addable.length > 0 ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Add an investor to this round</summary>
                  <div className="mt-3">
                    <AddToRound businessId={businessId} roundId={round.id} investors={addable} />
                  </div>
                </details>
              ) : null}
              {canManage && investors.length === 0 ? (
                <Link href={`${root}/investors`} className="text-sm text-primary hover:underline">
                  Add investors to your database first
                </Link>
              ) : null}
            </CardContent>
          </Card>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Round details</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateRoundAction.bind(null, businessId, round.id)} submitLabel="Save">
                  <RoundFields round={round} />
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <InvestorFunnel steps={funnel.steps} passed={funnel.passed} />
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

/** The investor picker posts to the investor-scoped action with the round as a field. */
function AddToRound({ businessId, roundId, investors }: { businessId: string; roundId: string; investors: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {investors.slice(0, 50).map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{inv.name}</span>
          <ActionForm action={addToRoundAction.bind(null, businessId, inv.id)} inline submitLabel="Add" variant="outline">
            <input type="hidden" name="roundId" value={roundId} />
            <input type="hidden" name="stage" value="identified" />
          </ActionForm>
        </div>
      ))}
      {investors.length > 50 ? <p className="text-xs text-muted-foreground">Add others from their investor page.</p> : null}
    </div>
  );
}
