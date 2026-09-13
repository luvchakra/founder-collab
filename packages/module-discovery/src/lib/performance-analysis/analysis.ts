import type { OfferingPerformanceAnalysis, RateBucket } from "./types";

/**
 * Generic free-text grouping used for every bucket in this story except the score
 * ranges below (signals/industries/locations/job-titles are all free text in this
 * schema -- see types.ts's own comment). A `null`/empty group key is skipped entirely,
 * never folded into a misleading "(unknown)" bucket -- an item with nothing to group by
 * says nothing about that group's own performance either way.
 */
export function computeRateBuckets<T>(items: T[], groupKey: (item: T) => string | null, isMatch: (item: T) => boolean): RateBucket[] {
  const groups = new Map<string, { total: number; matched: number }>();
  for (const item of items) {
    const key = groupKey(item);
    if (key === null || key.trim() === "") continue;
    const entry = groups.get(key) ?? { total: 0, matched: 0 };
    entry.total += 1;
    if (isMatch(item)) entry.matched += 1;
    groups.set(key, entry);
  }
  return Array.from(groups.entries())
    .map(([label, { total, matched }]) => ({ label, total, matched, rate: Math.round((matched / total) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
}

const SCORE_BUCKET_RANGES = [
  { label: "0-25", min: 0, max: 25 },
  { label: "26-50", min: 26, max: 50 },
  { label: "51-75", min: 51, max: 75 },
  { label: "76-100", min: 76, max: 100 },
];

/** Fixed ranges, not `computeRateBuckets` -- a score is numeric, not a free-text group
 * key, and "does a higher score correlate" needs the ranges in a fixed, readable order
 * (not sorted by rate like every other bucket set here). */
export function computeScoreOutcomeBuckets(items: { score: number | null; won: boolean }[]): RateBucket[] {
  return SCORE_BUCKET_RANGES.map((range) => {
    const inRange = items.filter((i) => i.score !== null && i.score >= range.min && i.score <= range.max);
    const matched = inRange.filter((i) => i.won).length;
    return {
      label: range.label,
      total: inRange.length,
      matched,
      rate: inRange.length > 0 ? Math.round((matched / inRange.length) * 100) : 0,
    };
  });
}

export type PerformanceAnalysisRawData = {
  prospects: { id: string; industry: string | null; location: string | null; fit_score: number | null; outcome: string }[];
  signals: { prospect_id: string; description: string }[];
  conversations: { prospect_id: string; contact_id: string | null; status: string }[];
  contacts: { id: string; job_title: string | null }[];
};

/**
 * Assembles every answerable question from types.ts's own doc comments into one result.
 * Pure -- takes already-fetched rows (see `queries.ts`'s own `getPerformanceAnalysisRawData`),
 * same "derive, don't add a stored aggregate nothing would keep in sync" discipline this
 * whole backlog run has followed throughout (`computeConversionFunnel`,
 * `computeDiscoveryOutcomeStage`, etc.).
 *
 * "Won" (used for both the ICP-attribute and score-outcome questions) is Discovery's own
 * `prospects.outcome` field, not a live downstream CRM lookup -- deliberately, to keep
 * this a handful of workspace-scoped queries rather than one contract call per prospect.
 * A deal that closed only in CRM without ever being marked won here won't be reflected;
 * that's a real limitation, not an oversight, and is called out in the component that
 * renders this.
 */
export function computeOfferingPerformanceAnalysis(raw: PerformanceAnalysisRawData): OfferingPerformanceAnalysis {
  const prospectsWithConversation = new Set(raw.conversations.map((c) => c.prospect_id));

  const signalsProducingConversations = computeRateBuckets(
    raw.signals,
    (s) => s.description,
    (s) => prospectsWithConversation.has(s.prospect_id),
  );

  const industryConversionRates = computeRateBuckets(
    raw.prospects,
    (p) => p.industry,
    (p) => p.outcome === "won",
  );

  const locationConversionRates = computeRateBuckets(
    raw.prospects,
    (p) => p.location,
    (p) => p.outcome === "won",
  );

  const jobTitleByContactId = new Map(raw.contacts.map((c) => [c.id, c.job_title]));
  const conversationsWithContact = raw.conversations.filter((c) => c.contact_id !== null);
  const buyerRolesThatRespond = computeRateBuckets(
    conversationsWithContact,
    (c) => jobTitleByContactId.get(c.contact_id as string) ?? null,
    (c) => c.status === "replied",
  );

  const scoreVsOutcome = computeScoreOutcomeBuckets(raw.prospects.map((p) => ({ score: p.fit_score, won: p.outcome === "won" })));

  return { signalsProducingConversations, industryConversionRates, locationConversionRates, buyerRolesThatRespond, scoreVsOutcome };
}
