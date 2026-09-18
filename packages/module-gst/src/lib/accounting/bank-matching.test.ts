import { describe, expect, it } from "vitest";
import {
  importFingerprint,
  isSafeAutoMatch,
  reconciliationPosition,
  scoreMatch,
  suggestMatches,
  type BankLine,
  type MatchCandidate,
} from "./bank-matching";

function line(over: Partial<BankLine> = {}): BankLine {
  return {
    id: "line-1",
    txnDate: "2026-09-17",
    amount: 1180,
    description: "NEFT CR ACME INDUSTRIES",
    reference: "NEFT/INV-0042/ACME",
    ...over,
  };
}

function candidate(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    entryId: "entry-1",
    entryNumber: "JE/26-27/0001",
    postingDate: "2026-09-17",
    amount: 1180,
    memo: "Payment received from Acme Industries",
    reference: "INV-0042",
    ...over,
  };
}

describe("the amount is a gate, not a signal", () => {
  // Two transactions for different amounts are not the same transaction, however similar
  // everything else looks.
  it("refuses a candidate for a different amount outright", () => {
    expect(scoreMatch(line(), candidate({ amount: 1180.5 }))).toBeNull();
  });

  it("never matches money in against money out", () => {
    expect(scoreMatch(line({ amount: 1180 }), candidate({ amount: -1180 }))).toBeNull();
  });

  // A statement in rupees and a ledger in rupees can differ by a float epsilon no human
  // would call a difference.
  it("compares in whole paise, so floating point never blocks a real match", () => {
    expect(scoreMatch(line({ amount: 0.1 + 0.2 }), candidate({ amount: 0.3 }))).not.toBeNull();
  });
});

describe("how far apart two dates may be", () => {
  it("scores a same-day match highest", () => {
    const same = scoreMatch(line(), candidate())!;
    const later = scoreMatch(line(), candidate({ postingDate: "2026-09-14" }))!;
    expect(same.score).toBeGreaterThan(later.score);
  });

  it("still matches across a cheque clearing and a weekend", () => {
    expect(scoreMatch(line(), candidate({ postingDate: "2026-09-12" }))).not.toBeNull();
  });

  // Beyond a week, two similar amounts are more likely two different transactions.
  it("refuses a candidate further off than a week", () => {
    expect(scoreMatch(line(), candidate({ postingDate: "2026-09-01" }))).toBeNull();
  });

  it("looks the same distance forwards and backwards", () => {
    const before = scoreMatch(line(), candidate({ postingDate: "2026-09-15" }))!;
    const after = scoreMatch(line(), candidate({ postingDate: "2026-09-19" }))!;
    expect(before.score).toBe(after.score);
  });
});

describe("references", () => {
  // Banks truncate and decorate references, so an exact comparison would miss nearly all
  // of the real ones.
  it("matches a reference buried inside the bank's own decoration", () => {
    const match = scoreMatch(line(), candidate())!;
    expect(match.reasons).toContain("Reference matches");
  });

  it("matches on the entry number when that is what the bank carried", () => {
    const match = scoreMatch(
      line({ reference: "TRF JE/26-27/0001" }),
      candidate({ reference: null }),
    )!;
    expect(match.reasons).toContain("Reference matches");
  });

  it("ignores references too short to mean anything", () => {
    const match = scoreMatch(line({ reference: "AB" }), candidate({ reference: "AB" }))!;
    expect(match.reasons).not.toContain("Reference matches");
  });

  it("scores a reference match above one without", () => {
    const withRef = scoreMatch(line(), candidate())!;
    const without = scoreMatch(line({ reference: null }), candidate({ reference: null, memo: null }))!;
    expect(withRef.score).toBeGreaterThan(without.score);
  });
});

describe("descriptions", () => {
  it("notices a shared name", () => {
    const match = scoreMatch(
      line({ description: "UPI ACME INDUSTRIES PVT", reference: null }),
      candidate({ reference: null, memo: "Payment from Acme Industries" }),
    )!;
    expect(match.reasons).toContain("Description looks similar");
  });

  // "and" appearing in both strings is not evidence of anything.
  it("ignores words too short to carry signal", () => {
    const match = scoreMatch(
      line({ description: "a to the and", reference: null }),
      candidate({ reference: null, memo: "and the to a" }),
    )!;
    expect(match.reasons).not.toContain("Description looks similar");
  });
});

describe("suggesting matches", () => {
  const candidates = [
    candidate({ entryId: "exact", postingDate: "2026-09-17" }),
    candidate({ entryId: "near", postingDate: "2026-09-15", reference: null, memo: null }),
    candidate({ entryId: "wrong-amount", amount: 500 }),
    candidate({ entryId: "too-old", postingDate: "2026-01-01" }),
  ];

  it("ranks the strongest first", () => {
    expect(suggestMatches(line(), candidates)[0]!.candidate.entryId).toBe("exact");
  });

  it("leaves out anything that isn't a candidate at all", () => {
    const ids = suggestMatches(line(), candidates).map((s) => s.candidate.entryId);
    expect(ids).not.toContain("wrong-amount");
    expect(ids).not.toContain("too-old");
  });

  it("returns several rather than picking one", () => {
    expect(suggestMatches(line(), candidates).length).toBeGreaterThan(1);
  });

  it("caps how many it offers", () => {
    const many = Array.from({ length: 10 }, (_, i) => candidate({ entryId: `e${i}` }));
    expect(suggestMatches(line(), many, 3)).toHaveLength(3);
  });

  it("finds nothing when nothing fits, rather than reaching", () => {
    expect(suggestMatches(line(), [candidate({ amount: 99 })])).toEqual([]);
  });
});

describe("when a match may be offered as one click", () => {
  it("offers a confident, unrivalled match", () => {
    expect(isSafeAutoMatch(suggestMatches(line(), [candidate()]))).toBe(true);
  });

  // Two identical payments from the same customer on the same day are genuinely
  // ambiguous; offering either as "the" match is a guess dressed as a finding.
  it("refuses when a second candidate scores just as well", () => {
    const twins = [candidate({ entryId: "a" }), candidate({ entryId: "b" })];
    expect(isSafeAutoMatch(suggestMatches(line(), twins))).toBe(false);
  });

  it("refuses a merely plausible match", () => {
    const weak = suggestMatches(
      line({ reference: null, description: "TRANSFER" }),
      [candidate({ postingDate: "2026-09-13", reference: null, memo: null })],
    );
    expect(isSafeAutoMatch(weak)).toBe(false);
  });

  it("refuses when there is nothing to offer", () => {
    expect(isSafeAutoMatch([])).toBe(false);
  });
});

describe("where a reconciliation stands", () => {
  it("reconciles when the two agree and nothing is left hanging", () => {
    const position = reconciliationPosition(5000, 5000, []);
    expect(position.difference).toBe(0);
    expect(position.reconciled).toBe(true);
  });

  // A statement that happens to net to the same figure while lines are still unexplained
  // is not reconciled, it is a coincidence.
  it("does not reconcile while lines are still unexplained", () => {
    const position = reconciliationPosition(5000, 5000, [{ amount: 100 }, { amount: -100 }]);
    expect(position.difference).toBe(0);
    expect(position.reconciled).toBe(false);
    expect(position.unmatchedCount).toBe(2);
  });

  // Positive reads as "the bank has more than the books know about", which is the
  // direction someone investigating thinks in.
  it("signs the difference as statement minus ledger", () => {
    expect(reconciliationPosition(5200, 5000, []).difference).toBe(200);
    expect(reconciliationPosition(4800, 5000, []).difference).toBe(-200);
  });

  it("totals what is still unexplained", () => {
    expect(reconciliationPosition(0, 0, [{ amount: 300 }, { amount: -50 }]).unmatchedTotal).toBe(250);
  });
});

describe("import fingerprints", () => {
  const row = { txnDate: "2026-09-17", amount: 1180, description: "NEFT  CR   ACME", reference: "X1" };

  it("is the same for the same transaction exported twice", () => {
    expect(importFingerprint(row)).toBe(importFingerprint({ ...row }));
  });

  // The same transaction exported twice sits on different rows but is the same
  // transaction, so nothing positional may go into this.
  it("ignores whitespace and capitalisation the exporter may have changed", () => {
    expect(importFingerprint(row)).toBe(
      importFingerprint({ ...row, description: "neft cr acme" }),
    );
  });

  it("differs for a genuinely different transaction", () => {
    expect(importFingerprint(row)).not.toBe(importFingerprint({ ...row, amount: 1181 }));
    expect(importFingerprint(row)).not.toBe(importFingerprint({ ...row, txnDate: "2026-09-18" }));
    expect(importFingerprint(row)).not.toBe(importFingerprint({ ...row, reference: "X2" }));
  });

  // Two identical amounts on the same day with the same description really are
  // indistinguishable, and the unique index will collapse them -- worth stating so the
  // behaviour is a decision rather than a surprise.
  it("collapses two genuinely indistinguishable lines", () => {
    expect(importFingerprint(row)).toBe(importFingerprint({ ...row }));
  });
});
