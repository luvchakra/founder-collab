// EXP-FND-08 -- Investor outreach export: the page's status filter, every step's time,
// origin labelled, no email body or provider identifiers.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listOutreachForExport: vi.fn(), listRounds: vi.fn() }));
vi.mock("./queries", () => ({ listOutreachForExport: h.listOutreachForExport }));
vi.mock("../../lib/funding/queries", () => ({ listRounds: h.listRounds }));

import { fundingOutreachExport } from "./outreach";
import { BUSINESS_ID, ROUND_ID, allCellText, exportContext, headers, params, round, rowValues } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listRounds.mockResolvedValue([round()]);
  h.listOutreachForExport.mockResolvedValue([
    {
      id: "o-1",
      investorId: "i-1",
      investorName: "Blue Fund",
      contactId: null,
      roundId: ROUND_ID,
      subject: "Intro",
      body: "SECRET BODY",
      personalizationNotes: null,
      cta: null,
      status: "replied",
      origin: "user",
      approvedAt: "2026-09-20T00:00:00Z",
      recipientEmail: "deals@bluefund.example",
      sentAt: "2026-09-21T00:00:00Z",
      providerMessageId: null,
      failureReason: null,
      updatedAt: "2026-09-22T00:00:00Z",
      createdAt: "2026-09-19T00:00:00Z",
    },
  ]);
});

describe("EXP-FND-08 funding.outreach", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingOutreachExport.id).toBe("funding.outreach");
    expect(fundingOutreachExport.module).toBe("discovery");
    expect(fundingOutreachExport.permissions).toEqual(["funding.view"]);
  });

  it("passes the status filter with the context's business; unknown statuses are ignored", async () => {
    const filters = fundingOutreachExport.parseFilters!(params({ status: "sent" }));
    await fundingOutreachExport.load(exportContext(), filters);
    expect(h.listOutreachForExport).toHaveBeenCalledWith(BUSINESS_ID, { status: "sent" });
    expect(fundingOutreachExport.parseFilters!(params({ status: "deleted" }))).toEqual({ status: undefined });
  });

  it("exports the outreach fields with labels", async () => {
    const wb = await fundingOutreachExport.load(exportContext(), {});
    expect(headers(wb, "Outreach")).toEqual([
      "Investor", "Recipient", "Round", "Outreach type", "Subject", "Origin", "Status", "Created", "Approved", "Sent", "Response", "Failure reason", "Updated",
    ]);
    expect(rowValues(wb, "Outreach")).toMatchObject({ Investor: "Blue Fund", Round: "Seed 2026", Origin: "Written by a person", Status: "Replied", Response: "Replied" });
    expect(allCellText(wb)).not.toContain("SECRET BODY");
  });
});
