/** DISC-OFFER-P1-01.1: "Scheduled Offering Re-Discovery" -- the doc's own closed
 * interval vocabulary is really just "off, or some cadence"; kept to the two concrete
 * cadences worth offering a founder rather than an open-ended free-text interval (a
 * cron-style expression would be real scope creep past what the doc's own "Last
 * discovery... Next discovery... [Run Now]" mockup asks for). */
export type RediscoveryInterval = "off" | "daily" | "weekly";

export const REDISCOVERY_INTERVAL_LABEL: Record<RediscoveryInterval, string> = {
  off: "Off",
  daily: "Daily",
  weekly: "Weekly",
};

const INTERVAL_DAYS: Record<Exclude<RediscoveryInterval, "off">, number> = {
  daily: 1,
  weekly: 7,
};

/**
 * DISC-OFFER-P1-01.1: deterministic, no AI call (CLAUDE.md dev principle #4) -- pure
 * date arithmetic pulled out of the DB-composing mutations that call it
 * (`setRediscoveryInterval`, `completePipelineRun`) so it has its own unit test, this
 * run's own "no unit test for a DB-composing function, only for new pure domain logic"
 * convention. `off` has no next run at all -- `null`, not some far-future sentinel date,
 * the same "absence of evidence isn't evidence of absence" precision this backlog
 * applies throughout (05.2/05.5/13.1) to a genuinely absent value.
 */
export function computeNextDiscoveryAt(interval: RediscoveryInterval, from: Date): Date | null {
  if (interval === "off") return null;
  return new Date(from.getTime() + INTERVAL_DAYS[interval] * 24 * 60 * 60 * 1000);
}

/**
 * DISC-OFFER-P1-01.1's own "Next discovery: Tomorrow" -- whether a workspace's own
 * schedule has actually come due. `null` (never scheduled, or scheduling turned off)
 * is never "due" -- there is nothing scheduled to be due.
 */
export function isRediscoveryDue(nextDiscoveryAt: string | null, now: Date): boolean {
  if (nextDiscoveryAt === null) return false;
  return new Date(nextDiscoveryAt).getTime() <= now.getTime();
}
