import type { Contact } from "../contacts/types";
import type { EvidenceItem } from "../research/types";

/**
 * DISC-OFFER-P0-06.3: "supporting evidence" -- a plain substring match of a real
 * contact's own name/job title against research evidence already on record (06.1),
 * never a new AI call and never evidence invented for a person the research didn't
 * actually mention. Deliberately checks `supporting_signal` too, not just `statement`,
 * since an evidence item can back a claim (e.g. "New CISO hired") without the person's
 * name appearing in the statement's own prose.
 */
export function findSupportingEvidence(
  contact: Pick<Contact, "first_name" | "last_name" | "job_title">,
  evidence: EvidenceItem[],
): EvidenceItem[] {
  const needles = [contact.first_name, contact.last_name, contact.job_title]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.toLowerCase());
  if (needles.length === 0) return [];

  return evidence.filter((item) => {
    const haystack = `${item.statement} ${item.supporting_signal ?? ""}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}
