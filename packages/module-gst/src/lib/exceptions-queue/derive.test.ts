import { describe, expect, it } from "vitest";
import { deriveFilingBlockerExceptions, deriveFinanceExceptions, deriveItcAtRiskExceptions, deriveUnpostedDocumentExceptions } from "./derive";
import type { UnpostedDocument } from "../accounting/dashboard-queries";
import type { ItcAssessment } from "../accounting/itc";
import type { ReadinessCheck } from "../accounting/filing-readiness";

function doc(overrides: Partial<UnpostedDocument>): UnpostedDocument {
  return {
    id: "doc-1",
    doc_type: "invoice",
    number: "INV-001",
    doc_date: "2026-09-10",
    total_amount: 1180,
    source_module: "discovery",
    ...overrides,
  };
}

function itc(overrides: Partial<ItcAssessment>): ItcAssessment {
  return {
    claimable: 0,
    atRisk: 0,
    unclaimed: 0,
    excludedNoGstin: 0,
    risk: "clear",
    booksAgree: true,
    headline: "Your input credit matches what GSTR-2B supports.",
    ...overrides,
  };
}

function check(overrides: Partial<ReadinessCheck>): ReadinessCheck {
  return { key: "accounts", label: "Books are set up", status: "block", detail: "No chart of accounts.", ...overrides };
}

describe("deriveUnpostedDocumentExceptions", () => {
  it("produces one candidate per document, keyed by document id", () => {
    const candidates = deriveUnpostedDocumentExceptions([doc({ id: "doc-1", number: "INV-1" }), doc({ id: "doc-2", number: "INV-2" })]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.exceptionType).toBe("unposted_document");
    expect(candidates.map((c) => c.referenceKey)).toEqual(["doc-1", "doc-2"]);
    expect(candidates[0]!.summary).toMatch(/INV-1/);
  });

  it("falls back to a truncated id when the document has no number yet", () => {
    const candidates = deriveUnpostedDocumentExceptions([doc({ number: null, id: "abcdefgh-1234" })]);
    expect(candidates[0]!.summary).toMatch(/abcdefgh/);
  });

  it("produces nothing for an empty list", () => {
    expect(deriveUnpostedDocumentExceptions([])).toEqual([]);
  });
});

describe("deriveItcAtRiskExceptions", () => {
  it("produces nothing when the risk is clear", () => {
    expect(deriveItcAtRiskExceptions("2026-09", itc({ risk: "clear" }))).toEqual([]);
  });

  it("produces nothing when credit is merely unclaimed (a missed opportunity, not a risk)", () => {
    expect(deriveItcAtRiskExceptions("2026-09", itc({ risk: "leaving_credit", unclaimed: 500 }))).toEqual([]);
  });

  it("produces nothing when the assessment itself is unknown (no 2B imported)", () => {
    expect(deriveItcAtRiskExceptions("2026-09", itc({ risk: "unknown" }))).toEqual([]);
  });

  it("produces one candidate keyed by the GST period when over-claimed", () => {
    const candidates = deriveItcAtRiskExceptions("2026-09", itc({ risk: "over_claimed", atRisk: 3500 }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.exceptionType).toBe("itc_at_risk");
    expect(candidates[0]!.referenceKey).toBe("2026-09");
    expect(candidates[0]!.impact).toMatch(/3,500/);
  });
});

describe("deriveFilingBlockerExceptions", () => {
  it("excludes the 'posted' check -- already covered per-document by unposted_document exceptions", () => {
    const candidates = deriveFilingBlockerExceptions("2026-09", [check({ key: "posted", label: "Everything is posted" })]);
    expect(candidates).toEqual([]);
  });

  it("produces one candidate per remaining blocker, keyed by period and check key", () => {
    const candidates = deriveFilingBlockerExceptions("2026-09", [
      check({ key: "accounts", label: "Books are set up", detail: "No chart of accounts." }),
      check({ key: "reconciled", label: "Ledger agrees with the return", detail: "Off by ₹100.", action: "Fix the gap." }),
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.exceptionType).toBe("filing_blocker");
    expect(candidates[0]!.referenceKey).toBe("2026-09:accounts");
    expect(candidates[1]!.suggestedAction).toBe("Fix the gap.");
  });

  it("has no suggested action when the check itself carries none", () => {
    const candidates = deriveFilingBlockerExceptions("2026-09", [check({ key: "accounts", action: undefined })]);
    expect(candidates[0]!.suggestedAction).toBeNull();
  });
});

describe("deriveFinanceExceptions", () => {
  it("combines all three sources", () => {
    const candidates = deriveFinanceExceptions({
      unposted: [doc({ id: "doc-1" })],
      gstPeriod: "2026-09",
      itc: itc({ risk: "over_claimed", atRisk: 200 }),
      blockers: [check({ key: "reconciled" })],
    });
    expect(candidates.map((c) => c.exceptionType).sort()).toEqual(["filing_blocker", "itc_at_risk", "unposted_document"]);
  });

  it("skips ITC entirely when there is no ledger to assess it against (itc: null)", () => {
    const candidates = deriveFinanceExceptions({
      unposted: [],
      gstPeriod: "2026-09",
      itc: null,
      blockers: [check({ key: "accounts" })],
    });
    expect(candidates.map((c) => c.exceptionType)).toEqual(["filing_blocker"]);
  });

  it("produces nothing when everything is clean", () => {
    expect(deriveFinanceExceptions({ unposted: [], gstPeriod: "2026-09", itc: itc({ risk: "clear" }), blockers: [] })).toEqual([]);
  });
});
