import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-09 -- Conversations / WhatsApp export.

const mocks = vi.hoisted(() => ({
  listConversationQueueForExport: vi.fn(),
  getConversationMessagesForExport: vi.fn(),
  listPartiesForExport: vi.fn(),
  getCurrentEmployeeId: vi.fn(),
  listEmployeeOptions: vi.fn(),
}));
vi.mock("./queries", () => ({
  listConversationQueueForExport: mocks.listConversationQueueForExport,
  getConversationMessagesForExport: mocks.getConversationMessagesForExport,
  listPartiesForExport: mocks.listPartiesForExport,
}));
vi.mock("../lib/assignment/queries", () => ({ getCurrentEmployeeId: mocks.getCurrentEmployeeId }));
vi.mock("../lib/tickets/queries", () => ({ listEmployeeOptions: mocks.listEmployeeOptions }));

import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { crmConversationsExport, parseConversationFilters } from "./conversations";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf, serialized } from "./test-support";

function conversation(overrides: Record<string, unknown>) {
  return {
    id: "c",
    business_id: BUSINESS_ID,
    party_id: "p1",
    primary_channel: "whatsapp",
    status: "open",
    lead_id: null,
    opportunity_id: null,
    assigned_to: null,
    last_interaction_at: "2026-09-25T10:00:00Z",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    partyName: "Asha",
    needsResponse: false,
    overdue: false,
    highIntent: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentEmployeeId.mockResolvedValue("emp-me");
  mocks.listEmployeeOptions.mockResolvedValue([{ id: "emp-me", full_name: "Me", email: null }]);
  mocks.listPartiesForExport.mockResolvedValue(new Map([["p1", { id: "p1", name: "Asha", kind: "person", email: null, phone: null }]]));
  mocks.listConversationQueueForExport.mockResolvedValue([
    conversation({ id: "c1", assigned_to: "emp-me", needsResponse: true }),
    conversation({ id: "c2", primary_channel: "email", status: "resolved", partyName: null, party_id: null }),
  ]);
  mocks.getConversationMessagesForExport.mockImplementation(async (businessId: string, id: string) =>
    businessId === BUSINESS_ID && (id === "c1" || id === "c2")
      ? {
          conversation: conversation({ id, party_id: "p1" }),
          messages: [
            {
              id: "m1",
              direction: "inbound",
              channel: "whatsapp",
              interaction_type: "message",
              occurred_at: "2026-09-25T09:00:00Z",
              content_excerpt: "Do you have the drill in stock?",
              status: "received",
              provider_status: null,
            },
            {
              id: "m2",
              direction: "outbound",
              channel: "whatsapp",
              interaction_type: "template",
              occurred_at: "2026-09-25T09:05:00Z",
              content_excerpt: "Yes, 3 available.",
              status: "responded",
              provider_status: "delivered",
            },
          ],
        }
      : null,
  );
});

describe("crm.conversations (EXP-CRM-09)", () => {
  it("requires the explicit CRM read permission and licence", () => {
    expect(crmConversationsExport.id).toBe("crm.conversations");
    expect(crmConversationsExport.module).toBe("crm");
    expect(crmConversationsExport.permissions).toEqual(["crm.view"]);
  });

  it("parses only the inbox's own filters", () => {
    expect(parseConversationFilters(requestParams({ status: "archived", tenantId: "t-9" }))).toEqual({
      conversationId: "",
      needsResponse: false,
      assignedToMe: false,
      overdue: false,
      highIntent: false,
      channel: "",
      status: "",
      ownerId: "",
    });
    expect(parseConversationFilters(requestParams({ needsResponse: "1", channel: "whatsapp", status: "open", ownerId: "unassigned" }))).toMatchObject({
      needsResponse: true,
      channel: "whatsapp",
      status: "open",
      ownerId: "unassigned",
    });
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams()));
    expect(mocks.listConversationQueueForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.getCurrentEmployeeId).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.getConversationMessagesForExport).toHaveBeenCalledWith(BUSINESS_ID, "c1");
  });

  it("refuses a conversation that isn't this business's", async () => {
    await expect(
      crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams({ conversationId: "c-foreign" }))),
    ).rejects.toBeInstanceOf(ExportDeniedError);
  });

  it("filters the list like the inbox (one filter, several filters, empty)", async () => {
    const mine = await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams({ assignedToMe: "1" })));
    expect(rowsOf(mine, "Conversations").map((r) => r.Contact)).toEqual(["Asha"]);

    const resolvedEmail = await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams({ channel: "email", status: "resolved" })));
    expect(rowsOf(resolvedEmail, "Conversations")).toEqual([
      expect.objectContaining({ Contact: "Unknown contact", Channel: "Email", Status: "Resolved", Owner: "Unassigned" }),
    ]);

    const none = await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams({ highIntent: "1" })));
    expect(rowsOf(none, "Conversations")).toEqual([]);
    expect(rowsOf(none, "Messages")).toEqual([]);
  });

  it("exports the open conversation's messages with direction, parties and delivery status", async () => {
    const workbook = await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams({ conversationId: "c1" })));
    expect(workbook.csvSheet).toBe("Messages");
    expect(headers(workbook, "Messages")).toEqual([
      "Timestamp",
      "Direction",
      "Channel",
      "Sender",
      "Recipient",
      "Message type",
      "Delivery status",
      "Message text",
    ]);
    expect(rowsOf(workbook, "Messages")).toEqual([
      {
        Timestamp: "2026-09-25T09:00:00Z",
        Direction: "Inbound",
        Channel: "WhatsApp",
        Sender: "Asha",
        Recipient: "Acme Traders",
        "Message type": "Message",
        "Delivery status": "",
        "Message text": "Do you have the drill in stock?",
      },
      {
        Timestamp: "2026-09-25T09:05:00Z",
        Direction: "Outbound",
        Channel: "WhatsApp",
        Sender: "Acme Traders",
        Recipient: "Asha",
        "Message type": "Template",
        "Delivery status": "Delivered",
        "Message text": "Yes, 3 available.",
      },
    ]);
  });

  it("CSV is the conversation list unless a conversation was opened", async () => {
    const workbook = await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams()));
    expect(workbook.csvSheet).toBeUndefined();
    expect(workbook.sheets[0]!.sheetName).toBe("Conversations");
  });

  it("carries no ids, tokens, media or metadata", async () => {
    const text = serialized(await crmConversationsExport.load(exportContext(), parseConversationFilters(requestParams({ conversationId: "c1" }))));
    for (const forbidden of ["m1", "emp-me", BUSINESS_ID, "metadata", "media", "token"]) expect(text).not.toContain(forbidden);
  });
});
