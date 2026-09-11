import type { Contact } from "../contacts/types";
import type { BuyerPersona } from "../personas/types";

export type ResearchBriefConfidence = "low" | "medium" | "high";

/** DISC-OFFER-P0-06.2: "Offering Research Brief" -- the genuinely new synthesis fields;
 * "Company"/"Why Now"/"Evidence"/"Recommended Action"/"Likely Buyer" all already live
 * elsewhere (see the migration's own comment) and are referenced, not duplicated, when
 * a brief is rendered. */
export type ResearchBrief = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  offering_fit: string;
  problem_hypothesis: string;
  potential_objection: string;
  suggested_opening: string;
  confidence: ResearchBriefConfidence;
  generated_at: string;
};

/** One recorded contact matched (or not) against the offering's own buyer personas --
 * "Likely Buyer"/"Buying Committee" (doc's own fields). `persona` is null when no
 * persona's title fuzzy-matches this contact's job title: the contact is still real and
 * still shown, just without an assigned buying-committee role -- "do not invent people
 * or roles" (06.3's own instruction, honored here a story early since this deterministic
 * match has nowhere to invent from in the first place). */
export type BuyingCommitteeMatch = {
  contact: Contact;
  persona: BuyerPersona | null;
};
