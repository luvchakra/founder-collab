import { describe, expect, it } from "vitest";
import { assessFilingReadiness, type ReadinessInputs } from "./filing-readiness";

const clean: ReadinessInputs = {
  hasAccounts: true,
  unpostedCount: 0,
  ledgerAgreesWithReturn: true,
  ledgerReturnGap: 0,
  itcAtRisk: 0,
  twoBImported: true,
  invalidGstinCount: 0,
  unmatchedBankLines: 0,
  periodStatus: "locked",
};

const check = (inputs: Partial<ReadinessInputs>, key: string) =>
  assessFilingReadiness({ ...clean, ...inputs }).checks.find((c) => c.key === key)!;

describe("a period with nothing wrong", () => {
  const result = assessFilingReadiness(clean);

  it("passes every check", () => {
    expect(result.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("says so plainly", () => {
    expect(result.canFile).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.headline).toMatch(/ready to file/i);
  });
});

describe("what blocks a filing", () => {
  // These three are not judgement calls: filing would be wrong, full stop.
  it("blocks when documents never reached the ledger", () => {
    expect(check({ unpostedCount: 3 }, "posted").status).toBe("block");
  });

  it("blocks when the ledger and the return disagree", () => {
    const c = check({ ledgerAgreesWithReturn: false, ledgerReturnGap: 2196 }, "reconciled");
    expect(c.status).toBe("block");
    expect(c.detail).toContain("2,196");
  });

  it("blocks when there are no books at all", () => {
    expect(check({ hasAccounts: false }, "accounts").status).toBe("block");
  });

  it("refuses to file while anything blocks", () => {
    expect(assessFilingReadiness({ ...clean, unpostedCount: 1 }).canFile).toBe(false);
  });

  it("counts the blockers in the headline, so the scale is visible up front", () => {
    const result = assessFilingReadiness({ ...clean, unpostedCount: 1, hasAccounts: false });
    expect(result.blockers).toHaveLength(2);
    expect(result.headline).toMatch(/2 things/i);
  });

  // An empty ledger and an empty return agree vacuously. Reporting that as a pass would
  // tell a business that has posted nothing that its return reconciles.
  it("cannot evaluate the reconciliation or the credit without a ledger", () => {
    const result = assessFilingReadiness({ ...clean, hasAccounts: false });
    expect(result.checks.find((c) => c.key === "reconciled")!.status).toBe("unknown");
    expect(result.checks.find((c) => c.key === "itc")!.status).toBe("unknown");
  });
});

describe("what is a warning, not a blocker", () => {
  // Suppliers file late constantly; whether to claim anyway is the founder's call.
  it("warns but does not block on credit beyond what 2B supports", () => {
    const c = check({ itcAtRisk: 5000 }, "itc");
    expect(c.status).toBe("warn");
    expect(assessFilingReadiness({ ...clean, itcAtRisk: 5000 }).canFile).toBe(true);
  });

  // A wrong GSTIN costs the customer their credit, not this business its filing.
  it("warns on invalid customer GSTINs", () => {
    expect(check({ invalidGstinCount: 2 }, "gstin").status).toBe("warn");
  });

  it("warns on unmatched bank lines, and says why they matter", () => {
    const c = check({ unmatchedBankLines: 4 }, "bank");
    expect(c.status).toBe("warn");
    expect(c.action).toMatch(/never invoiced/i);
  });

  it("lets a filing proceed with warnings, which most real ones have", () => {
    const result = assessFilingReadiness({
      ...clean,
      itcAtRisk: 100,
      invalidGstinCount: 1,
      unmatchedBankLines: 2,
    });
    expect(result.canFile).toBe(true);
    expect(result.warnings.length).toBe(3);
    expect(result.headline).toMatch(/nothing blocks/i);
  });
});

describe("a check that could not be evaluated", () => {
  // "We couldn't tell" and "we checked and it's fine" look identical on a screen and
  // mean opposite things.
  it("is never silently a pass", () => {
    const c = check({ twoBImported: false, itcAtRisk: 0 }, "itc");
    expect(c.status).toBe("unknown");
    expect(c.status).not.toBe("pass");
  });

  it("counts toward the things worth looking at", () => {
    const result = assessFilingReadiness({ ...clean, twoBImported: false });
    expect(result.warnings.some((w) => w.key === "itc")).toBe(true);
  });

  it("says what would let it be evaluated", () => {
    expect(check({ twoBImported: false }, "itc").action).toMatch(/import/i);
  });
});

describe("the period's own state", () => {
  it("passes on a locked period", () => {
    expect(check({ periodStatus: "locked" }, "period").status).toBe("pass");
  });

  // People file from an open period constantly; locking is what you do afterwards.
  it("warns rather than blocks on an open one", () => {
    const c = check({ periodStatus: "open" }, "period");
    expect(c.status).toBe("warn");
    expect(c.action).toMatch(/lock it once you've filed/i);
  });

  it("warns when no period covers the dates at all", () => {
    const c = check({ periodStatus: null }, "period");
    expect(c.status).toBe("warn");
    expect(c.detail).toMatch(/no accounting period/i);
  });

  // Filing an already-filed period is a revised return — a different, deliberate act.
  it("flags an already-filed period as a revision", () => {
    expect(check({ periodStatus: "filed" }, "period").action).toMatch(/revised return/i);
  });
});

describe("every check, whatever the input", () => {
  it("always carries an action when it isn't a pass", () => {
    const result = assessFilingReadiness({
      hasAccounts: false,
      unpostedCount: 5,
      ledgerAgreesWithReturn: false,
      ledgerReturnGap: 100,
      itcAtRisk: 50,
      twoBImported: true,
      invalidGstinCount: 1,
      unmatchedBankLines: 1,
      periodStatus: "open",
    });
    for (const c of result.checks) {
      if (c.status !== "pass") expect(c.action, c.key).toBeTruthy();
    }
  });

  it("never leaves a check without a label or detail", () => {
    for (const c of assessFilingReadiness(clean).checks) {
      expect(c.label).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });

  it("gives every check a distinct key", () => {
    const keys = assessFilingReadiness(clean).checks.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
