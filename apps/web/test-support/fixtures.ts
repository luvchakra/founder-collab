/**
 * Fixtures for the App Router page tests. Pages are `async` server components, so their
 * tests call them directly with mocked query modules and render what comes back — which
 * means every test needs whole, type-correct rows rather than the partials a `satisfies`
 * cast would let through. Each builder returns a complete row and takes overrides for the
 * one or two fields the test is actually about.
 */
import type { Business, Product, Workspace } from "@cofounderai/module-discovery/lib/tenancy/types";
import type { AccountWorkspaceEntry } from "@cofounderai/module-discovery/lib/dashboard/queries";
import type { Prospect } from "@cofounderai/module-discovery/lib/prospects/types";
import type { ProspectPipelineState } from "@cofounderai/module-discovery/lib/prospects/pipeline";

const NOW = "2026-01-01T00:00:00Z";

export function business(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz-1",
    account_id: "acct-1",
    name: "Acme",
    description: null,
    website: null,
    industry: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    business_id: "biz-1",
    name: "Returns Autopilot",
    description: null,
    website: null,
    status: "active",
    product_profile: null,
    product_profile_generated_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    product_id: "prod-1",
    name: "Returns Autopilot GTM",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** One business/product/workspace triple, wired together by id unless overridden. */
export function workspaceEntry(
  overrides: { business?: Partial<Business>; product?: Partial<Product>; workspace?: Partial<Workspace> } = {},
): AccountWorkspaceEntry {
  const b = business(overrides.business);
  const p = product({ business_id: b.id, ...overrides.product });
  const w = workspace({ product_id: p.id, ...overrides.workspace });
  return { business: b, product: p, workspace: w };
}

export function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: "prospect-1",
    workspace_id: "ws-1",
    company_name: "Globex",
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
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function prospectWithPipeline(
  overrides: Partial<Prospect & ProspectPipelineState> = {},
): Prospect & ProspectPipelineState {
  const { stage, nextAction, lastActivityAt, isStuck, ...row } = overrides;
  return {
    ...prospect(row),
    stage: stage ?? "new",
    nextAction: nextAction ?? "Research this prospect",
    lastActivityAt: lastActivityAt ?? NOW,
    isStuck: isStuck ?? false,
  };
}

export function productProfile(
  overrides: Partial<import("@cofounderai/module-discovery/lib/ai/schemas").ProductProfile> = {},
): import("@cofounderai/module-discovery/lib/ai/schemas").ProductProfile {
  return {
    category: "B2B SaaS - returns automation",
    problem: "Shops approve every return by hand",
    solution: "Auto-approves returns that match the policy",
    features: ["policy rules"],
    differentiators: ["no plugin needed"],
    target_industries: ["E-commerce"],
    target_roles: ["Ops Manager"],
    use_cases: ["returns triage"],
    pricing_summary: null,
    competitive_positioning: "cheaper than Loop",
    confidence: 0.82,
    ...overrides,
  };
}
