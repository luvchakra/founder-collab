import { describe, expect, it } from "vitest";
import { findSamePersonInOtherOfferings, personKeyFor } from "./cross-offering";
import type { Contact } from "./types";
import type { BuyerPersona } from "../personas/types";

// DISC-OFFER-P1-04.3 "Offering-Specific Contact Relevance"
function contact(overrides: Partial<Contact>): Contact {
  return {
    id: "c",
    workspace_id: "ws-iam",
    prospect_id: "p",
    first_name: null,
    last_name: null,
    job_title: null,
    email: null,
    linkedin_url: null,
    phone: null,
    buying_role: null,
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const trainingPersona: BuyerPersona = {
  id: "persona",
  workspace_id: "ws-training",
  title: "IT Manager",
  role_in_committee: "user",
  priority: "medium",
  notes: null,
  sort_order: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("personKeyFor", () => {
  it("prefers the email, falls back to the full name, and never matches on half a name", () => {
    expect(personKeyFor({ email: " Priya@Acme.com ", first_name: "Priya", last_name: "Sharma" })).toBe("email:priya@acme.com");
    expect(personKeyFor({ email: null, first_name: " Priya ", last_name: "SHARMA" })).toBe("name:priya sharma");
    expect(personKeyFor({ email: null, first_name: "Priya", last_name: null })).toBeNull();
  });
});

describe("findSamePersonInOtherOfferings", () => {
  it("shows the same person's role under each other offering: set, matched, or none", () => {
    const priya = contact({ id: "here", email: "priya@acme.com", first_name: "Priya", last_name: "Sharma", buying_role: "decision_maker" });
    const nobody = contact({ id: "alone", first_name: "Sam", last_name: "Lee" });
    const result = findSamePersonInOtherOfferings(
      [priya, nobody],
      [
        { contact: contact({ id: "t", workspace_id: "ws-training", email: "PRIYA@acme.com", job_title: "IT Manager" }), productId: "training", productName: "IAM Training", personas: [trainingPersona] },
        { contact: contact({ id: "a", workspace_id: "ws-assess", email: "priya@acme.com", buying_role: "not_involved" }), productId: "assess", productName: "Cyber Assessment", personas: [] },
        { contact: contact({ id: "x", workspace_id: "ws-x", email: "priya@acme.com" }), productId: "x", productName: "Audit", personas: [] },
      ],
    );
    expect(result.get("here")).toEqual([
      { productId: "x", productName: "Audit", roleLabel: null, roleSource: null },
      { productId: "assess", productName: "Cyber Assessment", roleLabel: "Not involved", roleSource: "set" },
      { productId: "training", productName: "IAM Training", roleLabel: "User", roleSource: "persona" },
    ]);
    expect(result.has("alone")).toBe(false);
  });
});
