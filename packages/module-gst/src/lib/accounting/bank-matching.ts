/**
 * Matching a bank statement line to what the ledger already knows about.
 *
 * The rule this file exists to hold: a suggestion is a suggestion. Matching is scored and
 * ranked, never applied silently, because a wrong automatic match is worse than no match
 * — it hides a real missing entry behind a plausible-looking one, and nobody goes looking
 * for a transaction that is already ticked off.
 *
 * Pure throughout, so the scoring can be reasoned about and tested without a database.
 */

export interface BankLine {
  id: string;
  txnDate: string;
  /** Signed: positive is money in, negative is money out. */
  amount: number;
  description: string;
  reference?: string | null;
}

/** A ledger entry a bank line might correspond to, flattened to what matching needs. */
export interface MatchCandidate {
  entryId: string;
  entryNumber: string | null;
  postingDate: string;
  /** Signed the same way as a bank line: what this entry did to the bank account. */
  amount: number;
  memo: string | null;
  reference?: string | null;
}

export type MatchConfidence = "exact" | "likely" | "possible";

export interface MatchSuggestion {
  candidate: MatchCandidate;
  score: number;
  confidence: MatchConfidence;
  /** Why this was suggested, in words — a match nobody can explain is a match nobody
   * should accept. */
  reasons: string[];
}

/** Amounts are compared in whole paise: a statement in rupees and a ledger in rupees can
 * still differ by a float epsilon that no human would call a difference. */
function paise(amount: number): number {
  return Math.round(amount * 100);
}

function daysApart(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** Words worth matching on: short ones and pure punctuation carry no signal, and "and"
 * appearing in both strings is not evidence of anything. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function textOverlap(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** A reference matches when either contains the other: banks truncate and decorate
 * references ("NEFT/INV-0042/ACME"), so an exact comparison would miss nearly all of the
 * real ones. */
function referencesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (left.length < 3 || right.length < 3) return false;
  return left.includes(right) || right.includes(left);
}

/** How far apart a statement date and a posting date may be and still be the same event.
 * A week covers a cheque clearing and a weekend; beyond that, two similar amounts are
 * more likely two different transactions. */
const MAX_DAYS_APART = 7;

/**
 * Scores one candidate against one bank line.
 *
 * The amount is a gate, not a signal: two transactions for different amounts are not the
 * same transaction however similar everything else looks, so a mismatch scores nothing at
 * all rather than scoring low. Sign is part of that — money in never matches money out.
 */
export function scoreMatch(line: BankLine, candidate: MatchCandidate): MatchSuggestion | null {
  if (paise(line.amount) !== paise(candidate.amount)) return null;

  const gap = daysApart(line.txnDate, candidate.postingDate);
  if (gap > MAX_DAYS_APART) return null;

  const reasons: string[] = ["Same amount"];
  let score = 60;

  if (gap === 0) {
    score += 20;
    reasons.push("Same day");
  } else {
    score += Math.max(0, 20 - gap * 3);
    reasons.push(`${gap} day${gap === 1 ? "" : "s"} apart`);
  }

  if (referencesMatch(line.reference, candidate.reference) || referencesMatch(line.reference, candidate.entryNumber)) {
    score += 25;
    reasons.push("Reference matches");
  }

  const overlap = textOverlap(line.description, candidate.memo ?? "");
  if (overlap > 0) {
    score += Math.round(overlap * 15);
    reasons.push("Description looks similar");
  }

  const confidence: MatchConfidence = score >= 95 ? "exact" : score >= 75 ? "likely" : "possible";
  return { candidate, score, confidence, reasons };
}

/**
 * The best candidates for one line, strongest first.
 *
 * Returns several rather than one, and never picks: two identical payments from the same
 * customer on the same day are genuinely ambiguous, and the only honest thing a matcher
 * can do there is show both and let someone who knows decide.
 */
export function suggestMatches(
  line: BankLine,
  candidates: MatchCandidate[],
  limit = 3,
): MatchSuggestion[] {
  return candidates
    .map((candidate) => scoreMatch(line, candidate))
    .filter((suggestion): suggestion is MatchSuggestion => suggestion !== null)
    .sort((a, b) => b.score - a.score || a.candidate.postingDate.localeCompare(b.candidate.postingDate))
    .slice(0, limit);
}

/**
 * Whether a suggestion is strong enough to offer as a one-click accept.
 *
 * Only when it is both confident *and* unrivalled: a perfect score means nothing if a
 * second candidate scores the same, because then the matcher cannot tell them apart and
 * offering either as "the" match is a guess dressed as a finding.
 */
export function isSafeAutoMatch(suggestions: MatchSuggestion[]): boolean {
  const [best, second] = suggestions;
  if (!best || best.confidence !== "exact") return false;
  return !second || second.score < best.score;
}

export interface ReconciliationPosition {
  /** What the bank says the account held at the statement's close. */
  statementClosing: number;
  /** What the ledger says, from its own postings. */
  ledgerClosing: number;
  /** Lines the bank reported that the ledger has nothing for yet. */
  unmatchedCount: number;
  unmatchedTotal: number;
  difference: number;
  reconciled: boolean;
}

/**
 * Where a reconciliation stands.
 *
 * `difference` is statement minus ledger, in that order, so a positive number reads as
 * "the bank has more than the books know about" — which is the direction someone
 * investigating actually thinks in.
 */
export function reconciliationPosition(
  statementClosing: number,
  ledgerClosing: number,
  unmatched: { amount: number }[],
): ReconciliationPosition {
  const difference = Math.round((statementClosing - ledgerClosing) * 100) / 100;
  return {
    statementClosing,
    ledgerClosing,
    unmatchedCount: unmatched.length,
    unmatchedTotal: Math.round(unmatched.reduce((sum, t) => sum + t.amount, 0) * 100) / 100,
    difference,
    // Reconciled means the two agree *and* nothing is left hanging: a statement that
    // happens to net to the same figure while three lines are still unexplained is not
    // reconciled, it is a coincidence.
    reconciled: paise(difference) === 0 && unmatched.length === 0,
  };
}

/**
 * A stable fingerprint for an imported line, so re-importing an overlapping statement
 * doesn't double every shared row.
 *
 * Derived from the line's own content rather than its position in the file, because the
 * same transaction exported twice sits on different rows but is the same transaction. The
 * database's unique index on it is what actually enforces this; this only has to be
 * deterministic.
 */
export function importFingerprint(line: Omit<BankLine, "id">): string {
  const normalised = line.description.trim().toLowerCase().replace(/\s+/g, " ");
  const reference = (line.reference ?? "").trim().toLowerCase();
  return [line.txnDate, paise(line.amount), normalised, reference].join("|");
}
