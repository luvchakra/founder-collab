import { describe, expect, it } from "vitest";
import {
  dueOccurrences,
  nextOccurrence,
  occurrenceOf,
  recurringIdempotencyKey,
  templateProblems,
} from "./recurring";

describe("stepping a schedule", () => {
  it("steps monthly", () => {
    expect(occurrenceOf("2026-01-15", "monthly", 0)).toBe("2026-01-15");
    expect(occurrenceOf("2026-01-15", "monthly", 1)).toBe("2026-02-15");
    expect(occurrenceOf("2026-01-15", "monthly", 12)).toBe("2027-01-15");
  });

  it("steps quarterly, half-yearly and annually", () => {
    expect(occurrenceOf("2026-01-15", "quarterly", 1)).toBe("2026-04-15");
    expect(occurrenceOf("2026-01-15", "half_yearly", 1)).toBe("2026-07-15");
    expect(occurrenceOf("2026-01-15", "annually", 1)).toBe("2027-01-15");
  });

  // `new Date(y, m, 31)` would roll into the next month.
  it("clamps to the real end of a short month instead of rolling over", () => {
    expect(occurrenceOf("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceOf("2026-01-31", "monthly", 3)).toBe("2026-04-30");
  });

  it("gets a leap February right", () => {
    expect(occurrenceOf("2028-01-31", "monthly", 1)).toBe("2028-02-29");
  });

  // The whole reason this takes an index rather than "the last run": stepping from the
  // previous date would give 30 May, then 30 June, drifting a day earlier every time a
  // short month goes by.
  it("returns to the anchor day after a short month, rather than sticking", () => {
    expect(occurrenceOf("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceOf("2026-01-31", "monthly", 4)).toBe("2026-05-31");
  });

  it("crosses a year boundary", () => {
    expect(occurrenceOf("2026-11-30", "quarterly", 1)).toBe("2027-02-28");
  });
});

describe("what is due", () => {
  it("lists every occurrence up to today", () => {
    expect(dueOccurrences("2026-01-10", "monthly", "2026-03-15")).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
  });

  it("stops at today, not after it", () => {
    expect(dueOccurrences("2026-01-10", "monthly", "2026-02-09")).toEqual(["2026-01-10"]);
  });

  it("skips everything already run", () => {
    expect(
      dueOccurrences("2026-01-10", "monthly", "2026-03-15", { lastRunOn: "2026-02-10" }),
    ).toEqual(["2026-03-10"]);
  });

  // A drain that didn't run for a week, or an entry that was paused, must catch up
  // completely — posting only the most recent would leave permanent holes nothing goes
  // back for.
  it("returns the whole backlog, not just the next one", () => {
    expect(dueOccurrences("2026-01-10", "monthly", "2026-06-15")).toHaveLength(6);
  });

  it("stops at an end date", () => {
    expect(
      dueOccurrences("2026-01-10", "monthly", "2026-12-31", { endOn: "2026-03-31" }),
    ).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  it("has nothing due before it starts", () => {
    expect(dueOccurrences("2026-06-10", "monthly", "2026-01-01")).toEqual([]);
  });

  it("caps a runaway backlog rather than generating forever", () => {
    expect(dueOccurrences("1990-01-01", "monthly", "2026-01-01", { limit: 12 })).toHaveLength(12);
  });

  // The high-water mark, not a cursor: a manually posted or skipped occurrence must not
  // shift everything after it.
  it("treats lastRunOn as a high-water mark", () => {
    const due = dueOccurrences("2026-01-31", "monthly", "2026-05-15", { lastRunOn: "2026-03-31" });
    expect(due).toEqual(["2026-04-30", "2026-05-31"].filter((d) => d <= "2026-05-15"));
  });
});

describe("when it next runs", () => {
  it("names the next date after today", () => {
    expect(nextOccurrence("2026-01-10", "monthly", "2026-03-15")).toBe("2026-04-10");
  });

  it("names the first date for a schedule that hasn't started", () => {
    expect(nextOccurrence("2026-06-10", "monthly", "2026-01-01")).toBe("2026-06-10");
  });

  it("returns nothing once the schedule has ended", () => {
    expect(nextOccurrence("2026-01-10", "monthly", "2026-06-15", { endOn: "2026-03-31" })).toBeNull();
  });
});

describe("idempotency", () => {
  it("gives one occurrence one key, however often it is computed", () => {
    expect(recurringIdempotencyKey("r1", "2026-03-31")).toBe(recurringIdempotencyKey("r1", "2026-03-31"));
  });

  it("keeps occurrences and templates distinct", () => {
    expect(recurringIdempotencyKey("r1", "2026-03-31")).not.toBe(recurringIdempotencyKey("r1", "2026-04-30"));
    expect(recurringIdempotencyKey("r1", "2026-03-31")).not.toBe(recurringIdempotencyKey("r2", "2026-03-31"));
  });
});

describe("validating a template", () => {
  const good = [
    { accountId: "rent", debit: 20000, credit: 0 },
    { accountId: "bank", debit: 0, credit: 20000 },
  ];

  it("accepts a balanced template", () => {
    expect(templateProblems(good)).toEqual([]);
  });

  // An unbalanced template would fail at the database every month, forever, with nobody
  // watching — so it fails in front of the person who can fix it.
  it("refuses one that doesn't balance", () => {
    expect(
      templateProblems([
        { accountId: "rent", debit: 20000, credit: 0 },
        { accountId: "bank", debit: 0, credit: 19000 },
      ]).join(" "),
    ).toMatch(/equal/i);
  });

  it("refuses one that would post nothing", () => {
    expect(
      templateProblems([
        { accountId: "a", debit: 0, credit: 0 },
        { accountId: "b", debit: 0, credit: 0 },
      ]).join(" "),
    ).toMatch(/no value/i);
  });

  it("wants an account on every line", () => {
    expect(templateProblems([{ accountId: "", debit: 1, credit: 0 }, ...good]).join(" ")).toMatch(
      /needs an account/i,
    );
  });

  it("wants at least two lines", () => {
    expect(templateProblems([{ accountId: "a", debit: 1, credit: 0 }]).join(" ")).toMatch(/two lines/i);
  });
});
