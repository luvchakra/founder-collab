/** DISC-OFFER-P0-02.3: "Offering Buyer Persona Definition" -- who, within a buying
 * committee, an offering is sold to. Distinct from icp_profiles.roles (a flat list of
 * job titles describing the target company's makeup) -- a persona additionally carries
 * a buying-committee role and a priority, e.g. per the backlog's own example:
 * "CISO -- executive buyer", "IAM Director -- decision maker", "Security Architect --
 * influencer". */
export type PersonaRole = "executive_buyer" | "decision_maker" | "influencer" | "budget_stakeholder" | "user" | "other";

export const PERSONA_ROLE_LABEL: Record<PersonaRole, string> = {
  executive_buyer: "Executive buyer",
  decision_maker: "Decision maker",
  influencer: "Influencer",
  budget_stakeholder: "Budget stakeholder",
  user: "User",
  other: "Other",
};

export const PERSONA_ROLE_VALUES = Object.keys(PERSONA_ROLE_LABEL) as PersonaRole[];

export type PersonaPriority = "high" | "medium" | "low";

export const PERSONA_PRIORITY_LABEL: Record<PersonaPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PERSONA_PRIORITY_VALUES = Object.keys(PERSONA_PRIORITY_LABEL) as PersonaPriority[];

export type BuyerPersona = {
  id: string;
  workspace_id: string;
  title: string;
  role_in_committee: PersonaRole;
  priority: PersonaPriority;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
