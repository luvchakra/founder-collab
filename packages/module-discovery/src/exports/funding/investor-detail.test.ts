// EXP-FND-06 -- Investor detail export: the investor loaded with the context's business
// (another business's investor is a 404), research with provenance and source URLs.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getInvestor: vi.fn(),
  listInvestorContacts: vi.fn(),
  listResearch: vi.fn(),
  listPipeline: vi.fn(),
  listRounds: vi.fn(),
  listInteractions: vi.fn(),
  listOutreach: vi.fn(),
}));
vi.mock("../../lib/funding/queries", () => h);

import { fundingInvestorExport } from "./investor-detail";
import { BUSINESS_ID, INVESTOR_ID, allCellText, exportContext, headers, investor, params, pipelineRecord, round, rowValues } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.getInvestor.mockResolvedValue(investor());
  h.listInvestorContacts.mockResolvedValue([{ id: "ct-1", name: "Priya Rao", jobTitle: "Partner", email: "priya@bluefund.example", linkedinUrl: null, isPrimary: true }]);
  h.listResearch.mockResolvedValue([
    { id: "f-1", investorId: INVESTOR_ID, field: "thesis", content: "B2B fintech", provenance: "source_backed", sourceUrl: "https://bluefund.example/thesis", sourceTitle: "Our thesis", observedAt: "2020-01-01T00:00:00Z" },
    { id: "f-2", investorId: INVESTOR_ID, field: "founder_fit", content: "Likes repeat founders", provenance: "ai_inferred", sourceUrl: null, sourceTitle: null, observedAt: new Date().toISOString() },
  ]);
  h.listPipeline.mockResolvedValue([pipelineRecord()]);
  h.listRounds.mockResolvedValue([round(), round({ id: "r-other", name: "Other" })]);
  h.listInteractions.mockResolvedValue([
    { id: "in-1", investorId: INVESTOR_ID, investorName: "Blue Fund", contactId: null, roundId: null, interactionType: "follow_up", occurredAt: "2026-09-21T00:00:00Z", subject: "Deck", notes: null, outcome: "Positive", nextAction: null, nextActionDue: null, source: "manual" },
  ]);
  h.listOutreach.mockResolvedValue([
    { id: "o-1", investorId: INVESTOR_ID, investorName: "Blue Fund", contactId: null, roundId: null, subject: "Intro", body: "SECRET BODY", personalizationNotes: null, cta: null, status: "sent", origin: "ai_draft", approvedAt: null, recipientEmail: "deals@bluefund.example", sentAt: "2026-09-22T00:00:00Z", providerMessageId: "prov-msg-123", failureReason: null, updatedAt: "2026-09-22T00:00:00Z" },
  ]);
});

describe("EXP-FND-06 funding.investor", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingInvestorExport.id).toBe("funding.investor");
    expect(fundingInvestorExport.module).toBe("discovery");
    expect(fundingInvestorExport.permissions).toEqual(["funding.view"]);
  });

  it("loads the investor with the context's business, never one from the request", async () => {
    await fundingInvestorExport.load(exportContext(), fundingInvestorExport.parseFilters!(params({ investorId: INVESTOR_ID })));
    expect(h.getInvestor).toHaveBeenCalledWith(BUSINESS_ID, INVESTOR_ID);
    for (const fn of Object.values(h)) expect(fn.mock.calls[0]?.[0]).toBe(BUSINESS_ID);
    expect(h.listInvestorContacts).toHaveBeenCalledWith(BUSINESS_ID, "party-1");
  });

  it("is a 404 when the investor is not this business's", async () => {
    h.getInvestor.mockResolvedValue(null);
    await expect(fundingInvestorExport.load(exportContext(), { investorId: INVESTOR_ID })).rejects.toMatchObject({ status: 404 });
    await expect(fundingInvestorExport.load(exportContext(), fundingInvestorExport.parseFilters!(params({ investorId: "not-an-id" })))).rejects.toMatchObject({ status: 404 });
  });

  it("exports every sheet; research carries provenance and source URL", async () => {
    const wb = await fundingInvestorExport.load(exportContext(), { investorId: INVESTOR_ID });
    expect(wb.sheets.map((s) => s.sheetName)).toEqual(["Investor", "Contacts", "Research", "Pipeline", "Interactions", "Outreach", "Rounds"]);
    expect(headers(wb, "Research")).toEqual(["Field", "Finding", "Provenance", "Source title", "Source URL", "Observed", "Older than 90 days"]);
    expect(rowValues(wb, "Research", 0)).toMatchObject({ Field: "Investment thesis", Provenance: "Source-backed", "Source URL": "https://bluefund.example/thesis", "Older than 90 days": true });
    expect(rowValues(wb, "Research", 1)).toMatchObject({ Field: "Founder fit", Provenance: "AI-inferred", "Older than 90 days": false });
    expect(rowValues(wb, "Pipeline")).toMatchObject({ Round: "Seed 2026", Stage: "Meeting", "Previous stage": "Contacted", "Committed amount": null });
    expect(rowValues(wb, "Interactions")).toMatchObject({ Type: "Follow-up", "Recorded from": "Logged by a person" });
    expect(rowValues(wb, "Outreach")).toMatchObject({ Subject: "Intro", Status: "Sent", Origin: "AI draft" });
    expect(rowValues(wb, "Rounds")).toMatchObject({ Round: "Seed 2026", "Investor's stage": "Meeting" });
    expect(rowValues(wb, "Investor", 0)).toEqual({ Field: "Investor", Value: "Blue Fund" });
  });

  it("never exports an outreach body or the provider's message id", async () => {
    const text = allCellText(await fundingInvestorExport.load(exportContext(), { investorId: INVESTOR_ID }));
    expect(text).not.toContain("SECRET BODY");
    expect(text).not.toContain("prov-msg-123");
  });
});
