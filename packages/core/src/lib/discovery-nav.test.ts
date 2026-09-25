/**
 * DISC-NAV-01..05. The Discovery tree's shape and its active-route rules (spec §2.6, §3.3):
 * the page you are on is highlighted exactly once and its group starts open, and
 * Customer Acquisition points at the existing offering routes without moving them.
 */
import { describe, expect, it } from "vitest";
import { buildDiscoveryNav, CUSTOMER_ACQUISITION_ROUTES } from "./discovery-nav";

const BASE = "/acme";
const PRODUCTS = [
  { id: "p1", name: "Alarms" },
  { id: "p2", name: "Cameras" },
];

function activeIds(tree: ReturnType<typeof buildDiscoveryNav>): string[] {
  return [
    ...tree.top.filter((l) => l.active).map((l) => `top:${l.id}`),
    ...tree.groups.flatMap((g) => g.items.filter((l) => l.active).map((l) => `${g.id}:${l.id}`)),
  ];
}

const group = (tree: ReturnType<typeof buildDiscoveryNav>, id: string) => tree.groups.find((g) => g.id === id)!;

describe("buildDiscoveryNav", () => {
  it("has the approved hierarchy, in order", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/dashboard");
    expect(tree.top.map((l) => l.label)).toEqual(["Overview", "Business"]);
    expect(tree.groups.map((g) => g.id)).toEqual(["offerings", "marketing", "customer-acquisition", "funding"]);
    expect(group(tree, "marketing").items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Strategy",
      "Campaigns",
      "Content",
      "Assets",
      "Website & SEO",
      "Analytics",
    ]);
    expect(group(tree, "funding").items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Funding Profile",
      "Investor Readiness",
      "Fundraising",
      "Investors",
      "Investor Outreach",
      "Data Room",
      "Due Diligence",
      "Analytics",
    ]);
    expect(group(tree, "customer-acquisition").items.map((i) => i.label)).toEqual(
      CUSTOMER_ACQUISITION_ROUTES.map((r) => r.label),
    );
    expect(activeIds(tree)).toEqual(["top:overview"]);
  });

  it("opens Marketing and highlights the campaign list on a campaign's own page", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing/campaigns/c1");
    expect(group(tree, "marketing").holdsActive).toBe(true);
    expect(group(tree, "funding").holdsActive).toBe(false);
    expect(activeIds(tree)).toEqual(["marketing:campaigns"]);
  });

  it("highlights the Marketing dashboard only on the dashboard itself", () => {
    expect(activeIds(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing"))).toEqual(["marketing:dashboard"]);
  });

  it("opens Funding on a funding page", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/funding/data-room");
    expect(group(tree, "funding").holdsActive).toBe(true);
    expect(activeIds(tree)).toEqual(["funding:data-room"]);
  });

  it("points Customer Acquisition at the existing routes of the offering in the URL", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/offerings/p2/prospects/x9");
    const acquisition = group(tree, "customer-acquisition");
    expect(acquisition.items.find((i) => i.id === "icp")!.href).toBe("/acme/discovery/offerings/p2/icp");
    expect(acquisition.holdsActive).toBe(true);
    expect(acquisition.heading).toBe("Customer Acquisition · Cameras");
    // The offering is highlighted in Business Offerings and the stage in Acquisition.
    expect(activeIds(tree)).toEqual(["offerings:p2", "customer-acquisition:prospects"]);
  });

  it("highlights only Products, not Knowledge, on the offering overview", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/offerings/p1");
    expect(activeIds(tree)).toEqual(["offerings:p1", "customer-acquisition:products"]);
  });

  it("falls back to the first offering away from offering pages, without claiming the page", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/business");
    const acquisition = group(tree, "customer-acquisition");
    expect(acquisition.items[0]!.href).toBe("/acme/discovery/offerings/p1");
    expect(acquisition.holdsActive).toBe(false);
    expect(activeIds(tree)).toEqual(["top:business"]);
  });

  it("has no acquisition links when there is no offering yet", () => {
    const tree = buildDiscoveryNav(BASE, [], "/acme/discovery/dashboard");
    expect(group(tree, "customer-acquisition").items).toEqual([]);
    expect(group(tree, "offerings").items).toEqual([]);
  });
});
