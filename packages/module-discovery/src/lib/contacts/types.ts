import { PERSONA_ROLE_LABEL, type PersonaRole } from "../personas/types";

export type ContactStatus = "active" | "inactive";

/** DISC-OFFER-P1-04.3 "Offering-Specific Contact Relevance": the part this person plays in
 * buying THIS offering, set by the founder on the offering-scoped contact row. The
 * buyer-persona role vocabulary plus `not_involved`. Null = not set; relevance is then
 * derived from persona/ICP-role matching. */
export type BuyingRole = PersonaRole | "not_involved";

export const BUYING_ROLE_LABEL: Record<BuyingRole, string> = {
  ...PERSONA_ROLE_LABEL,
  not_involved: "Not involved",
};

export const BUYING_ROLE_VALUES = Object.keys(BUYING_ROLE_LABEL) as BuyingRole[];

export function parseBuyingRole(raw: string | null | undefined): BuyingRole | null {
  return raw && (BUYING_ROLE_VALUES as string[]).includes(raw) ? (raw as BuyingRole) : null;
}

export type Contact = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  /** DISC-OFFER-P1-04.3 -- see `BuyingRole`. */
  buying_role: BuyingRole | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
};
