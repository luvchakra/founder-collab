/** DISC-OFFER-P1 §7-02.3 "Offering Performance Analysis" -- one bucket in a rate
 * breakdown (e.g. one signal description, one industry, one job title). `label` is the
 * raw free-text value being grouped by -- these are all free-text fields in this schema
 * (industry/location/job_title/signal description), so there is no fixed catalog to
 * translate a key into a nicer display name. */
export type RateBucket = {
  label: string;
  total: number;
  matched: number;
  /** Percentage, rounded -- 0 when `total` is 0 (never divides by zero, never guesses). */
  rate: number;
};

export type OfferingPerformanceAnalysis = {
  /** "Which signals produce conversations?" -- one bucket per distinct signal
   * description, `matched` = prospects with that signal who had at least one
   * conversation (any status). */
  signalsProducingConversations: RateBucket[];
  /** "Which ICP attributes produce conversions?" -- the doc's own word is "ICP
   * attributes", but `icp_profiles` is one row per offering, not per prospect, so there
   * is nothing prospect-level to bucket by there. Read instead as each prospect's own
   * industry/location (the two free-text attributes already used to check ICP fit --
   * see `discovery-criteria.ts`), `matched` = that prospect's own `outcome = 'won'`. */
  industryConversionRates: RateBucket[];
  locationConversionRates: RateBucket[];
  /** "Which buyer roles respond?" -- one bucket per distinct contact `job_title` among
   * contacts actually linked to a conversation, `matched` = that conversation reached
   * `status = 'replied'`. Conversations with no linked contact are excluded outright
   * (never guess a role for an anonymous conversation). */
  buyerRolesThatRespond: RateBucket[];
  /** "Does a higher score correlate with better outcomes?" -- fixed score-range
   * buckets, `matched` = `outcome = 'won'` within that range. */
  scoreVsOutcome: RateBucket[];
};

/** "Which Discovery Plays perform best?" -- the doc's own fifth question, deliberately
 * NOT answered here. `discovery_definitions` (04.1) carries no reference back to which
 * `DiscoveryPlay` preset (04.2, `discovery-definitions/plays.ts`) it was started from --
 * a play only pre-fills the create-definition dialog once, at creation time, and the
 * resulting definition is then indistinguishable from one written from scratch. Answering
 * this honestly needs a new `play_key` column on `discovery_definitions` (a real schema
 * change, and one that couldn't back-fill history for definitions already created without
 * it) -- a genuine data-model gap, not a display-only one, so it's named here rather than
 * silently produced with fabricated or misleading data. */
export const DISCOVERY_PLAYS_NOTE =
  "Not shown: which Discovery Plays perform best. Discovery Definitions don't currently record which play (if any) they were started from, so this can't be answered from existing data yet.";
