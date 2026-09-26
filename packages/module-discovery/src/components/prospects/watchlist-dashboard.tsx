import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { StatusBadge, type StatusTone } from "@cofounderai/core/ui/status-badge";
import { WATCH_REVIEW_STATE_LABEL, type OtherOfferingWatch, type WatchReviewState, type WatchlistEntryWithProspect } from "../../lib/watchlist/types";

const REVIEW_TONE: Record<WatchReviewState, StatusTone> = {
  overdue: "destructive",
  due_soon: "warning",
  scheduled: "secondary",
  not_set: "secondary",
};

function formatDate(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
}

function NextReview({ row }: { row: WatchlistEntryWithProspect }) {
  if (row.reviewState === "not_set") return <span className="text-muted-foreground">Not set</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span>{formatDate(row.next_review_at)}</span>
      {row.reviewState === "overdue" || row.reviewState === "due_soon" ? (
        <StatusBadge status={row.reviewState} label={WATCH_REVIEW_STATE_LABEL[row.reviewState]} tone={REVIEW_TONE[row.reviewState]} />
      ) : null}
    </div>
  );
}

function AlsoWatched({ watches }: { watches: OtherOfferingWatch[] | undefined }) {
  if (!watches || watches.length === 0) return null;
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      Also watched for{" "}
      {watches.map((w, i) => (
        <span key={w.productId}>
          {i > 0 ? "; " : null}
          <span className="font-medium text-foreground">{w.productName}</span> — {w.watchReason}
        </span>
      ))}
    </p>
  );
}

/**
 * DISC-OFFER-P1-01.3 "Account Watchlist" -- one row per watched account with the doc's
 * own fields (account, watch reason, current score, last signal, next review), in review
 * order: overdue first. "Offering" isn't a column -- the page already lives inside one
 * offering -- but "same account, watched differently for different offerings" is shown
 * under the reason whenever another offering of this business watches the same account.
 * A real table at `md` and up, stacked cards below it; each row carries its own edit
 * actions (`renderActions`).
 */
export function WatchlistDashboard({
  basePath,
  rows,
  otherOfferingWatches,
  renderActions,
}: {
  /** The offering's own `/prospects` base path -- each account links to its detail page. */
  basePath: string;
  rows: WatchlistEntryWithProspect[];
  otherOfferingWatches?: Map<string, OtherOfferingWatch[]>;
  renderActions?: (row: WatchlistEntryWithProspect) => ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState message="No accounts watched yet. Open an account from Prospects and use “Watch this account” to keep an eye on it here." />
    );
  }

  const overdue = rows.filter((r) => r.reviewState === "overdue").length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} watched {rows.length === 1 ? "account" : "accounts"}
        {overdue > 0 ? (
          <>
            {" · "}
            <span className="font-medium text-destructive-subtle">
              {overdue} {overdue === 1 ? "review is" : "reviews are"} overdue
            </span>
          </>
        ) : null}
      </p>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`${basePath}/${row.prospect_id}`} className="font-medium hover:underline">
                  {row.prospectCompanyName}
                </Link>
                {row.prospectIndustry ? <p className="text-xs text-muted-foreground">{row.prospectIndustry}</p> : null}
              </div>
              {row.currentScore !== null ? <span className="shrink-0 text-xs font-medium text-muted-foreground">Score {row.currentScore}</span> : null}
            </div>
            <div>
              <p>{row.watch_reason}</p>
              <AlsoWatched watches={otherOfferingWatches?.get(row.prospect_id)} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Last signal</dt>
              <dd>{row.lastSignalDescription ?? "None yet"}</dd>
              <dt className="text-muted-foreground">Next review</dt>
              <dd>
                <NextReview row={row} />
              </dd>
            </dl>
            {renderActions ? <div className="border-t border-border pt-2">{renderActions(row)}</div> : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Watch reason</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Last signal</th>
              <th className="px-3 py-2 font-medium">Next review</th>
              {renderActions ? (
                <th className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2.5">
                  <Link href={`${basePath}/${row.prospect_id}`} className="font-medium hover:underline">
                    {row.prospectCompanyName}
                  </Link>
                  {row.prospectIndustry ? <p className="text-xs text-muted-foreground">{row.prospectIndustry}</p> : null}
                </td>
                <td className="max-w-xs px-3 py-2.5">
                  <p>{row.watch_reason}</p>
                  <AlsoWatched watches={otherOfferingWatches?.get(row.prospect_id)} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.currentScore ?? "—"}</td>
                <td className="max-w-xs px-3 py-2.5">
                  {row.lastSignalDescription ? (
                    <>
                      <p>{row.lastSignalDescription}</p>
                      {row.lastSignalAt ? <p className="text-xs text-muted-foreground">{formatDate(row.lastSignalAt)}</p> : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">None yet</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <NextReview row={row} />
                </td>
                {renderActions ? <td className="px-3 py-2.5">{renderActions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
