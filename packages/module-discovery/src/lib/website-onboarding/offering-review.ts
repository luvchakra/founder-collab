import type { OfferingType } from "../offerings/types";

/**
 * DISC-OFFER-P0-09.4 "Offering Review Before Activation" -- the shape one proposed
 * offering takes while a founder is reviewing it (editing, merging, or removing it)
 * before "Create Offerings" turns the surviving list into real `discovery.products`
 * rows. A plain subset of `WebsiteOfferingCandidate` (lib/ai/schemas.ts) -- `evidence`/
 * `confidence` still display during review but never travel into the created offering,
 * so they're not part of this type.
 */
export type EditableOfferingCandidate = {
  name: string;
  description: string;
  offeringType: OfferingType | null;
  problemSolved: string | null;
  targetCustomer: string | null;
  targetIndustry: string | null;
  valueProposition: string | null;
  sourcePages: string[];
};

/**
 * DISC-OFFER-P0-09.4's own "[Merge]" action -- combines two or more selected proposed
 * offerings into one, as a deterministic starting point the founder then reviews/edits
 * (CLAUDE.md dev principle #4: no LLM call for this, it's plain field consolidation, not
 * a judgment call). Rules, in order:
 * - name/offeringType/problemSolved/targetCustomer/targetIndustry/valueProposition: the
 *   first candidate's own non-empty value wins; a later candidate's value only fills a
 *   gap the earlier ones left null.
 * - description: every distinct (trimmed) description, joined -- a merge is explicitly
 *   about consolidating separately-described things, so losing one side's description
 *   silently would defeat the point.
 * - sourcePages: the union, deduplicated, in first-seen order.
 *
 * Throws on an empty list -- merging nothing is a caller bug, not a valid "no-op" the
 * function should silently accept.
 */
export function mergeOfferingCandidates(candidates: EditableOfferingCandidate[]): EditableOfferingCandidate {
  if (candidates.length === 0) {
    throw new Error("Cannot merge an empty list of offerings.");
  }

  const descriptions: string[] = [];
  const seenDescriptions = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.description.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seenDescriptions.has(key)) continue;
    seenDescriptions.add(key);
    descriptions.push(trimmed);
  }

  const sourcePages = Array.from(new Set(candidates.flatMap((candidate) => candidate.sourcePages)));

  return {
    name: candidates[0]!.name,
    description: descriptions.join(" "),
    offeringType: firstNonNull(candidates, (c) => c.offeringType),
    problemSolved: firstNonNull(candidates, (c) => c.problemSolved),
    targetCustomer: firstNonNull(candidates, (c) => c.targetCustomer),
    targetIndustry: firstNonNull(candidates, (c) => c.targetIndustry),
    valueProposition: firstNonNull(candidates, (c) => c.valueProposition),
    sourcePages,
  };
}

function firstNonNull<T>(candidates: EditableOfferingCandidate[], select: (c: EditableOfferingCandidate) => T | null): T | null {
  for (const candidate of candidates) {
    const value = select(candidate);
    if (value !== null && value !== "") return value;
  }
  return null;
}

/**
 * DISC-OFFER-P0-09.4's own "Create Offerings" -- maps one reviewed candidate onto
 * `createOffering()`'s own input shape (`lib/offerings/mutations.ts`). The Offering row
 * has a single flat `target_market` field, not the candidate's separate targetCustomer/
 * targetIndustry -- combined here (customer first, industry second) rather than
 * discarding one of the two.
 */
export function offeringInputFromCandidate(candidate: EditableOfferingCandidate): {
  name: string;
  description: string | null;
  offeringType: OfferingType | null;
  primaryProblem: string | null;
  targetMarket: string | null;
  valueProposition: string | null;
} {
  return {
    name: candidate.name.trim(),
    description: candidate.description.trim() || null,
    offeringType: candidate.offeringType,
    primaryProblem: candidate.problemSolved,
    targetMarket: combineTargetMarket(candidate.targetCustomer, candidate.targetIndustry),
    valueProposition: candidate.valueProposition,
  };
}

function combineTargetMarket(targetCustomer: string | null, targetIndustry: string | null): string | null {
  const parts = [targetCustomer, targetIndustry].filter((part): part is string => !!part && part.trim().length > 0);
  if (parts.length === 0) return null;
  return parts.join(" — "); // em dash, matches this module's own "A — B" convention
}
