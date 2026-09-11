import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { DASHBOARD_BIN_LABEL, DASHBOARD_BIN_ORDER } from "../../lib/opportunities/dashboard";
import type { OpportunityDashboardRow } from "../../lib/opportunities/dashboard-queries";
import { NEXT_BEST_ACTION_LABEL, type OpportunityPriority } from "../../lib/opportunities/types";

const PRIORITY_BADGE_VARIANT: Record<OpportunityPriority, "secondary" | "outline" | "destructive"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function ScoreCell({ score }: { score: number | null }) {
  return score === null ? <span className="text-muted-foreground">—</span> : <span className="font-medium">{score}</span>;
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
                    <p className="text-xs">
                      <span className="font-medium">
                        {opportunity.recommended_action ? NEXT_BEST_ACTION_LABEL[opportunity.recommended_action] : "No recommendation yet"}
                      </span>
                      {opportunity.recommended_action_reason ? (
                        <span className="text-muted-foreground"> — {opportunity.recommended_action_reason}</span>
                      ) : null}
                    </p>
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
                      <TableCell className="max-w-56">
                        <TruncatedText value={topSignal} />
                      </TableCell>
                      <TableCell className="max-w-48">
                        <p className="font-medium">
                          {opportunity.recommended_action ? NEXT_BEST_ACTION_LABEL[opportunity.recommended_action] : "—"}
                        </p>
                        {opportunity.recommended_action_reason ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{opportunity.recommended_action_reason}</p>
                        ) : null}
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
