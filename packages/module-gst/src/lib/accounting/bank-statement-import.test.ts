import { describe, expect, it } from "vitest";
import {
  parseAmount,
  parseBankStatementCsv,
  parseStatementDate,
  splitCsvLine,
} from "./bank-statement-import";

describe("splitting a CSV line", () => {
  it("splits on commas", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  // A description with a comma in it is extremely common and must not become two columns.
  it("keeps a quoted comma inside its own field", () => {
    expect(splitCsvLine('2026-09-17,"ACME INDUSTRIES, MUMBAI",1180')).toEqual([
      "2026-09-17",
      "ACME INDUSTRIES, MUMBAI",
      "1180",
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(splitCsvLine('"He said ""hi""",2')).toEqual(['He said "hi"', "2"]);
  });

  it("keeps empty fields rather than collapsing them", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("reading a date", () => {
  // dd/mm/yyyy is what Indian banks export: 03/04/2026 is 3 April, not 4 March.
  it("reads an ambiguous date as day first", () => {
    expect(parseStatementDate("03/04/2026")).toBe("2026-04-03");
  });

  it("recognises ISO by its own shape, so a file using it is never misread", () => {
    expect(parseStatementDate("2026-04-03")).toBe("2026-04-03");
  });

  it("reads the separators banks actually use", () => {
    expect(parseStatementDate("17-09-2026")).toBe("2026-09-17");
    expect(parseStatementDate("17.09.2026")).toBe("2026-09-17");
  });

  it("reads a two-digit year as this century", () => {
    expect(parseStatementDate("17/09/26")).toBe("2026-09-17");
  });

  it("reads a named month", () => {
    expect(parseStatementDate("17 Sep 2026")).toBe("2026-09-17");
    expect(parseStatementDate("17-September-2026")).toBe("2026-09-17");
  });

  it("refuses something that isn't a date", () => {
    expect(parseStatementDate("Statement generated on request")).toBeNull();
    expect(parseStatementDate("")).toBeNull();
    expect(parseStatementDate("45/13/2026")).toBeNull();
  });
});

describe("reading an amount", () => {
  it("reads Indian digit grouping", () => {
    expect(parseAmount("1,23,456.78")).toBe(123456.78);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseAmount("₹ 1,180.00")).toBe(1180);
  });

  it("reads a Cr/Dr suffix as the sign", () => {
    expect(parseAmount("1180.00 Cr")).toBe(1180);
    expect(parseAmount("1180.00 Dr")).toBe(-1180);
  });

  it("reads parentheses as negative", () => {
    expect(parseAmount("(500.00)")).toBe(-500);
  });

  // An empty cell means "this column doesn't apply to this row"; something that looked
  // like a number and wasn't is a problem. They must not be confused.
  it("tells an empty cell apart from an unreadable one", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("N/A")).toBeNaN();
  });
});

describe("a statement with separate withdrawal and deposit columns", () => {
  const csv = [
    "Statement of Account",
    "Account Number: XXXXXX1234",
    "",
    "Txn Date,Narration,Cheque No,Withdrawal Amt,Deposit Amt,Closing Balance",
    "17/09/2026,NEFT CR ACME INDUSTRIES,NEFT0042,,1180.00,51180.00",
    "16/09/2026,RENT PAYMENT,,20000.00,,50000.00",
  ].join("\n");

  const result = parseBankStatementCsv(csv);

  // Bank exports routinely open with the account holder's name and a blank line before
  // the table starts.
  it("finds the header row rather than assuming it is first", () => {
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  it("signs deposits positive and withdrawals negative", () => {
    expect(result.rows[0]!.amount).toBe(1180);
    expect(result.rows[1]!.amount).toBe(-20000);
  });

  it("keeps the description, reference and running balance", () => {
    expect(result.rows[0]!.description).toBe("NEFT CR ACME INDUSTRIES");
    expect(result.rows[0]!.reference).toBe("NEFT0042");
    expect(result.rows[0]!.balanceAfter).toBe(51180);
  });

  it("says which header it read each field from, so its reading can be checked", () => {
    expect(result.columns.date).toBe("txn date");
    expect(result.columns.credit).toBe("deposit amt");
  });
});

describe("a statement with one signed amount column", () => {
  const csv = [
    "Date,Description,Amount,Balance",
    "2026-09-17,Payment received,1180.00,51180.00",
    "2026-09-16,Rent,-20000.00,50000.00",
  ].join("\n");

  it("takes the sign from the amount itself", () => {
    const { rows } = parseBankStatementCsv(csv);
    expect(rows.map((r) => r.amount)).toEqual([1180, -20000]);
  });
});

describe("what it refuses to do quietly", () => {
  // A statement that imports "successfully" with four lines missing produces a
  // reconciliation that will not balance, and nothing on screen to say why.
  it("reports an unreadable row instead of dropping it", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-09-17,Good row,100.00",
      "not-a-date,Broken row,200.00",
    ].join("\n");
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.line).toBe(3);
    expect(result.problems[0]!.raw).toContain("Broken row");
  });

  it("reports a row whose amount it cannot read", () => {
    const csv = ["Date,Description,Amount", "2026-09-17,Odd row,N/A"].join("\n");
    expect(parseBankStatementCsv(csv).problems[0]!.reason).toMatch(/amount/i);
  });

  it("reports a row with no amount at all", () => {
    const csv = ["Date,Narration,Withdrawal,Deposit", "2026-09-17,Nothing happened,,"].join("\n");
    expect(parseBankStatementCsv(csv).problems[0]!.reason).toMatch(/no amount/i);
  });

  it("skips a trailing footer without calling it an error", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-09-17,Good row,100.00",
      "",
      "Statement generated on request",
    ].join("\n");
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it("says plainly when the file isn't a statement at all", () => {
    const result = parseBankStatementCsv("name,email\nAcme,a@example.com");
    expect(result.rows).toEqual([]);
    expect(result.problems[0]!.reason).toMatch(/header row/i);
  });

  // The database's unique index would reject the second anyway; saying so here is
  // kinder than a constraint error.
  it("skips a row repeated within the same file, and says it did", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-09-17,Payment,100.00",
      "2026-09-17,Payment,100.00",
    ].join("\n");
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.problems[0]!.reason).toMatch(/earlier row/i);
  });
});

describe("re-importing an overlapping statement", () => {
  it("gives the same row the same fingerprint in both files", () => {
    const first = parseBankStatementCsv("Date,Description,Amount\n17/09/2026,Payment,100.00");
    const second = parseBankStatementCsv(
      "Txn Date,Narration,Amount\n2026-09-17,payment,100.00",
    );
    expect(first.rows[0]!.importFingerprint).toBe(second.rows[0]!.importFingerprint);
  });
});
