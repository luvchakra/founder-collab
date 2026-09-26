import Link from "next/link";
import { OPPORTUNITY_ALERT_WINDOW_DAYS, type OpportunityAlertGroup } from "../../lib/alerts/opportunity-alerts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * DISC-OFFER-P1-01.4 "Grouped Opportunity Alerts" on the offering's Signals page -- one
 * entry per account that picked up several signals recently, its signals listed under
 * it, rather than a feed of raw signals. The same groups feed the header bell. Renders
 * nothing when no account is heating up: the watchlist below is then the whole page.
 */
export function HeatingUpAlerts({ groups, prospectsBasePath }: { groups: OpportunityAlertGroup[]; prospectsBasePath: string }) {
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="heating-up-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="heating-up-heading" className="text-sm font-medium text-foreground">
          Heating up
        </h2>
        <p className="text-xs text-muted-foreground">
          Accounts with several new signals in the last {OPPORTUNITY_ALERT_WINDOW_DAYS} days, one alert per account.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((group) => (
          <li key={group.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium">
                <Link href={`${prospectsBasePath}/${group.prospectId}`} className="hover:underline">
                  {group.companyName}
                </Link>{" "}
                <span className="font-normal text-muted-foreground">is heating up</span>
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {group.signals.length} signals · latest {formatDate(group.latestAt)}
              </span>
            </div>
            <ul className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3">
              {group.signals.map((signal) => (
                <li key={signal.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">{signal.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(signal.observedAt)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
