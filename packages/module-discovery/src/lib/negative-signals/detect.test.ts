import { describe, expect, it } from "vitest";
import { detectNegativeSignals, type NegativeSignalDetectionInput } from "./detect";

function input(overrides: Partial<NegativeSignalDetectionInput> = {}): NegativeSignalDetectionInput {
  return {
    prospect: { industry: "Financial Services", company_size: "100-500", location: "United States", outcome: "open", updated_at: "2026-09-01T00:00:00Z" },
    icp: { status: "approved", industries: ["Financial Services"], company_sizes: ["100-500"], geographies: ["United States"] },
    research: { pain_points: ["Manual access reviews"] },
    contactCount: 1,
    ...overrides,
  };
}

describe("detectNegativeSignals", () => {
  it("finds nothing wrong with a clean, well-matched prospect", () => {
    expect(detectNegativeSignals(input())).toEqual([]);
  });

  it("flags wrong_industry/wrong_size/wrong_geography against an approved ICP", () => {
    const results = detectNegativeSignals(
      input({
        prospect: { industry: "Retail", company_size: "1-10", location: "Germany", outcome: "open", updated_at: "2026-09-01T00:00:00Z" },
      }),
    );
    expect(results.map((r) => r.reason)).toEqual(
      expect.arrayContaining(["wrong_industry", "wrong_size", "wrong_geography"]),
    );
  });

  it("skips ICP-fit checks entirely when there is no approved ICP -- nothing honest to compare against", () => {
    const results = detectNegativeSignals(input({ icp: null }));
    expect(results.map((r) => r.reason)).not.toEqual(expect.arrayContaining(["wrong_industry"]));

    const draftIcp = detectNegativeSignals(
      input({ icp: { status: "draft", industries: ["Retail"], company_sizes: [], geographies: [] } }),
    );
    expect(draftIcp.map((r) => r.reason)).not.toEqual(expect.arrayContaining(["wrong_industry"]));
  });

  it("distinguishes insufficient_evidence (no research at all) from no_relevant_problem (research found nothing)", () => {
    const noResearch = detectNegativeSignals(input({ research: null }));
    expect(noResearch.map((r) => r.reason)).toEqual(["insufficient_evidence"]);

    const emptyResearch = detectNegativeSignals(input({ research: { pain_points: [] } }));
    expect(emptyResearch.map((r) => r.reason)).toEqual(["no_relevant_problem"]);
  });

  it("flags no_buyer when there are no recorded contacts", () => {
    const results = detectNegativeSignals(input({ contactCount: 0 }));
    expect(results.map((r) => r.reason)).toContain("no_buyer");
  });

  it("flags recent_rejection when the prospect's outcome is lost", () => {
    const results = detectNegativeSignals(input({ prospect: { ...input().prospect, outcome: "lost" } }));
    expect(results.map((r) => r.reason)).toContain("recent_rejection");
  });

  it("never returns known_incompatible_solution or existing_active_relationship -- those are manual-only", () => {
    const results = detectNegativeSignals(
      input({
        icp: null,
        research: null,
        contactCount: 0,
        prospect: { industry: null, company_size: null, location: null, outcome: "lost", updated_at: "2026-09-01T00:00:00Z" },
      }),
    );
    const reasons = results.map((r) => r.reason);
    expect(reasons).not.toContain("known_incompatible_solution");
    expect(reasons).not.toContain("existing_active_relationship");
  });
});
