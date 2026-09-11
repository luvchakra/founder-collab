import { describe, expect, it } from "vitest";
import { draftInteractionReply } from "./draft-reply";
import type { Customer360 } from "../customer-360/types";

const baseCustomer360: Customer360 = {
  partyId: "party-1",
  name: "",
  contactMethods: { email: null, phone: null },
  lifecycleStatus: null,
  ownerId: null,
  source: null,
  productsOfInterest: [],
  openLeads: [],
  openOpportunities: [],
  openFollowUps: [],
  recentConversations: [],
  notes: [],
  prospect: null,
  recentOrders: [],
  recentJobs: [],
};

describe("draftInteractionReply", () => {
  it("greets generically and reports no sources when there's no name or other context", () => {
    const result = draftInteractionReply("general_enquiry", "Acme Co", baseCustomer360);
    expect(result.draft).toContain("Hi there");
    expect(result.draft).toContain("Acme Co");
    expect(result.sources).toEqual([]);
  });

  it("personalizes the greeting with the party's first name and reports party_contact_info as a source", () => {
    const result = draftInteractionReply("pricing", "Acme Co", { ...baseCustomer360, name: "Priya Sharma" });
    expect(result.draft).toContain("Hi Priya");
    expect(result.sources).toContain("party_contact_info");
  });

  it("mentions products of interest and reports product_interest as a source", () => {
    const result = draftInteractionReply("availability", "Acme Co", {
      ...baseCustomer360,
      productsOfInterest: [{ id: "pi-1", itemId: "item-1", itemName: "Blue Widget", quantity: 2 }],
    });
    expect(result.draft).toContain("Blue Widget");
    expect(result.sources).toContain("product_interest");
  });

  it("reports discovery_research/recent_orders/recent_jobs as sources when present", () => {
    const result = draftInteractionReply("general_enquiry", "Acme Co", {
      ...baseCustomer360,
      prospect: { icpFitScore: null, icpFitReason: null } as unknown as Customer360["prospect"],
      recentOrders: [{ id: "o1" } as unknown as Customer360["recentOrders"][number]],
      recentJobs: [{ id: "j1" } as unknown as Customer360["recentJobs"][number]],
    });
    expect(result.sources).toEqual(expect.arrayContaining(["discovery_research", "recent_orders", "recent_jobs"]));
  });

  it("returns an empty draft for spam -- nothing worth replying to", () => {
    expect(draftInteractionReply("spam", "Acme Co", baseCustomer360).draft).toBe("");
  });

  it("falls back to a generic acknowledgment for a null intent", () => {
    expect(draftInteractionReply(null, "Acme Co", baseCustomer360).draft).toContain("Acme Co");
  });
});
