import type { WebsiteOfferingCandidate } from "../ai/schemas";

/**
 * DISC-OFFER-P0-09.3's own structural enforcement, the same "a prompt is a request, not a
 * guarantee" discipline `sanitizeWebsiteProfile()` already applies to the business
 * profile (CLAUDE.md dev principle #4: never leave a deterministic check to the model).
 * Pure and deterministic.
 *
 * - Drops a candidate with no real name (nothing to show, nothing to activate in 09.4).
 * - Trims name/description/evidence and every nullable text field; a blank nullable field
 *   becomes null rather than an empty string.
 * - Clamps confidence into [0, 1] (a model can return an out-of-range or NaN-ish number).
 * - Filters `sourcePages` down to only the URLs this run actually crawled -- "extracted
 *   facts must be traceable to source pages" means a page the model names but never
 *   fetched is not a real source, so it's dropped rather than trusted.
 * - Deduplicates candidates whose (trimmed, case-insensitive) name matches exactly, as a
 *   deterministic backstop on top of the prompt's own "consolidate related
 *   pages/features" instruction -- keeps the first occurrence and merges any additional
 *   source pages/evidence the later duplicate named, rather than silently dropping
 *   evidence the model did find.
 */
export function sanitizeOfferingCandidates(
  candidates: WebsiteOfferingCandidate[],
  crawledPageUrls: string[],
): WebsiteOfferingCandidate[] {
  const knownUrls = new Set(crawledPageUrls);
  const byNameKey = new Map<string, WebsiteOfferingCandidate>();
  const order: string[] = [];

  for (const raw of candidates) {
    const name = raw.name.trim();
    if (!name) continue;

    const candidate: WebsiteOfferingCandidate = {
      name,
      description: raw.description.trim(),
      offeringType: raw.offeringType,
      problemSolved: nullableText(raw.problemSolved),
      targetCustomer: nullableText(raw.targetCustomer),
      targetIndustry: nullableText(raw.targetIndustry),
      valueProposition: nullableText(raw.valueProposition),
      evidence: raw.evidence.trim(),
      confidence: clampConfidence(raw.confidence),
      sourcePages: dedupeUrls(raw.sourcePages.filter((url) => knownUrls.has(url))),
    };

    const key = name.toLowerCase();
    const existing = byNameKey.get(key);
    if (!existing) {
      byNameKey.set(key, candidate);
      order.push(key);
      continue;
    }
    // Deterministic merge of an exact-name duplicate: keep the first candidate's own
    // fields (whichever page mentioned it first) but union in any source pages the
    // duplicate named that the first didn't.
    existing.sourcePages = dedupeUrls([...existing.sourcePages, ...candidate.sourcePages]);
  }

  return order.map((key) => byNameKey.get(key)!);
}

function nullableText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}
