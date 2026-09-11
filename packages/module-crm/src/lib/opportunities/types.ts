export type OpportunityStatus = "open" | "won" | "lost";

export type OpportunityStage = {
  id: string;
  business_id: string;
  key: string;
  name: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
};

export type Opportunity = {
  id: string;
  business_id: string;
  party_id: string;
  lead_id: string | null;
  stage_id: string | null;
  status: OpportunityStatus;
  source: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

/** CRM-04.2's default pipeline: new -> qualification -> discovery -> proposal ->
 * negotiation -> won/lost. `won`/`lost` are both terminal, sitting side by side as the
 * pipeline's two possible outcomes rather than one final "closed" stage. */
export const DEFAULT_OPPORTUNITY_STAGES: { key: string; name: string; isWon?: boolean; isLost?: boolean }[] = [
  { key: "new", name: "New" },
  { key: "qualification", name: "Qualification" },
  { key: "discovery", name: "Discovery" },
  { key: "proposal", name: "Proposal" },
  { key: "negotiation", name: "Negotiation" },
  { key: "won", name: "Won", isWon: true },
  { key: "lost", name: "Lost", isLost: true },
];
