import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { DASHBOARD_BIN_LABEL } from "../../lib/opportunities/dashboard";
import type { AccountOfferingEntry, CrossOfferingAccount } from "../../lib/portfolio/types";

const PRIORITY_BADGE_VARIANT: Record<NonNullable<AccountOfferingEntry["priority"]>, "secondary" | "outline" | "destructive"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function OfferingChip({ basePath, entry }: { basePath: string; entry: AccountOfferingEntry }) {
  return (
    <Link
      href={`${basePath}/${entry.productId}/prospects/${entry.prospectId}`}
      className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:border-primary hover:bg-accent/40"
    >
      <span className="min-w-0 truncate font-medium text-foreground">{entry.productName}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {entry.score !== null ? <span className="text-muted-foreground">Score {entry.score}</span> : <span className="text-muted-foreground">No score yet</span>}
        {entry.bin ? <Badge variant={entry.priority ? PRIORITY_BADGE_VARIANT[entry.priority] : "outline"}>{DASHBOARD_BIN_LABEL[entry.bin]}</Badge> : null}
      </span>
    </Link>
  );
}

/**
 * DISC-OFFER-P1 §7-04.1 "Cross-Offering Account View" -- the doc's own example (one
 * company name, then one line per offering with that offering's own score/tier).
 * "Hot"/"Warm" in the doc's own mockup become the same real dashboard bin labels
 * (Hot/Needs Review/New/Watching/Insufficient Evidence) this module already shows
 * everywhere else, not an invented second vocabulary -- a founder sees one consistent
 * set of tier names across this module, not two. Each offering line links straight to
 * that offering's own prospect detail page ("keep opportunities independent" -- this
 * view never merges them, only shows them side by side). Compact stacked layout at
 * every width: this is already card-shaped (one card per account, chips inside), so
 * there's no separate desktop-table variant to build (design rule #12 exists to convert
 * *tables* to cards below `md`, not to force a card-shaped view into a table it was
 * never asked to be).
 */
export function CrossOfferingAccounts({ basePath, accounts }: { basePath: string; accounts: CrossOfferingAccount[] }) {
  if (accounts.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {accounts.map((account) => (
        <li key={account.key} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p className="font-medium">{account.companyName}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {account.offerings.map((entry) => (
              <OfferingChip key={entry.productId} basePath={basePath} entry={entry} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
