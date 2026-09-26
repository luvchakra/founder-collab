import { describe, expect, it } from "vitest";
import { buildBuyerPersonIntelligence, computeBuyerIntelligence } from "./intelligence";
import type { Contact } from "../contacts/types";
import type { BuyerPersona } from "../personas/types";
import type { EvidenceItem } from "../research/types";

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

describe("buildBuyerPersonIntelligence", () => {
  it("returns low confidence for a contact with nothing on file", () => {
    const result = buildBuyerPersonIntelligence({
      contact: contact({ job_title: null, email: null, phone: null, linkedin_url: null }),
      persona: null,
      icpRoles: [],
      evidence: [],
    });
    expect(result.confidence).toBe("low");
    expect(result.name).toBe("Priya Sharma");
  });

  it("falls back to a placeholder name when no name is on file", () => {
    const result = buildBuyerPersonIntelligence({
      contact: contact({ first_name: null, last_name: null }),
      persona: null,
      icpRoles: [],
      evidence: [],
    });
    expect(result.name).toBe("Unnamed contact");
  });

  it("returns high confidence when title, persona, evidence, and a contact channel are all present", () => {
    const evidence: EvidenceItem[] = [
      {
        statement: "CISO hired last month.",
        source: null,
        source_url: null,
        observed_at: null,
        supporting_signal: null,
        evidence_type: "fact",
        confidence: "high",
      },
    ];
    const result = buildBuyerPersonIntelligence({
      contact: contact({ job_title: "CISO", email: "priya@example.com" }),
      persona: persona({ title: "CISO" }),
      icpRoles: [],
      evidence,
    });
    expect(result.confidence).toBe("high");
    expect(result.relevance).toBe("high");
    expect(result.supportingEvidence).toHaveLength(1);
  });
});

describe("computeBuyerIntelligence", () => {
  it("returns every contact, even with no personas or evidence at all", () => {
    const result = computeBuyerIntelligence([contact({ id: "c1" }), contact({ id: "c2" })], [], [], []);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.persona === null)).toBe(true);
  });
});
