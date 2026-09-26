import Link from "next/link";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import type { WatchlistEntryWithProspect } from "../../lib/watchlist/types";

/**
 * DISC-OFFER-P1 §7-01.3 "Account Watchlist" -- one row per watched account, the doc's
 * own listed fields (account, watch reason, current score, last signal, next review).
 * "Offering" isn't a column -- this page already lives inside one offering's own
 * workspace, same as every other list in this section (Prospects, Opportunities).
 * Compact cards below `md`, a real table at `md` and up (design rule #12/CLAUDE.md).
 */
export function WatchlistDashboard({
  basePath,
  rows,
}: {
  /** The offering's own `/prospects` base path -- each row links to that account's
   * existing detail page (where the actual watch/edit/remove form lives) rather than
   * duplicating that form here. */
  basePath: string;
  rows: WatchlistEntryWithProspect[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState message="No accounts watched yet. Open an account from Prospects and use “Watch this account” to keep an eye on it here." />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Link href={`${basePath}/${row.prospect_id}`} className="font-medium hover:underline">
                {row.prospectCompanyName}
              </Link>
              {row.currentScore !== null ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Score {row.currentScore}</span>
              ) : null}
            </div>
            <p className="text-muted-foreground">{row.watch_reason}</p>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>Last signal: {row.lastSignalDescription ?? "None yet"}</span>
              <span>Next review: {row.next_review_at ? new Date(row.next_review_at).toLocaleDateString() : "Not set"}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Watch reason</th>
              <th className="px-3 py-2 font-medium">Current score</th>
              <th className="px-3 py-2 font-medium">Last signal</th>
              <th className="px-3 py-2 font-medium">Next review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`${basePath}/${row.prospect_id}`} className="font-medium hover:underline">
                    {row.prospectCompanyName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.watch_reason}</td>
                <td className="px-3 py-2">{row.currentScore ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.lastSignalDescription ?? "None yet"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.next_review_at ? new Date(row.next_review_at).toLocaleDateString() : "Not set"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
