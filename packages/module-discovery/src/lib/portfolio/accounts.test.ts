import { describe, expect, it } from "vitest";
import { accountKeyFor, groupIntoCrossOfferingAccounts } from "./accounts";
import type { OpportunitySummary } from "./types";
import type { Prospect } from "../prospects/types";

function prospect(overrides: Partial<Prospect> & { id: string; workspace_id: string; company_name: string }): Prospect {
  return {
    website: null,
    domain: null,
    industry: null,
    company_size: null,
    location: null,
    description: null,
    status: "new",
    outcome: "open",
    fit_score: null,
    linkedin_url: null,
    twitter_url: null,
    company_email: null,
    party_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("accountKeyFor", () => {
  it("keys on domain, case-insensitively, when one is on file", () => {
    const a = accountKeyFor({ domain: "Acme.com", company_name: "Acme Corp" });
    const b = accountKeyFor({ domain: "acme.com", company_name: "Acme Corporation Inc" });
    expect(a).toBe(b);
  });

  it("falls back to a normalized company name when no domain is on file", () => {
    const a = accountKeyFor({ domain: null, company_name: "  Acme   Corp  " });
    const b = accountKeyFor({ domain: null, company_name: "acme corp" });
    expect(a).toBe(b);
  });

  it("treats a domain match and a name-only match as different accounts (never guesses a merge across the two signals)", () => {
    const withDomain = accountKeyFor({ domain: "acme.com", company_name: "Acme Corp" });
    const withoutDomain = accountKeyFor({ domain: null, company_name: "Acme Corp" });
    expect(withDomain).not.toBe(withoutDomain);
  });
});

describe("groupIntoCrossOfferingAccounts", () => {
  it("groups the same company (by domain) across two offerings, each with its own best open opportunity", () => {
    const acmeIam = prospect({ id: "p1", workspace_id: "w1", company_name: "Acme Corp", domain: "acme.com" });
    const acmeTraining = prospect({ id: "p2", workspace_id: "w2", company_name: "Acme Corporation", domain: "acme.com" });
    const opportunities: OpportunitySummary[] = [
      { workspace_id: "w1", prospect_id: "p1", status: "new", score: 91, priority: "high" },
      { workspace_id: "w2", prospect_id: "p2", status: "reviewing", score: 68, priority: "medium" },
    ];

    const result = groupIntoCrossOfferingAccounts(
      [
        { prospect: acmeIam, productId: "iam", productName: "Managed IAM" },
        { prospect: acmeTraining, productId: "training", productName: "IAM Training" },
      ],
      opportunities,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.companyName).toBe("Acme Corp");
    expect(result[0]!.offerings).toHaveLength(2);
    const iamEntry = result[0]!.offerings.find((o) => o.productId === "iam");
    expect(iamEntry?.score).toBe(91);
    expect(iamEntry?.bin).toBe("hot");
  });

  it("excludes a company only on file under a single offering", () => {
    const single = prospect({ id: "p1", workspace_id: "w1", company_name: "Solo Inc", domain: "solo.com" });
    const result = groupIntoCrossOfferingAccounts([{ prospect: single, productId: "iam", productName: "Managed IAM" }], []);
    expect(result).toHaveLength(0);
  });

  it("picks the highest-scored still-open opportunity per prospect, ignoring resolved ones", () => {
    const p = prospect({ id: "p1", workspace_id: "w1", company_name: "Acme Corp", domain: "acme.com" });
    const q = prospect({ id: "p2", workspace_id: "w2", company_name: "Acme Corp", domain: "acme.com" });
    const opportunities: OpportunitySummary[] = [
      { workspace_id: "w1", prospect_id: "p1", status: "dismissed", score: 95, priority: "high" },
      { workspace_id: "w1", prospect_id: "p1", status: "new", score: 60, priority: "low" },
    ];
    const result = groupIntoCrossOfferingAccounts(
      [
        { prospect: p, productId: "a", productName: "A" },
        { prospect: q, productId: "b", productName: "B" },
      ],
      opportunities,
    );
    const entry = result[0]!.offerings.find((o) => o.productId === "a");
    expect(entry?.score).toBe(60);
  });

  it("shows no score/priority/bin for a prospect with no opportunity at all", () => {
    const p = prospect({ id: "p1", workspace_id: "w1", company_name: "Acme Corp", domain: "acme.com" });
    const q = prospect({ id: "p2", workspace_id: "w2", company_name: "Acme Corp", domain: "acme.com" });
    const result = groupIntoCrossOfferingAccounts(
      [
        { prospect: p, productId: "a", productName: "A" },
        { prospect: q, productId: "b", productName: "B" },
      ],
      [],
    );
    const entry = result[0]!.offerings.find((o) => o.productId === "a");
    expect(entry).toEqual({ productId: "a", productName: "A", prospectId: "p1", score: null, priority: null, bin: null });
  });
});
