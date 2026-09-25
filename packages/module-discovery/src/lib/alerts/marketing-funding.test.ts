/** MKT-15/FND-17. Only actionable items reach the bell, each linked to where it is fixed. */
import { describe, expect, it } from "vitest";
import { marketingFundingAlerts } from "./marketing-funding";

const zero = {
  contentAwaitingApproval: 0,
  scheduledPastDue: 0,
  campaignsEndingSoon: 0,
  outreachAwaitingApproval: 0,
  outreachFailed: 0,
  diligenceOverdue: 0,
  investorFollowUpsOverdue: 0,
};

describe("marketingFundingAlerts", () => {
  it("says nothing when nothing needs doing", () => {
    expect(marketingFundingAlerts(zero, "b1", "acme")).toEqual([]);
  });

  it("raises failures and overdue work as warnings, with business-scoped links", () => {
    const alerts = marketingFundingAlerts({ ...zero, outreachFailed: 2, contentAwaitingApproval: 1 }, "b1", "acme");
    expect(alerts).toEqual([
      expect.objectContaining({ id: "fnd-outreach-failed-b1", severity: "warning", href: "/acme/discovery/funding/outreach?status=failed", businessId: "b1" }),
      expect.objectContaining({ id: "mkt-review-b1", severity: "info", message: "1 marketing item awaits approval." }),
    ]);
  });
});
