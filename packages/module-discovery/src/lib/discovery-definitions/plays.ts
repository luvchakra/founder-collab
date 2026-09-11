/**
 * DISC-OFFER-P0-04.2 "Discovery Play" -- the backlog's own exact list of ten
 * founder-friendly strategy presets. Each is a starting point for a new Discovery
 * Definition (name + desired signals), never a definition created on its own: the
 * founder still reviews it in the normal create dialog and clicks Create, same
 * "pre-filled but not auto-saved" discipline as every other suggestion in this platform
 * (e.g. the Offering Setup Wizard's AI suggestions). No AI call involved here -- these
 * are fixed, hand-written presets, not generated.
 */
export type DiscoveryPlay = {
  key: string;
  label: string;
  description: string;
  desiredSignals: string[];
};

export const DISCOVERY_PLAYS: DiscoveryPlay[] = [
  {
    key: "recently_funded",
    label: "Recently Funded",
    description: "Companies that just closed a funding round and are likely to spend on new tools/services.",
    desiredSignals: ["Recently announced a funding round"],
  },
  {
    key: "rapid_growth",
    label: "Rapid Growth",
    description: "Companies showing fast headcount or revenue growth.",
    desiredSignals: ["Rapid headcount growth", "Rapid revenue growth"],
  },
  {
    key: "hiring_relevant_roles",
    label: "Hiring Relevant Roles",
    description: "Companies actively hiring for roles relevant to this offering.",
    desiredSignals: ["Actively hiring for roles relevant to this offering"],
  },
  {
    key: "new_executive",
    label: "New Executive",
    description: "Companies with a newly appointed executive who may be re-evaluating vendors.",
    desiredSignals: ["Recently appointed a new executive in a relevant function"],
  },
  {
    key: "technology_migration",
    label: "Technology Migration",
    description: "Companies migrating off or onto a relevant technology/platform.",
    desiredSignals: ["Announced or is undergoing a relevant technology migration"],
  },
  {
    key: "competitor_customers",
    label: "Competitor Customers",
    description: "Companies known to be using a competitor's product/service.",
    desiredSignals: ["Currently a customer of a known competitor"],
  },
  {
    key: "regulatory_pressure",
    label: "Regulatory Pressure",
    description: "Companies facing new regulatory requirements relevant to this offering.",
    desiredSignals: ["Facing a new regulatory requirement relevant to this offering"],
  },
  {
    key: "negative_reviews",
    label: "Negative Reviews",
    description: "Companies whose customers are leaving negative reviews about a relevant pain point.",
    desiredSignals: ["Recent negative reviews mentioning a relevant pain point"],
  },
  {
    key: "expansion",
    label: "Expansion",
    description: "Companies expanding into new markets, locations, or product lines.",
    desiredSignals: ["Recently announced expansion into a new market, location, or product line"],
  },
  {
    key: "multiple_buying_signals",
    label: "Multiple Buying Signals",
    description: "Companies showing several buying signals at once -- the strongest combined indicator.",
    desiredSignals: ["Two or more other buying signals present at the same time"],
  },
];
