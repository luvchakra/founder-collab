import { matchBuyingCommittee } from "../research-briefs/match-committee";
import { PERSONA_ROLE_LABEL, type BuyerPersona } from "../personas/types";
import { BUYING_ROLE_LABEL, type Contact } from "./types";

/**
 * DISC-OFFER-P1-04.3 "Offering-Specific Contact Relevance": the same real person, found
 * under this business's other offerings, with the role they have THERE. Each offering
 * keeps its own contact row and its own role -- this only reads them side by side.
 */
export type OtherOfferingRole = {
  productId: string;
  productName: string;
  /** "Decision maker", "Not involved", ... or null when that offering has no role for them. */
  roleLabel: string | null;
  /** Where the role comes from: set by the founder on that row, or matched to one of that
   * offering's buyer personas by job title. */
  roleSource: "set" | "persona" | null;
};

/**
 * Identifies a person across offerings: the email when there is one (the reliable key),
 * otherwise the full name -- only ever compared within the same account, so two people
 * with the same name at different companies never meet. Null when there is nothing to
 * match on (no email and no full name): such a contact is never linked to anyone.
 */
export function personKeyFor(contact: Pick<Contact, "email" | "first_name" | "last_name">): string | null {
  const email = contact.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const first = contact.first_name?.trim().toLowerCase();
  const last = contact.last_name?.trim().toLowerCase();
  if (first && last) return `name:${first} ${last}`.replace(/\s+/g, " ");
  return null;
}

export function roleFor(contact: Contact, personas: BuyerPersona[]): Pick<OtherOfferingRole, "roleLabel" | "roleSource"> {
  if (contact.buying_role) return { roleLabel: BUYING_ROLE_LABEL[contact.buying_role], roleSource: "set" };
  const persona = matchBuyingCommittee([contact], personas)[0]?.persona ?? null;
  if (persona) return { roleLabel: PERSONA_ROLE_LABEL[persona.role_in_committee], roleSource: "persona" };
  return { roleLabel: null, roleSource: null };
}

/**
 * For each of this offering's contacts, the same person's role under each other offering
 * (contacts already limited to the same account by the caller). Keyed by this offering's
 * contact id; people found nowhere else are absent.
 */
export function findSamePersonInOtherOfferings(
  current: Contact[],
  elsewhere: { contact: Contact; productId: string; productName: string; personas: BuyerPersona[] }[],
): Map<string, OtherOfferingRole[]> {
  const byKey = new Map<string, OtherOfferingRole[]>();
  for (const other of elsewhere) {
    const key = personKeyFor(other.contact);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    if (list.some((r) => r.productId === other.productId)) continue;
    list.push({ productId: other.productId, productName: other.productName, ...roleFor(other.contact, other.personas) });
    byKey.set(key, list);
  }

  const result = new Map<string, OtherOfferingRole[]>();
  for (const contact of current) {
    const key = personKeyFor(contact);
    const matches = key ? byKey.get(key) : undefined;
    if (matches && matches.length > 0) result.set(contact.id, [...matches].sort((a, b) => a.productName.localeCompare(b.productName)));
  }
  return result;
}
