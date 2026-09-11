import { describe, expect, it } from "vitest";
import { matchBuyingCommittee } from "./match-committee";
import type { Contact } from "../contacts/types";
import type { BuyerPersona } from "../personas/types";

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: "contact-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    first_name: "Priya",
    last_name: "Sharma",
    job_title: null,
    email: null,
    linkedin_url: null,
    phone: null,
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function persona(overrides: Partial<BuyerPersona>): BuyerPersona {
  return {
    id: "persona-1",
    workspace_id: "ws-1",
    title: "CISO",
    role_in_committee: "executive_buyer",
    priority: "high",
    notes: null,
    sort_order: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("matchBuyingCommittee", () => {
  it("matches a contact's job title against a persona's title", () => {
    const result = matchBuyingCommittee(
      [contact({ id: "c1", job_title: "CISO" })],
      [persona({ id: "p1", title: "CISO" })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.persona?.id).toBe("p1");
  });

  it("returns a contact unassigned (not hidden) when no persona matches", () => {
    const result = matchBuyingCommittee(
      [contact({ id: "c1", job_title: "Office Manager" })],
      [persona({ id: "p1", title: "CISO" })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.contact.id).toBe("c1");
    expect(result[0]!.persona).toBeNull();
  });

  it("leaves persona null when the contact has no job title at all", () => {
    const result = matchBuyingCommittee([contact({ id: "c1", job_title: null })], [persona({ id: "p1", title: "CISO" })]);
    expect(result[0]!.persona).toBeNull();
  });

  it("returns every contact even with no personas defined", () => {
    const result = matchBuyingCommittee([contact({ id: "c1" }), contact({ id: "c2" })], []);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.persona === null)).toBe(true);
  });
});
