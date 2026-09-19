import { describe, expect, it } from "vitest";
import { classifyBackfillResult } from "./derive";
import type { BackfillCandidate } from "./types";
import type { PostFinanceEventResult } from "../accounting/journal-mutations";

function candidate(overrides: Partial<BackfillCandidate> = {}): BackfillCandidate {
  return { kind: "document", id: "doc-1", documentId: "doc-1", label: "Invoice INV-1", ...overrides };
}

describe("classifyBackfillResult", () => {
  it("classifies a freshly posted entry as posted", () => {
    const result: PostFinanceEventResult = { posted: true, entryId: "entry-1", duplicate: false };
    expect(classifyBackfillResult(candidate(), result)).toEqual({
      kind: "document",
      id: "doc-1",
      label: "Invoice INV-1",
      outcome: "posted",
    });
  });

  it("classifies a redelivered/re-run entry as already_posted", () => {
    const result: PostFinanceEventResult = { posted: true, entryId: "entry-1", duplicate: true };
    expect(classifyBackfillResult(candidate(), result).outcome).toBe("already_posted");
  });

  it("classifies 'no accounting consequence' as no_consequence, not an exception", () => {
    const result: PostFinanceEventResult = { posted: false, reason: "This document has no accounting consequence." };
    const item = classifyBackfillResult(candidate(), result);
    expect(item.outcome).toBe("no_consequence");
    expect(item.reason).toBe("This document has no accounting consequence.");
  });

  it("classifies 'doesn't settle anything the ledger tracks' as no_consequence for a payment allocation", () => {
    const result: PostFinanceEventResult = { posted: false, reason: "This payment doesn't settle anything the ledger tracks." };
    const item = classifyBackfillResult(candidate({ kind: "payment_allocation", id: "alloc-1", label: "Payment on Invoice INV-1" }), result);
    expect(item.outcome).toBe("no_consequence");
  });

  it("classifies a missing account mapping as a real exception", () => {
    const result: PostFinanceEventResult = { posted: false, reason: "No account is set up for accounts_receivable. Finish setting up the chart of accounts and this will post." };
    const item = classifyBackfillResult(candidate(), result);
    expect(item.outcome).toBe("exception");
    expect(item.reason).toMatch(/chart of accounts/);
  });

  it("classifies an unbalanced-entry refusal as a real exception", () => {
    const result: PostFinanceEventResult = { posted: false, reason: "Rule invoice.finalized produced an unbalanced entry: debits != credits." };
    expect(classifyBackfillResult(candidate(), result).outcome).toBe("exception");
  });

  it("carries the candidate's own label and id through unchanged", () => {
    const result: PostFinanceEventResult = { posted: false, reason: "No cost is recorded for these goods, so no COGS entry is created." };
    const item = classifyBackfillResult(candidate({ kind: "payment_allocation", id: "alloc-9", label: "Payment on Bill B-9" }), result);
    expect(item).toEqual({ kind: "payment_allocation", id: "alloc-9", label: "Payment on Bill B-9", outcome: "exception", reason: result.reason });
  });
});
