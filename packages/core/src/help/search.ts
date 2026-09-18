import { listSections } from "./guides";
import type { HelpSectionRef } from "./types";

/**
 * Finding the handful of guide sections a question is about.
 *
 * Deliberately deterministic keyword scoring rather than an embedding index or an LLM
 * pass: this is a few dozen sections of our own documentation, the platform's engineering
 * rules say not to put a language model where a plain algorithm will do, and a retrieval
 * step that can be read, tested and reasoned about beats one that cannot. The help
 * assistant uses this to decide *what to read*; the model only writes the answer.
 */

export type ScoredSection = HelpSectionRef & { score: number };

/** Words that appear in almost every section, so matching them says nothing about which
 * section is the right one. Kept short on purpose -- an over-eager stoplist throws away
 * the words that actually distinguish a question ("how do I *close* a period"). */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for",
  "from", "how", "i", "if", "in", "is", "it", "its", "my", "of", "on", "or", "that",
  "the", "then", "there", "this", "to", "was", "what", "when", "where", "which", "why",
  "will", "with", "you", "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * A crude but effective stem: folds plurals and the -ing/-ed forms together, so
 * "accounts"/"accounting" and "reconciled"/"reconciling" each collapse to one term. Not a
 * real stemmer, and it does not try to be -- it only has to be applied identically to the
 * query and to the index, which is what makes a partial rule harmless.
 */
export function stem(token: string): string {
  for (const suffix of ["ies", "ing", "ed", "s"]) {
    if (token.length > suffix.length + 2 && token.endsWith(suffix)) {
      return suffix === "ies" ? `${token.slice(0, -3)}y` : token.slice(0, -suffix.length);
    }
  }
  return token;
}

function terms(text: string): string[] {
  return tokenize(text).map(stem);
}

/** A heading is the section's own statement of what it is about, so a hit there is worth
 * much more than a hit in the body -- without this, a long section that mentions a word
 * in passing outranks the short section actually named after it. */
const HEADING_WEIGHT = 8;
const GUIDE_TITLE_WEIGHT = 3;
/** The whole question appearing verbatim is the strongest signal there is. */
const PHRASE_WEIGHT = 12;

function scoreSection(section: HelpSectionRef, queryTerms: string[], query: string): number {
  const headingTerms = new Set(terms(section.heading));
  const titleTerms = new Set(terms(section.guideTitle));
  const bodyTerms = terms(section.body);

  const bodyCounts = new Map<string, number>();
  for (const term of bodyTerms) bodyCounts.set(term, (bodyCounts.get(term) ?? 0) + 1);

  let score = 0;
  for (const term of queryTerms) {
    if (headingTerms.has(term)) score += HEADING_WEIGHT;
    if (titleTerms.has(term)) score += GUIDE_TITLE_WEIGHT;
    const count = bodyCounts.get(term) ?? 0;
    // Diminishing returns: a section that says "invoice" thirty times is not thirty times
    // more about invoices than one that says it twice.
    if (count > 0) score += 1 + Math.log2(count);
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length > 6 && section.body.toLowerCase().includes(normalizedQuery)) {
    score += PHRASE_WEIGHT;
  }

  return score;
}

/**
 * The sections most likely to answer `query`, best first. Returns an empty array for a
 * query that matches nothing at all rather than the least-bad section -- "I don't have
 * anything on that" is a better answer than a confident wrong link.
 */
export function searchHelp(query: string, limit = 5): ScoredSection[] {
  const queryTerms = [...new Set(terms(query))];
  if (queryTerms.length === 0) return [];

  return listSections()
    .map((section) => ({ ...section, score: scoreSection(section, queryTerms, query) }))
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score || a.heading.localeCompare(b.heading))
    .slice(0, limit);
}
