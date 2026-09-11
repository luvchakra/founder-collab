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
