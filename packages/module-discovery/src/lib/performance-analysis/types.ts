/** DISC-OFFER-P1-02.3 "Offering Performance Analysis" -- one bucket in a rate
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
  /** DISC-OFFER-P1-02.3 "Which Discovery Plays perform best?" -- one bucket per play
   * (via each opportunity's own `discovery_definition_id` -> `play_key`), `total` = the
   * opportunities that play's definitions found, `matched` = those whose account reached
   * a conversation. Opportunities with no definition at all are left out. */
  discoveryPlayPerformance: RateBucket[];
};

/** DISC-OFFER-P1-02.3: how the "Which Discovery Plays perform best?" answer is counted,
 * shown next to it. A definition only records its play from the moment
 * `discovery_definitions.play_key` existed; anything older, written from scratch, or
 * seeded by the pipeline reports under "Custom definition" rather than being guessed into
 * a play. */
export const DISCOVERY_PLAYS_NOTE =
  "Conversation rate of the opportunities each play's definitions found. Definitions written from scratch, seeded by AI discovery, or created before plays were recorded count as \"Custom definition\".";

/** The label used for definitions with no recorded play. */
export const CUSTOM_DEFINITION_LABEL = "Custom definition";
