import { describe, expect, it } from "vitest";
import { deriveRelevance } from "./relevance";
import type { BuyerPersona } from "../personas/types";

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

describe("deriveRelevance", () => {
  it("takes the matched persona's own priority", () => {
    const result = deriveRelevance({ persona: persona({ priority: "high" }), jobTitle: "CISO", icpRoles: [] });
    expect(result.level).toBe("high");
    expect(result.reason).toContain("CISO");
  });

  it("falls back to medium on an ICP role match with no persona", () => {
    const result = deriveRelevance({ persona: null, jobTitle: "Security Architect", icpRoles: ["Security Architect"] });
    expect(result.level).toBe("medium");
  });

  it("returns low when a real title matches neither a persona nor an ICP role", () => {
    const result = deriveRelevance({ persona: null, jobTitle: "Office Manager", icpRoles: ["CISO"] });
    expect(result.level).toBe("low");
  });

  it("returns unknown (not low) when there is no job title at all", () => {
    const result = deriveRelevance({ persona: null, jobTitle: null, icpRoles: ["CISO"] });
    expect(result.level).toBe("unknown");
  });
});

// DISC-OFFER-P1-04.3 "Offering-Specific Contact Relevance"
describe("deriveRelevance with a founder-set buying role", () => {
  it("lets the role set for this offering outrank the persona match", () => {
    const result = deriveRelevance({ persona: persona({ priority: "high" }), jobTitle: "CISO", icpRoles: [], buyingRole: "not_involved" });
    expect(result).toEqual({ level: "low", reason: "Set as not involved for this offering." });
  });

  it("gives the same person, same title, a different relevance per offering", () => {
    const iam = deriveRelevance({ persona: null, jobTitle: "IT Manager", icpRoles: [], buyingRole: "decision_maker" });
    const training = deriveRelevance({ persona: null, jobTitle: "IT Manager", icpRoles: [], buyingRole: "user" });
    expect(iam.level).toBe("high");
    expect(training.level).toBe("medium");
  });

  it("falls back to the derived relevance when no role is set", () => {
    expect(deriveRelevance({ persona: null, jobTitle: null, icpRoles: [], buyingRole: null }).level).toBe("unknown");
  });
});
