import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { DASHBOARD_BIN_LABEL, DASHBOARD_BIN_ORDER } from "../../lib/opportunities/dashboard";
import type { OpportunityDashboardRow } from "../../lib/opportunities/dashboard-queries";
import { effectiveRecommendedAction } from "../../lib/opportunities/next-best-action";
import { NEXT_BEST_ACTION_LABEL, type OpportunityConfidence, type OpportunityPriority } from "../../lib/opportunities/types";

/** DISC-OFFER-P0-15.1: reads through `effectiveRecommendedAction` rather than
 * `opportunity.recommended_action` directly, so a founder's own override (set from the
 * Opportunity Detail page or the Overview page's "Top Opportunity" gate) shows here too
 * instead of this listing silently keeping the stale computed value on screen -- exactly
 * the "must NOT silently overwrite user-approved values" (§25) risk this function
 * exists to close. The AI's own `recommended_action_reason` is shown only when its own
 * `recommended_action` is actually the one in effect -- once a founder has overridden it,
 * that reason describes a suggestion no longer being acted on, not this one. */
function RecommendedActionCell({ opportunity }: { opportunity: OpportunityDashboardRow["opportunity"] }) {
  const action = effectiveRecommendedAction(opportunity);
  const isOverride = opportunity.recommended_action_override !== null;
  return (
    <>
      <p className="font-medium">
        {action ? NEXT_BEST_ACTION_LABEL[action] : "No recommendation yet"}
        {isOverride ? <span className="ml-1 text-xs font-normal text-muted-foreground">(founder override)</span> : null}
      </p>
      {!isOverride && opportunity.recommended_action_reason ? (
        <p className="text-xs text-muted-foreground">{opportunity.recommended_action_reason}</p>
      ) : null}
    </>
  );
}

const PRIORITY_BADGE_VARIANT: Record<OpportunityPriority, "secondary" | "outline" | "destructive"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function ScoreCell({ score }: { score: number | null }) {
  return score === null ? <span className="text-muted-foreground">—</span> : <span className="font-medium">{score}</span>;
}

/** DISC-OFFER-P1-05.2: the doc's own "Confidence" column -- the same three-tier badge
 * `OpportunityDetail`'s own `ConfidenceBadge` already renders on the full detail page,
 * reproduced here rather than shared: this codebase already has two independent copies
 * of this exact badge (`opportunity-detail.tsx`, `top-opportunity-gate.tsx`), so a third
 * follows that same established precedent rather than extracting a shared component as
 * an unrelated refactor of this story (CLAUDE.md dev principle #10). */
const CONFIDENCE_BADGE_VARIANT: Record<OpportunityConfidence, "default" | "secondary" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

function ConfidenceCell({ confidence }: { confidence: OpportunityConfidence }) {
  return <Badge variant={CONFIDENCE_BADGE_VARIANT[confidence]}>{confidence}</Badge>;
}

function TruncatedText({ value }: { value: string | null }) {
  return value ? <span className="line-clamp-2 text-muted-foreground">{value}</span> : <span className="text-muted-foreground">—</span>;
}

/**
 * DISC-OFFER-P0-07.2: "Today's Opportunities" -- the doc's own five-bin dashboard, each
 * bin rendered only when it actually has a row in it (an always-five-empty-sections
 * page would be worse than showing nothing, the same "no false precision" call made
 * throughout this backlog for a missing/zero real value). Desktop gets a real table per
 * bin, mobile gets one card per row (CLAUDE.md non-negotiable #12) -- exactly the same
 * split `OfferingsTable` (01.3) already established, reused here rather than inventing
 * a second responsive pattern. Company links to the opportunity's own detail page
 * (DISC-OFFER-P0-07.3, added the same session this dashboard's own dead-link concern
 * would otherwise have applied).
 */
export function OpportunitiesDashboard({
  businessId,
  productId,
  rows,
}: {
  businessId: string;
  productId: string;
  rows: OpportunityDashboardRow[];
}) {
  if (rows.length === 0) {
    return <EmptyState message="No active opportunities yet. They'll appear here once Discovery surfaces one." />;
  }

  const basePath = `/dashboard/businesses/${businessId}/products/${productId}/opportunities`;

  return (
    <div className="flex flex-col gap-6">
      {DASHBOARD_BIN_ORDER.map((bin) => {
        const binRows = rows.filter((row) => row.bin === bin);
        if (binRows.length === 0) return null;

        return (
          <section key={bin} className="flex flex-col gap-3">
            <h2 className="font-medium">
              {DASHBOARD_BIN_LABEL[bin]} <span className="text-sm font-normal text-muted-foreground">({binRows.length})</span>
            </h2>

            <div className="rounded-2xl border border-border">
              {/* Mobile: one card per row (CLAUDE.md #12) */}
              <ul className="divide-y md:hidden">
                {binRows.map(({ opportunity, prospect, contactName, topSignal }) => (
                  <li key={opportunity.id} className="flex flex-col gap-2 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`${basePath}/${opportunity.id}`} className="min-w-0 truncate font-medium hover:underline">
                        {prospect.company_name}
                      </Link>
                      <Badge variant={PRIORITY_BADGE_VARIANT[opportunity.priority]}>{opportunity.priority}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Score: <ScoreCell score={opportunity.score} />
                      </span>
                      <span>Contact: {contactName ?? "No contact on file"}</span>
                      <ConfidenceCell confidence={opportunity.confidence} />
                    </div>
                    {opportunity.why_them ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Offering fit: </span>
                        {opportunity.why_them}
                      </p>
                    ) : null}
                    {opportunity.why_now ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Why now: </span>
                        {opportunity.why_now}
                      </p>
                    ) : null}
                    {topSignal ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Top signal: </span>
                        {topSignal}
                      </p>
                    ) : null}
                    <div className="text-xs">
                      <RecommendedActionCell opportunity={opportunity} />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: proto-table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Offering fit</TableHead>
                    <TableHead>Why now</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Top signal</TableHead>
                    <TableHead>Recommended action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {binRows.map(({ opportunity, prospect, contactName, topSignal }) => (
                    <TableRow key={opportunity.id}>
                      <TableCell className="max-w-40">
                        <Link href={`${basePath}/${opportunity.id}`} className="block truncate font-medium hover:underline">
                          {prospect.company_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ScoreCell score={opportunity.score} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_BADGE_VARIANT[opportunity.priority]}>{opportunity.priority}</Badge>
                      </TableCell>
                      <TableCell className="max-w-56">
                        <TruncatedText value={opportunity.why_them} />
                      </TableCell>
                      <TableCell className="max-w-56">
                        <TruncatedText value={opportunity.why_now} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{contactName ?? "—"}</TableCell>
                      <TableCell>
                        <ConfidenceCell confidence={opportunity.confidence} />
                      </TableCell>
                      <TableCell className="max-w-56">
                        <TruncatedText value={topSignal} />
                      </TableCell>
                      <TableCell className="max-w-48">
                        <RecommendedActionCell opportunity={opportunity} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
