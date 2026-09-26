// EXP-DISC-04 -- Prospect Detail / Buyer Intelligence export (also EXP-DISC-07 research and
// signal rows, EXP-DISC-08 outreach records).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUSINESS_ID,
  FOREIGN_WORKSPACE_ID,
  OTHER_BUSINESS_ID,
  PRODUCT_ID,
  PROSPECT_ID,
  WORKSPACE_ID,
  headersOf,
  makeContext,
  makeProduct,
  makeWorkspace,
  rowsOf,
  serialized,
  sheetNames,
  tamperedParams,
} from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getProspect: vi.fn(),
  listContacts: vi.fn(),
  getProspectResearch: vi.fn(),
  listRecentProspectScores: vi.fn(),
  getLatestOutreachStrategy: vi.fn(),
  listMessages: vi.fn(),
  listConversations: vi.fn(),
  getResearchBrief: vi.fn(),
  getBuyerIntelligenceForProspect: vi.fn(),
  getWatchlistEntryForProspect: vi.fn(),
  listSignalsForProspect: vi.fn(),
  getDiscoveryHandoffLead: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../../lib/prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../../lib/contacts/queries", () => ({ listContacts: h.listContacts }));
vi.mock("../../lib/research/queries", () => ({ getProspectResearch: h.getProspectResearch }));
vi.mock("../../lib/scoring/queries", () => ({ listRecentProspectScores: h.listRecentProspectScores }));
vi.mock("../../lib/outreach/queries", () => ({ getLatestOutreachStrategy: h.getLatestOutreachStrategy }));
vi.mock("../../lib/messages/queries", () => ({ listMessages: h.listMessages }));
vi.mock("../../lib/conversations/queries", () => ({ listConversations: h.listConversations }));
vi.mock("../../lib/research-briefs/queries", () => ({ getResearchBrief: h.getResearchBrief }));
vi.mock("../../lib/buyer-intelligence/queries", () => ({ getBuyerIntelligenceForProspect: h.getBuyerIntelligenceForProspect }));
vi.mock("../../lib/watchlist/queries", () => ({ getWatchlistEntryForProspect: h.getWatchlistEntryForProspect }));
vi.mock("../../lib/signals/queries", () => ({ listSignalsForProspect: h.listSignalsForProspect }));
vi.mock("@cofounderai/module-crm/contract/index", () => ({ getDiscoveryHandoffLead: h.getDiscoveryHandoffLead }));

const { discoveryProspectDetailExport: adapter } = await import("./prospect-detail");

const params = () => tamperedParams({ prospectId: PROSPECT_ID });

const contact = {
  id: "c1",
  workspace_id: WORKSPACE_ID,
  prospect_id: PROSPECT_ID,
  first_name: "Asha",
  last_name: "Rao",
  job_title: "Head of Ops",
  email: "asha@globex.example",
  linkedin_url: null,
  phone: null,
  status: "active",
  created_at: "2026-09-10T04:30:00Z",
  updated_at: "2026-09-10T04:30:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.getProspect.mockResolvedValue({
    id: PROSPECT_ID,
    workspace_id: WORKSPACE_ID,
    company_name: "Globex",
    website: "https://globex.example",
    domain: "globex.example",
    industry: "Logistics",
    company_size: null,
    location: "Pune",
    description: null,
    status: "qualified",
    outcome: "open",
    fit_score: 78,
    linkedin_url: null,
    twitter_url: null,
    company_email: null,
    party_id: "party-1",
    created_at: "2026-09-10T04:30:00Z",
    updated_at: "2026-09-11T04:30:00Z",
  });
  h.listContacts.mockResolvedValue([contact]);
  h.getProspectResearch.mockResolvedValue({
    id: "r1",
    workspace_id: WORKSPACE_ID,
    prospect_id: PROSPECT_ID,
    summary: "Expanding warehouses",
    pain_points: ["Stock visibility", "Manual counts"],
    buying_signals: ["Hiring ops leads"],
    recent_events: [],
    recommended_angle: null,
    evidence: [
      {
        statement: "Opened two new warehouses",
        source: "Press release",
        source_url: "https://globex.example/news",
        observed_at: "2026-09-01",
        supporting_signal: null,
        evidence_type: "fact",
        confidence: "high",
        source_type: "external",
      },
    ],
    researched_at: "2026-09-11T04:30:00Z",
    expires_at: null,
    ai_run_id: "run-1",
  });
  h.listRecentProspectScores.mockResolvedValue([
    { id: "s1", workspace_id: WORKSPACE_ID, prospect_id: PROSPECT_ID, icp_score: 80, intent_score: 75, timing_score: 70, overall_score: 78, reasoning: "Good fit", created_at: "2026-09-11T05:00:00Z" },
  ]);
  h.getLatestOutreachStrategy.mockResolvedValue(null);
  h.listMessages.mockResolvedValue([
    {
      id: "m1",
      workspace_id: WORKSPACE_ID,
      prospect_id: PROSPECT_ID,
      contact_id: "c1",
      conversation_id: "conv-1",
      channel: "email",
      direction: "outbound",
      subject: "=HYPERLINK(\"x\")",
      content: "Hello Asha",
      status: "sent",
      classification: null,
      recommended_action: null,
      sent_at: "2026-09-12T04:30:00Z",
      failure_reason: null,
      provider_message_id: "prov-msg-secret",
      resend_template_id: "tmpl-internal",
      resend_template_name: null,
      template_variables: { API_TOKEN: "tok-secret" },
      created_at: "2026-09-12T04:00:00Z",
      updated_at: "2026-09-12T04:30:00Z",
    },
  ]);
  h.listConversations.mockResolvedValue([
    { id: "conv-1", workspace_id: WORKSPACE_ID, prospect_id: PROSPECT_ID, contact_id: "c1", channel: "email", status: "awaiting_reply", last_message_at: "2026-09-12T04:30:00Z", created_at: "", updated_at: "" },
  ]);
  h.getResearchBrief.mockResolvedValue(null);
  h.getBuyerIntelligenceForProspect.mockResolvedValue([
    {
      contact,
      name: "Asha Rao",
      title: "Head of Ops",
      seniority: "director",
      persona: null,
      relevance: "high",
      relevanceReason: "Matches ICP role",
      contactability: "medium",
      contactabilityReason: "Email on file",
      supportingEvidence: [{ statement: "Leads warehouse rollout" }],
      confidence: "medium",
    },
  ]);
  h.getWatchlistEntryForProspect.mockResolvedValue(null);
  h.listSignalsForProspect.mockResolvedValue([
    { id: "sig1", workspace_id: WORKSPACE_ID, prospect_id: PROSPECT_ID, signal_type: "buying_signal", description: "Hiring ops leads", source: "Careers page", observed_at: "2026-09-05T00:00:00Z", created_at: "2026-09-11T04:30:00Z" },
  ]);
  h.getDiscoveryHandoffLead.mockResolvedValue({ ok: true, data: null });
});

describe("discovery.prospect (EXP-DISC-04)", () => {
  it("is the Discovery-licensed prospect bundle export", () => {
    expect(adapter.id).toBe("discovery.prospect");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
    expect(adapter.parseFilters!(params())).toEqual({ productId: PRODUCT_ID, prospectId: PROSPECT_ID });
  });

  it("scopes every read to the verified offering and context.businessId", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(params()));
    expect(h.getBuyerIntelligenceForProspect).toHaveBeenCalledWith(WORKSPACE_ID, PROSPECT_ID);
    expect(h.getDiscoveryHandoffLead).toHaveBeenCalledWith(BUSINESS_ID, PROSPECT_ID);
    for (const fn of [h.getBuyerIntelligenceForProspect, h.getDiscoveryHandoffLead]) {
      expect(JSON.stringify(fn.mock.calls)).not.toContain(OTHER_BUSINESS_ID);
      expect(JSON.stringify(fn.mock.calls)).not.toContain(FOREIGN_WORKSPACE_ID);
    }
  });

  it("refuses a prospect from another workspace, and an offering from another business", async () => {
    h.getProspect.mockResolvedValueOnce({ id: PROSPECT_ID, workspace_id: FOREIGN_WORKSPACE_ID });
    await expect(adapter.load(makeContext(), adapter.parseFilters!(params()))).rejects.toMatchObject({ status: 404 });
    h.getProduct.mockResolvedValueOnce(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(params()))).rejects.toMatchObject({ status: 404 });
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams({ prospectId: "nope" })))).rejects.toMatchObject({ status: 404 });
    expect(h.listContacts).not.toHaveBeenCalled();
  });

  it("writes one sheet per dataset with readable labels", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(params()));
    expect(sheetNames(workbook)).toEqual(["Prospect", "Contacts", "Research", "Buyer Intelligence", "Signals", "Scores", "Outreach History"]);
    expect(headersOf(workbook, "Research")).toEqual(["Finding", "Evidence type", "Confidence", "Source", "Source type", "URL", "Observed", "Supporting signal", "Basis"]);
    expect(headersOf(workbook, "Signals")).toEqual(["Signal type", "Signal", "Source", "Signal date", "Basis", "Recorded"]);

    const [prospect] = rowsOf(workbook, "Prospect");
    expect(prospect).toMatchObject({
      Company: "Globex",
      Status: "Qualified",
      Stage: "Sent",
      Outcome: "Open",
      "Fit score": 78,
      "Handed off to CRM": false,
      "CRM handoff source": null,
      "On watchlist": false,
      "Pain points": ["Stock visibility", "Manual counts"],
      "Research basis": "AI-derived",
      "Brief: offering fit": null,
    });
    expect(rowsOf(workbook, "Research")[0]).toMatchObject({ Finding: "Opened two new warehouses", "Evidence type": "Verified fact", Confidence: "High", "Source type": "External" });
    expect(rowsOf(workbook, "Buyer Intelligence")[0]).toMatchObject({ Seniority: "Director", "Relevance to offering": "High", Contactability: "Medium", "Likely committee role": null });
    expect(rowsOf(workbook, "Signals")[0]).toMatchObject({ "Signal type": "Buying signal", Source: "Careers page" });
    expect(rowsOf(workbook, "Scores")[0]).toMatchObject({ "Overall score": 78, "ICP fit": 80 });
    expect(rowsOf(workbook, "Outreach History")[0]).toMatchObject({
      Channel: "Email",
      Direction: "Outbound",
      Contact: "Asha Rao",
      Status: "Sent",
      "Conversation status": "Awaiting reply",
      "Response classification": null,
    });
  });

  it("asks for the whole score history, not only the page's latest two", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(params()));
    expect(h.listRecentProspectScores).toHaveBeenCalledWith(PROSPECT_ID, 1000);
  });

  it("says why CRM handoff is blank when CRM isn't licensed", async () => {
    h.getDiscoveryHandoffLead.mockResolvedValue({ ok: false, error: "MODULE_NOT_LICENSED" });
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(params()));
    expect(rowsOf(workbook, "Prospect")[0]).toMatchObject({ "Handed off to CRM": null, "CRM lead status": null, "CRM handoff source": "CRM not licensed" });
  });

  it("never exports provider message ids, template ids or template variables", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(params()));
    const text = serialized(workbook);
    for (const secret of ["prov-msg-secret", "tmpl-internal", "tok-secret", "API_TOKEN", "run-1", "party-1"]) {
      expect(text).not.toContain(secret);
    }
  });
});
