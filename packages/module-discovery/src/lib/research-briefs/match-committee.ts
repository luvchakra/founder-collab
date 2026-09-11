import { fuzzyIncludes } from "../scoring/score-prospect";
import type { Contact } from "../contacts/types";
import type { BuyerPersona } from "../personas/types";
import type { BuyingCommitteeMatch } from "./types";

/**
 * DISC-OFFER-P0-06.2: "Likely Buyer" / "Buying Committee" -- deterministic, no AI call
 * (CLAUDE.md dev principle #4/#5), and structurally incapable of inventing a person or
 * role (06.3's own explicit instruction): every contact returned is a real
 * `discovery.contacts` row, and a persona is only ever attached when its own `title`
 * fuzzy-matches (reusing the same `fuzzyIncludes` 05.5's negative-signal detection
 * already reuses from `score-prospect.ts`) that contact's real `job_title`. A contact
 * with no matching persona is still returned -- unassigned, not hidden -- since a real
 * person with an unrecognized title is still a candidate buyer, just one this module
 * can't yet characterize.
 */
export function matchBuyingCommittee(contacts: Contact[], personas: BuyerPersona[]): BuyingCommitteeMatch[] {
  return contacts.map((contact) => {
    const persona = personas.find((p) => fuzzyIncludes([p.title], contact.job_title)) ?? null;
    return { contact, persona };
  });
}
