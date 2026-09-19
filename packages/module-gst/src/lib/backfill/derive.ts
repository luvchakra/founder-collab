import type { PostFinanceEventResult } from "../accounting/journal-mutations";
import type { BackfillCandidate, BackfillItemResult } from "./types";

/**
 * FIN-2: pure, no-I/O -- turns one candidate plus the result `postIssuedDocument`/
 * `postPaymentAllocation` already produced into the classified outcome the run summary and
 * the exceptions-queue routing both need. Split out from `mutations.ts` so the
 * classification itself (which refusal reasons are "correctly nothing to post" versus "a
 * real problem") is testable without a database.
 */

/** These two refusal reasons mean "correctly nothing to post," not a problem -- the exact
 * strings `postIssuedDocument`/`postPaymentAllocation` (`event-posting.ts`) return when
 * `financeEventFromDocument`/`financeEventFromAllocation` (`document-events.ts`) find
 * nothing to build an event from (a zero-value document; an allocation that doesn't settle
 * anything the ledger tracks). Every other refusal is a real thing to look at. */
const NO_CONSEQUENCE_REASONS = new Set(["This document has no accounting consequence.", "This payment doesn't settle anything the ledger tracks."]);

export function classifyBackfillResult(candidate: BackfillCandidate, result: PostFinanceEventResult): BackfillItemResult {
  const base = { kind: candidate.kind, id: candidate.id, label: candidate.label };

  if (result.posted) {
    return { ...base, outcome: result.duplicate ? "already_posted" : "posted" };
  }
  if (NO_CONSEQUENCE_REASONS.has(result.reason)) {
    return { ...base, outcome: "no_consequence", reason: result.reason };
  }
  return { ...base, outcome: "exception", reason: result.reason };
}
