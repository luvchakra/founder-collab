import { describe, expect, it } from "vitest";
import { announcementsForBusiness, type CustomerAnnouncement } from "./active";

// PLATFORM-P1-10.13: which notices a business sees now.
const now = Date.parse("2026-10-13T12:00:00Z");
const a = (over: Partial<CustomerAnnouncement>): CustomerAnnouncement => ({
  id: "a",
  type: "information",
  title: "t",
  message: "m",
  audienceType: "all_customers",
  audiencePlanId: null,
  audienceBusinessId: null,
  publishAt: null,
  expireAt: null,
  enabled: true,
  ...over,
});
const acme = { id: "acme", planId: "plan-pro" };

describe("announcementsForBusiness", () => {
  it("shows notices for everyone, its plan and itself", () => {
    const list = [
      a({ id: "all" }),
      a({ id: "pro", audienceType: "specific_plan", audiencePlanId: "plan-pro" }),
      a({ id: "free", audienceType: "specific_plan", audiencePlanId: "plan-free" }),
      a({ id: "mine", audienceType: "specific_business", audienceBusinessId: "acme" }),
      a({ id: "theirs", audienceType: "specific_business", audienceBusinessId: "bob" }),
      a({ id: "country", audienceType: "specific_country" }),
    ];
    expect(announcementsForBusiness(list, acme, now).map((x) => x.id)).toEqual(["all", "pro", "mine"]);
  });

  it("respects the window and the switch", () => {
    const list = [
      a({ id: "ended", expireAt: "2026-10-13T11:00:00Z" }),
      a({ id: "later", publishAt: "2026-10-14T00:00:00Z" }),
      a({ id: "off", enabled: false }),
      a({ id: "open", publishAt: "2026-10-12T00:00:00Z", expireAt: "2026-10-20T00:00:00Z" }),
    ];
    expect(announcementsForBusiness(list, acme, now).map((x) => x.id)).toEqual(["open"]);
  });
});
