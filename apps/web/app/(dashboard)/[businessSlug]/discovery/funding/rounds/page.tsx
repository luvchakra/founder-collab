import Link from "next/link";
import { Landmark } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { listPipeline, listRounds } from "@cofounderai/module-discovery/lib/funding/queries";
import { formatAmount, roundProgress } from "@cofounderai/module-discovery/lib/funding/metrics";
import { ROUND_TYPE_LABEL } from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { RoundFields } from "@cofounderai/module-discovery/components/funding/round-fields";
import { RoundBadge } from "@cofounderai/module-discovery/components/funding/status";
import { createRoundAction } from "../actions";
import { fundingContext } from "../context";

/** FND-06 — Fundraising: every round, with its progress, and a form for the next one. */
export default async function RoundsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const [rounds, pipeline] = await Promise.all([listRounds(businessId), listPipeline(businessId)]);

  return (
    <>
      <PageHeader title="Fundraising" description="Your rounds — planned, open and past — with what has been committed and received." />
      {rounds.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={Landmark} message="No rounds yet." />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rounds.map((r) => {
            const p = roundProgress(
              r,
              pipeline.filter((x) => x.roundId === r.id),
            );
            return (
              <li key={r.id}>
                <Link href={`${root}/rounds/${r.id}`} className="block rounded-xl border bg-card p-4 hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROUND_TYPE_LABEL[r.roundType]}
                        {r.isPrimary ? " · primary" : " · parallel"}
                        {r.targetCloseDate ? ` · close by ${r.targetCloseDate}` : ""}
                      </p>
                    </div>
                    <RoundBadge status={r.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Target</dt>
                      <dd className="font-medium tabular-nums">{formatAmount(p.target.value, r.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Committed</dt>
                      <dd className="font-medium tabular-nums">{formatAmount(p.committed.value, r.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Raised</dt>
                      <dd className="font-medium tabular-nums">{formatAmount(p.raised.value, r.currency)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>New round</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createRoundAction.bind(null, businessId)} submitLabel="Create round" pendingText="Creating...">
              <RoundFields />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
