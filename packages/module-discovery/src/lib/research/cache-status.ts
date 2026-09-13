/**
 * DISC-OFFER-P1 §7-03.2 "Research Cache" -- surfaces the staleness of an already-cached
 * `ProspectResearch` row. Pure, no AI call (CLAUDE.md dev principle #4): `expires_at`
 * was already being written on every research run (`RESEARCH_TTL_DAYS`,
 * research-prospect.ts) but nothing anywhere read it back -- this is that read, made
 * into a small, testable function rather than inline date math in a component.
 */
export type ResearchCacheStatus = {
  ageDays: number;
  isExpired: boolean;
  /** Null when there's no `expires_at` on file at all (research written before that
   * column existed) -- the actual number of days is genuinely unknown in that case.
   * `isExpired` still defaults to `false` when this is null, same "never guess a
   * rejection over missing data" convention `icp-pre-filter.ts` already established --
   * treating unknown as expired would prompt a needless re-research spend. */
  daysUntilExpiry: number | null;
};

export function computeResearchCacheStatus(
  research: { researched_at: string; expires_at: string | null },
  now: Date = new Date(),
): ResearchCacheStatus {
  const researchedAt = new Date(research.researched_at).getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - researchedAt) / (24 * 60 * 60 * 1000)));

  if (research.expires_at === null) {
    return { ageDays, isExpired: false, daysUntilExpiry: null };
  }

  const expiresAt = new Date(research.expires_at).getTime();
  const daysUntilExpiry = Math.ceil((expiresAt - now.getTime()) / (24 * 60 * 60 * 1000));
  return { ageDays, isExpired: expiresAt <= now.getTime(), daysUntilExpiry };
}
