import { describe, expect, it } from "vitest";
import { FINANCE_EXPORTS } from "./index";

// EXP-FIN-01..17 -- the list the host registers: every Finance adapter, once each, all
// gated on the Finance licence.

describe("FINANCE_EXPORTS", () => {
  it("lists each Finance export once, as finance.<resource>, on the gst licence", () => {
    const ids = FINANCE_EXPORTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      [
        "finance.accounts",
        "finance.activation",
        "finance.audit-log",
        "finance.backfill",
        "finance.bank-accounts",
        "finance.bank-transactions",
        "finance.bills",
        "finance.budget",
        "finance.dashboard",
        "finance.evidence",
        "finance.exceptions",
        "finance.expenses",
        "finance.filing",
        "finance.filing-readiness",
        "finance.gst-ledger",
        "finance.journal",
        "finance.payables",
        "finance.receivables",
        "finance.reconciliation-exceptions",
        "finance.recurring",
        "finance.statements",
      ].sort(),
    );
    for (const adapter of FINANCE_EXPORTS) {
      expect(adapter.module).toBe("gst");
      // No Finance read permission exists; each adapter mirrors its page's (none).
      expect(adapter.permissions).toEqual([]);
    }
  });
});
