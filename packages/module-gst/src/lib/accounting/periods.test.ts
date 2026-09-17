import { describe, expect, it } from "vitest";
import {
  allowedPeriodTransitions,
  canTransitionPeriod,
  explainPeriodTransition,
  fiscalYearLabel,
  fiscalYearOf,
  isPeriodStatus,
  monthlyPeriodsForFiscalYear,
  periodForDate,
  type PeriodStatus,
} from "./periods";
import { isPeriodPostable } from "./balance";

const ALL_STATUSES: PeriodStatus[] = ["open", "review", "locked", "filed", "closed"];

describe("generating a fiscal year", () => {
  const fy = monthlyPeriodsForFiscalYear(2026);

  it("produces twelve monthly periods", () => {
    expect(fy).toHaveLength(12);
  });

  it("runs April to March for an April fiscal year", () => {
    expect(fy[0]!.startDate).toBe("2026-04-01");
    expect(fy[11]!.endDate).toBe("2027-03-31");
  });

  it("covers every day with no gap and no overlap", () => {
    for (let i = 1; i < fy.length; i += 1) {
      const dayAfterPrevious = new Date(`${fy[i - 1]!.endDate}T00:00:00Z`);
      dayAfterPrevious.setUTCDate(dayAfterPrevious.getUTCDate() + 1);
      expect(fy[i]!.startDate).toBe(dayAfterPrevious.toISOString().slice(0, 10));
    }
  });

  it("ends each period on the real last day of its month", () => {
    const ends = Object.fromEntries(fy.map((p) => [p.gstPeriod, p.endDate]));
    expect(ends["2026-04"]).toBe("2026-04-30");
    expect(ends["2026-12"]).toBe("2026-12-31");
    expect(ends["2027-02"]).toBe("2027-02-28");
  });

  it("gets February right in a leap year", () => {
    const leap = monthlyPeriodsForFiscalYear(2027).find((p) => p.gstPeriod === "2028-02");
    expect(leap?.endDate).toBe("2028-02-29");
  });

  // The GST period is what ties an accounting period to the return it feeds, so it has
  // to match `gst.return_periods`' own YYYY-MM spelling exactly.
  it("labels each period with the GST return period it feeds", () => {
    expect(fy.map((p) => p.gstPeriod)).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
  });

  it("stamps every period with the fiscal year it belongs to, not the calendar year", () => {
    expect(new Set(fy.map((p) => p.fiscalYear))).toEqual(new Set([2026]));
  });

  // The same machinery serves the country packs this module already supports, whose
  // fiscal years do not start in April.
  it("handles a January fiscal year", () => {
    const calendar = monthlyPeriodsForFiscalYear(2026, 1);
    expect(calendar[0]!.startDate).toBe("2026-01-01");
    expect(calendar[11]!.endDate).toBe("2026-12-31");
  });

  it("refuses a month that isn't one", () => {
    expect(() => monthlyPeriodsForFiscalYear(2026, 13)).toThrow();
    expect(() => monthlyPeriodsForFiscalYear(2026.5)).toThrow();
  });
});

describe("naming a fiscal year", () => {
  it("straddles two calendar years when it starts mid-year", () => {
    expect(fiscalYearLabel(2026)).toBe("FY 2026-27");
    expect(fiscalYearLabel(2029)).toBe("FY 2029-30");
  });

  it("pads the second year across a century boundary", () => {
    expect(fiscalYearLabel(2099)).toBe("FY 2099-00");
  });

  it("names a calendar fiscal year by that year alone", () => {
    expect(fiscalYearLabel(2026, 1)).toBe("FY 2026");
  });

  it("places a date in the fiscal year that actually contains it", () => {
    expect(fiscalYearOf("2026-04-01")).toBe(2026);
    expect(fiscalYearOf("2027-03-31")).toBe(2026);
    expect(fiscalYearOf("2026-03-31")).toBe(2025);
    expect(fiscalYearOf("2026-03-31", 1)).toBe(2026);
  });
});

describe("closing a period", () => {
  it("walks forward through the close", () => {
    expect(canTransitionPeriod("open", "review")).toBe(true);
    expect(canTransitionPeriod("review", "locked")).toBe(true);
    expect(canTransitionPeriod("locked", "filed")).toBe(true);
    expect(canTransitionPeriod("filed", "closed")).toBe(true);
  });

  // Locking is "stop posting while we reconcile", so finding a real error during review
  // has to be fixable.
  it("lets a locked period be reopened", () => {
    expect(canTransitionPeriod("locked", "open")).toBe(true);
  });

  // Once a return has gone to the tax authority its numbers are what was filed; a quiet
  // edit afterwards would stop the filed return reconciling to the ledger behind it.
  it("never reopens a filed or closed period", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionPeriod("closed", to), `closed -> ${to}`).toBe(false);
    }
    expect(canTransitionPeriod("filed", "open")).toBe(false);
    expect(canTransitionPeriod("filed", "locked")).toBe(false);
  });

  it("never treats staying put as a transition", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionPeriod(status, status), status).toBe(false);
    }
  });

  it("never offers a transition it would then refuse", () => {
    for (const from of ALL_STATUSES) {
      for (const to of allowedPeriodTransitions(from)) {
        expect(explainPeriodTransition(from, to), `${from} -> ${to}`).toBeNull();
      }
    }
  });

  it("explains every refusal in words a user can act on", () => {
    expect(explainPeriodTransition("filed", "open")).toMatch(/correcting entry/i);
    expect(explainPeriodTransition("closed", "open")).toMatch(/correcting entry/i);
    expect(explainPeriodTransition("open", "open")).toMatch(/already/i);
    expect(explainPeriodTransition("open", "filed")).toMatch(/can't go straight/i);
  });

  // The statuses that refuse postings and the statuses that can't be reopened are
  // related but not identical -- a locked period takes no postings yet can still be
  // reopened -- so this pins both together rather than letting them drift apart.
  it("refuses postings in exactly the statuses past locking", () => {
    expect(ALL_STATUSES.filter((s) => !isPeriodPostable(s))).toEqual(["locked", "filed", "closed"]);
  });

  it("recognises its own statuses and nothing else", () => {
    for (const status of ALL_STATUSES) expect(isPeriodStatus(status)).toBe(true);
    expect(isPeriodStatus("reopened")).toBe(false);
    expect(isPeriodStatus("")).toBe(false);
  });
});

describe("finding the period a posting belongs to", () => {
  const periods = monthlyPeriodsForFiscalYear(2026).map((p) => ({
    start_date: p.startDate,
    end_date: p.endDate,
    gst_period: p.gstPeriod,
  }));

  it("finds the period containing the date, including both its ends", () => {
    expect(periodForDate(periods, "2026-09-17")?.gst_period).toBe("2026-09");
    expect(periodForDate(periods, "2026-04-01")?.gst_period).toBe("2026-04");
    expect(periodForDate(periods, "2027-03-31")?.gst_period).toBe("2027-03");
  });

  // A posting outside every defined period is not an error here: the caller decides
  // whether to open the year or refuse, and gets to say so in its own words.
  it("returns nothing for a date no period covers yet", () => {
    expect(periodForDate(periods, "2027-04-01")).toBeUndefined();
    expect(periodForDate(periods, "2026-03-31")).toBeUndefined();
  });
});
