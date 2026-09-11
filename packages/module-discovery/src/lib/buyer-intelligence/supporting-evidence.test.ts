import { describe, expect, it } from "vitest";
import { findSupportingEvidence } from "./supporting-evidence";
import type { EvidenceItem } from "../research/types";

function evidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    statement: "The company hired a new CISO last month.",
    source: "LinkedIn",
    source_url: null,
    observed_at: "2026-08-01",
    supporting_signal: null,
    evidence_type: "fact",
    confidence: "high",
    ...overrides,
  };
}

describe("findSupportingEvidence", () => {
  it("matches evidence mentioning the contact's job title", () => {
    const result = findSupportingEvidence(
      { first_name: "Priya", last_name: "Sharma", job_title: "CISO" },
      [evidence({ statement: "The company hired a new CISO last month." })],
    );
    expect(result).toHaveLength(1);
  });

  it("matches evidence via supporting_signal even when the statement doesn't mention the person", () => {
    const result = findSupportingEvidence(
      { first_name: null, last_name: null, job_title: "VP Sales" },
      [evidence({ statement: "Expansion into a new region.", supporting_signal: "New VP Sales hire" })],
    );
    expect(result).toHaveLength(1);
  });

  it("returns no evidence when nothing mentions this contact", () => {
    const result = findSupportingEvidence(
      { first_name: "Priya", last_name: "Sharma", job_title: "CISO" },
      [evidence({ statement: "Unrelated funding news." })],
    );
    expect(result).toHaveLength(0);
  });

  it("returns no evidence when the contact has no name or title at all", () => {
    const result = findSupportingEvidence({ first_name: null, last_name: null, job_title: null }, [evidence({})]);
    expect(result).toHaveLength(0);
  });
});
