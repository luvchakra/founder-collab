import { describe, expect, it } from "vitest";
import { sanitizeOfferingCandidates } from "./sanitize-offerings";
import type { WebsiteOfferingCandidate } from "../ai/schemas";

function candidate(overrides: Partial<WebsiteOfferingCandidate> = {}): WebsiteOfferingCandidate {
  return {
    name: "Managed IAM Services",
    description: "24/7 managed identity and access management.",
    offeringType: "service",
    problemSolved: "Overworked security teams can't keep up with access reviews.",
    targetCustomer: "Mid-size financial companies",
    targetIndustry: "Financial services",
    valueProposition: "Always-on coverage without hiring a full team.",
    evidence: "We provide 24/7 managed IAM services.",
    confidence: 0.8,
    sourcePages: ["https://example.com/services"],
    ...overrides,
  };
}

const KNOWN_URLS = ["https://example.com", "https://example.com/services", "https://example.com/about"];

describe("sanitizeOfferingCandidates", () => {
  it("drops a candidate with no real name", () => {
    const result = sanitizeOfferingCandidates([candidate({ name: "   " })], KNOWN_URLS);
    expect(result).toEqual([]);
  });

  it("trims name, description, and evidence", () => {
    const result = sanitizeOfferingCandidates(
      [candidate({ name: "  Managed IAM Services  ", description: "  Some text.  ", evidence: "  quote  " })],
      KNOWN_URLS,
    );
    expect(result[0]).toMatchObject({ name: "Managed IAM Services", description: "Some text.", evidence: "quote" });
  });

  it("turns a blank nullable field into null", () => {
    const result = sanitizeOfferingCandidates(
      [candidate({ problemSolved: "   ", targetCustomer: null, targetIndustry: "", valueProposition: "  Real value  " })],
      KNOWN_URLS,
    );
    expect(result[0]).toMatchObject({
      problemSolved: null,
      targetCustomer: null,
      targetIndustry: null,
      valueProposition: "Real value",
    });
  });

  it("clamps confidence into [0, 1]", () => {
    const result = sanitizeOfferingCandidates(
      [candidate({ name: "A", confidence: 1.4 }), candidate({ name: "B", confidence: -0.2 }), candidate({ name: "C", confidence: Number.NaN })],
      KNOWN_URLS,
    );
    expect(result.map((c) => c.confidence)).toEqual([1, 0, 0]);
  });

  it("drops a source page the run never actually crawled", () => {
    const result = sanitizeOfferingCandidates(
      [candidate({ sourcePages: ["https://example.com/services", "https://example.com/made-up-page"] })],
      KNOWN_URLS,
    );
    expect(result[0]!.sourcePages).toEqual(["https://example.com/services"]);
  });

  it("deduplicates a source page listed twice", () => {
    const result = sanitizeOfferingCandidates(
      [candidate({ sourcePages: ["https://example.com/services", "https://example.com/services"] })],
      KNOWN_URLS,
    );
    expect(result[0]!.sourcePages).toEqual(["https://example.com/services"]);
  });

  it("merges an exact-name duplicate's source pages into the first occurrence instead of creating a second offering", () => {
    const result = sanitizeOfferingCandidates(
      [
        candidate({ name: "Managed IAM Services", sourcePages: ["https://example.com/services"] }),
        candidate({ name: "managed iam services", sourcePages: ["https://example.com/about"], description: "A different description." }),
      ],
      KNOWN_URLS,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe("24/7 managed identity and access management.");
    expect(result[0]!.sourcePages.sort()).toEqual(["https://example.com/about", "https://example.com/services"]);
  });

  it("keeps genuinely distinct offerings separate", () => {
    const result = sanitizeOfferingCandidates(
      [candidate({ name: "Managed IAM Services" }), candidate({ name: "IAM Consulting" })],
      KNOWN_URLS,
    );
    expect(result.map((c) => c.name)).toEqual(["Managed IAM Services", "IAM Consulting"]);
  });

  it("returns an empty list unchanged", () => {
    expect(sanitizeOfferingCandidates([], KNOWN_URLS)).toEqual([]);
  });
});
