import { describe, expect, it } from "vitest";
import { PLATFORM_NAV_GROUPS, PLATFORM_NAV_LINKS } from "./platform-nav";

describe("PLATFORM_NAV_GROUPS", () => {
  it("has no duplicate hrefs", () => {
    const hrefs = PLATFORM_NAV_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("lists the billing console pages under one Billing group (BILL-26..32, §69)", () => {
    const billing = PLATFORM_NAV_GROUPS.find((g) => g.label === "Billing");
    expect(billing?.links.map((l) => l.href)).toEqual([
      "/platform/billing",
      "/platform/billing/subscriptions",
      "/platform/billing/payments",
      "/platform/billing/events",
      "/platform/billing/providers",
    ]);
  });

  it("keeps Plans as the one canonical plan catalog, not duplicated under Billing", () => {
    expect(PLATFORM_NAV_LINKS.filter((l) => l.href.startsWith("/platform/plans"))).toEqual([{ href: "/platform/plans", label: "Plans" }]);
  });
});
