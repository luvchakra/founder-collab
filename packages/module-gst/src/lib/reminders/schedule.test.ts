import { describe, expect, it } from "vitest";
import { daysUntil, pendingReminderLeadDays } from "./schedule";

describe("daysUntil", () => {
  it("is positive for a future date", () => {
    expect(daysUntil("2026-09-20", "2026-09-13")).toBe(7);
  });

  it("is zero for today", () => {
    expect(daysUntil("2026-09-13", "2026-09-13")).toBe(0);
  });

  it("is negative for a past date", () => {
    expect(daysUntil("2026-09-13", "2026-09-20")).toBe(-7);
  });
});

describe("pendingReminderLeadDays", () => {
  it("fires the 7-day threshold once within 7 days of the due date", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-13", [])).toEqual([7]);
  });

  it("fires both thresholds at once for a cron that only just started tracking this obligation 1 day out", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-19", [])).toEqual([7, 1]);
  });

  it("does not re-fire an already-sent threshold", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-19", [7])).toEqual([1]);
  });

  it("fires nothing once every configured threshold has already been sent", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-19", [7, 1])).toEqual([]);
  });

  it("fires nothing more than 7 days out", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-01", [])).toEqual([]);
  });

  it("fires nothing once the due date has already passed -- that's overdue detection's job, not a reminder's", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-21", [])).toEqual([]);
  });

  it("respects a custom configured lead-day list", () => {
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-17", [], [3])).toEqual([3]);
    expect(pendingReminderLeadDays("2026-09-20", "2026-09-10", [], [3])).toEqual([]);
  });
});
