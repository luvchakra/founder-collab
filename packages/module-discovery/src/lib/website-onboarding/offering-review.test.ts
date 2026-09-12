import { describe, expect, it } from "vitest";
import { mergeOfferingCandidates, offeringInputFromCandidate, type EditableOfferingCandidate } from "./offering-review";

function candidate(overrides: Partial<EditableOfferingCandidate> = {}): EditableOfferingCandidate {
  return {
    name: "Managed IAM Services",
    description: "24/7 managed identity and access management.",
    offeringType: "service",
    problemSolved: "Overworked security teams can't keep up with access reviews.",
    targetCustomer: "Mid-size financial companies",
    targetIndustry: "Financial services",
    valueProposition: "Always-on coverage without hiring a full team.",
    sourcePages: ["https://example.com/services"],
    ...overrides,
  };
}

describe("mergeOfferingCandidates", () => {
  it("throws on an empty list", () => {
    expect(() => mergeOfferingCandidates([])).toThrow();
  });

  it("keeps a single candidate's own fields unchanged (join is a no-op)", () => {
    const result = mergeOfferingCandidates([candidate()]);
    expect(result.name).toBe("Managed IAM Services");
    expect(result.description).toBe("24/7 managed identity and access management.");
  });

  it("keeps the first candidate's name", () => {
    const result = mergeOfferingCandidates([
      candidate({ name: "Managed IAM Services" }),
      candidate({ name: "IAM Ops" }),
    ]);
    expect(result.name).toBe("Managed IAM Services");
  });

  it("joins distinct descriptions from every candidate", () => {
    const result = mergeOfferingCandidates([
      candidate({ description: "24/7 monitoring." }),
      candidate({ description: "Incident response included." }),
    ]);
    expect(result.description).toBe("24/7 monitoring. Incident response included.");
  });

  it("does not repeat an identical description twice", () => {
    const result = mergeOfferingCandidates([
      candidate({ description: "Same text." }),
      candidate({ description: "same text." }),
    ]);
    expect(result.description).toBe("Same text.");
  });

  it("skips a blank description instead of leaving a stray space", () => {
    const result = mergeOfferingCandidates([candidate({ description: "" }), candidate({ description: "Real text." })]);
    expect(result.description).toBe("Real text.");
  });

  it("fills a null field from a later candidate when the first left it null", () => {
    const result = mergeOfferingCandidates([
      candidate({ targetIndustry: null }),
      candidate({ targetIndustry: "Healthcare" }),
    ]);
    expect(result.targetIndustry).toBe("Healthcare");
  });

  it("prefers the first candidate's non-null field over a later one's", () => {
    const result = mergeOfferingCandidates([
      candidate({ targetIndustry: "Financial services" }),
      candidate({ targetIndustry: "Healthcare" }),
    ]);
    expect(result.targetIndustry).toBe("Financial services");
  });

  it("unions and deduplicates source pages, first-seen order", () => {
    const result = mergeOfferingCandidates([
      candidate({ sourcePages: ["https://example.com/services", "https://example.com/about"] }),
      candidate({ sourcePages: ["https://example.com/about", "https://example.com/pricing"] }),
    ]);
    expect(result.sourcePages).toEqual([
      "https://example.com/services",
      "https://example.com/about",
      "https://example.com/pricing",
    ]);
  });

  it("merges three or more candidates, not just two", () => {
    const result = mergeOfferingCandidates([
      candidate({ name: "A", targetCustomer: null }),
      candidate({ name: "B", targetCustomer: null }),
      candidate({ name: "C", targetCustomer: "Enterprises" }),
    ]);
    expect(result.name).toBe("A");
    expect(result.targetCustomer).toBe("Enterprises");
  });
});

describe("offeringInputFromCandidate", () => {
  it("maps every field onto createOffering()'s own shape", () => {
    const result = offeringInputFromCandidate(candidate());
    expect(result).toEqual({
      name: "Managed IAM Services",
      description: "24/7 managed identity and access management.",
      offeringType: "service",
      primaryProblem: "Overworked security teams can't keep up with access reviews.",
      targetMarket: "Mid-size financial companies — Financial services",
      valueProposition: "Always-on coverage without hiring a full team.",
    });
  });

  it("combines only targetCustomer when targetIndustry is null", () => {
    const result = offeringInputFromCandidate(candidate({ targetIndustry: null }));
    expect(result.targetMarket).toBe("Mid-size financial companies");
  });

  it("combines only targetIndustry when targetCustomer is null", () => {
    const result = offeringInputFromCandidate(candidate({ targetCustomer: null }));
    expect(result.targetMarket).toBe("Financial services");
  });

  it("returns a null targetMarket when both are null", () => {
    const result = offeringInputFromCandidate(candidate({ targetCustomer: null, targetIndustry: null }));
    expect(result.targetMarket).toBeNull();
  });

  it("trims the name and turns a blank description into null", () => {
    const result = offeringInputFromCandidate(candidate({ name: "  Managed IAM Services  ", description: "   " }));
    expect(result.name).toBe("Managed IAM Services");
    expect(result.description).toBeNull();
  });
});
