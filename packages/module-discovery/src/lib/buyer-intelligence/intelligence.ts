import { matchBuyingCommittee } from "../research-briefs/match-committee";
import type { Contact } from "../contacts/types";
import type { BuyerPersona } from "../personas/types";
import type { EvidenceItem } from "../research/types";
import { deriveContactability } from "./contactability";
import { deriveRelevance } from "./relevance";
import { deriveSeniority } from "./seniority";
import { findSupportingEvidence } from "./supporting-evidence";
import type { BuyerPersonIntelligence } from "./types";

/**
 * DISC-OFFER-P0-06.3: combines one real contact's persona match (06.2's
 * `matchBuyingCommittee`) with the seniority/relevance/contactability/supporting-
 * evidence derivations above into one candidate-person view. Confidence reflects how
 * much is actually known about this specific person -- a real title, a persona/ICP
 * match, supporting evidence, a real contact channel -- not zero-filled the way 05.2's
 * own `computeOpportunityScore` already established for missing score components: a
 * person with nothing on file gets "low", never a guessed higher tier.
 */
export function buildBuyerPersonIntelligence(input: {
  contact: Contact;
  persona: BuyerPersona | null;
  icpRoles: string[];
  evidence: EvidenceItem[];
}): BuyerPersonIntelligence {
  const { contact, persona, icpRoles, evidence } = input;

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || "Unnamed contact";
  const seniority = deriveSeniority(contact.job_title);
  const relevance = deriveRelevance({ persona, jobTitle: contact.job_title, icpRoles });
  const contactability = deriveContactability(contact);
  const supportingEvidence = findSupportingEvidence(contact, evidence);

  const knownSignals = [
    Boolean(contact.job_title && contact.job_title.trim()),
    relevance.level !== "unknown",
    supportingEvidence.length > 0,
    contactability.level !== "low",
  ];
  const populated = knownSignals.filter(Boolean).length;
  const confidence: BuyerPersonIntelligence["confidence"] = populated >= 3 ? "high" : populated >= 1 ? "medium" : "low";

  return {
    contact,
    name,
    title: contact.job_title,
    seniority,
    persona,
    relevance: relevance.level,
    relevanceReason: relevance.reason,
    contactability: contactability.level,
    contactabilityReason: contactability.reason,
    supportingEvidence,
    confidence,
  };
}

/** Whole-prospect view -- every real contact, matched against every real buyer persona
 * (06.2's own committee match), each enriched into a full `BuyerPersonIntelligence` row.
 * A single shared entry point for both the cached DB-reading query (queries.ts) and the
 * AI research-brief flow (`generateResearchBrief`, which already has contacts/personas/
 * icp/research in hand and reuses this rather than re-deriving the same list). */
export function computeBuyerIntelligence(
  contacts: Contact[],
  personas: BuyerPersona[],
  icpRoles: string[],
  evidence: EvidenceItem[],
): BuyerPersonIntelligence[] {
  return matchBuyingCommittee(contacts, personas).map(({ contact, persona }) =>
    buildBuyerPersonIntelligence({ contact, persona, icpRoles, evidence }),
  );
}
