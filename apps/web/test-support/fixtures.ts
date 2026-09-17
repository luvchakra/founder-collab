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

// --- prospect detail page ------------------------------------------------------------

import type { Contact } from "@cofounderai/module-discovery/lib/contacts/types";
import type { ProspectResearch } from "@cofounderai/module-discovery/lib/research/types";
import type { ProspectScore } from "@cofounderai/module-discovery/lib/scoring/types";
import type { OutreachStrategy } from "@cofounderai/module-discovery/lib/outreach/types";
import type { Message } from "@cofounderai/module-discovery/lib/messages/types";
import type { Conversation } from "@cofounderai/module-discovery/lib/conversations/types";

export function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    first_name: "Sarah",
    last_name: "Miller",
    job_title: "VP Engineering",
    email: "sarah@globex.example",
    linkedin_url: null,
    phone: null,
    status: "active",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function research(overrides: Partial<ProspectResearch> = {}): ProspectResearch {
  return {
    id: "res-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    summary: "Globex sells widgets online and processes returns by hand.",
    pain_points: ["manual returns"],
    buying_signals: ["hiring support staff"],
    recent_events: ["raised a seed round"],
    recommended_angle: "Lead with time saved per return",
    evidence: [{ claim: "Hiring three support reps", source_url: "https://jobs.example", confidence: "fact" }],
    researched_at: NOW,
    expires_at: null,
    ...overrides,
  };
}

export function score(overrides: Partial<ProspectScore> = {}): ProspectScore {
  return {
    id: "score-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    icp_score: 90,
    intent_score: 80,
    timing_score: 70,
    overall_score: 84,
    reasoning: "Strong ICP match.",
    created_at: NOW,
    ...overrides,
  };
}

export function strategy(overrides: Partial<OutreachStrategy> = {}): OutreachStrategy {
  return {
    id: "strat-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    contact_id: null,
    strategy: "Open on their returns backlog",
    channel: "email",
    reason: "They just hired support staff",
    key_message: "Cut manual return handling",
    cta: "15-minute discovery call",
    status: "draft",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    contact_id: null,
    conversation_id: null,
    channel: "email",
    direction: "outbound",
    subject: "Cutting your returns backlog",
    content: "Hi Sarah — noticed you're hiring support staff.",
    status: "draft",
    classification: null,
    recommended_action: null,
    sent_at: null,
    failure_reason: null,
    provider_message_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    contact_id: null,
    channel: "email",
    status: "awaiting_reply",
    last_message_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}
