import { describe, expect, it } from "vitest";
import { computeBuyerFitScores } from "./scoring";
import type { BuyerPersonIntelligence } from "./types";

function candidate(overrides: Partial<BuyerPersonIntelligence>): BuyerPersonIntelligence {
  return {
    contact: {
      id: "contact-1",
      workspace_id: "ws-1",
      prospect_id: "prospect-1",
      first_name: "Priya",
      last_name: "Sharma",
      job_title: "CISO",
      email: null,
      linkedin_url: null,
      phone: null,
      status: "active",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    name: "Priya Sharma",
    title: "CISO",
    seniority: "c_level",
    persona: null,
    relevance: "high",
    relevanceReason: "",
    contactability: "low",
    contactabilityReason: "",
    supportingEvidence: [],
    confidence: "medium",
    ...overrides,
  };
}

describe("computeBuyerFitScores", () => {
  it("returns null scores with no candidates at all", () => {
    const result = computeBuyerFitScores([]);
    expect(result).toEqual({ buyerFitScore: null, contactabilityScore: null, primaryContactId: null });
  });

  it("returns null scores when every candidate's relevance is unknown", () => {
    const result = computeBuyerFitScores([candidate({ relevance: "unknown" })]);
    expect(result.buyerFitScore).toBeNull();
    expect(result.contactabilityScore).toBeNull();
  });

  it("picks the candidate with the highest relevance", () => {
    const result = computeBuyerFitScores([
      candidate({ contact: { ...candidate({}).contact, id: "low" }, relevance: "low" }),
      candidate({ contact: { ...candidate({}).contact, id: "high" }, relevance: "high", contactability: "medium" }),
    ]);
    expect(result.primaryContactId).toBe("high");
    expect(result.buyerFitScore).toBe(90);
    expect(result.contactabilityScore).toBe(60);
  });

  it("breaks a relevance tie using contactability", () => {
    const result = computeBuyerFitScores([
      candidate({ contact: { ...candidate({}).contact, id: "a" }, relevance: "medium", contactability: "low" }),
      candidate({ contact: { ...candidate({}).contact, id: "b" }, relevance: "medium", contactability: "high" }),
    ]);
    expect(result.primaryContactId).toBe("b");
    expect(result.contactabilityScore).toBe(90);
  });
});
