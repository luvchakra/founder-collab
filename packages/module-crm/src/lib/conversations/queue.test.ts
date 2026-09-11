import { describe, expect, it } from "vitest";
import { applyConversationQueueFilters, computeConversationFlags } from "./queue";
import type { ConversationQueueRow } from "./queue";

const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("computeConversationFlags", () => {
  it("needsResponse is true when an interaction still requires a response", () => {
    const flags = computeConversationFlags([{ requiresResponse: true, respondedAt: null, responseDueAt: null, intentConfidence: null }], NOW);
    expect(flags.needsResponse).toBe(true);
  });

  it("needsResponse is false once the interaction has been responded to", () => {
    const flags = computeConversationFlags([{ requiresResponse: true, respondedAt: "2026-06-15T10:00:00.000Z", responseDueAt: null, intentConfidence: null }], NOW);
    expect(flags.needsResponse).toBe(false);
  });

  it("overdue is true only when an unresponded interaction's response_due_at has passed", () => {
    const overdue = computeConversationFlags([{ requiresResponse: true, respondedAt: null, responseDueAt: "2026-06-15T00:00:00.000Z", intentConfidence: null }], NOW);
    expect(overdue.overdue).toBe(true);

    const notYetDue = computeConversationFlags([{ requiresResponse: true, respondedAt: null, responseDueAt: "2026-06-20T00:00:00.000Z", intentConfidence: null }], NOW);
    expect(notYetDue.overdue).toBe(false);

    const noDueDate = computeConversationFlags([{ requiresResponse: true, respondedAt: null, responseDueAt: null, intentConfidence: null }], NOW);
    expect(noDueDate.overdue).toBe(false);
  });

  it("highIntent is true when any interaction clears the threshold", () => {
    const high = computeConversationFlags([{ requiresResponse: false, respondedAt: null, responseDueAt: null, intentConfidence: 0.85 }], NOW);
    expect(high.highIntent).toBe(true);

    const low = computeConversationFlags([{ requiresResponse: false, respondedAt: null, responseDueAt: null, intentConfidence: 0.2 }], NOW);
    expect(low.highIntent).toBe(false);
  });

  it("returns all false for a conversation with no interactions", () => {
    expect(computeConversationFlags([], NOW)).toEqual({ needsResponse: false, overdue: false, highIntent: false });
  });
});

function conversationRow(overrides: Partial<ConversationQueueRow>): ConversationQueueRow {
  return {
    id: "c1",
    business_id: "b1",
    party_id: null,
    primary_channel: "whatsapp",
    status: "new",
    lead_id: null,
    opportunity_id: null,
    assigned_to: null,
    last_interaction_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    partyName: "Acme",
    needsResponse: false,
    overdue: false,
    highIntent: false,
    ...overrides,
  };
}

describe("applyConversationQueueFilters", () => {
  it("filters to only conversations that need a response", () => {
    const rows = [conversationRow({ id: "a", needsResponse: true }), conversationRow({ id: "b", needsResponse: false })];
    expect(applyConversationQueueFilters(rows, { needsResponse: true }, null).map((r) => r.id)).toEqual(["a"]);
  });

  it("assignedToMe compares against the viewer's own employee id", () => {
    const rows = [conversationRow({ id: "mine", assigned_to: "emp-1" }), conversationRow({ id: "theirs", assigned_to: "emp-2" })];
    expect(applyConversationQueueFilters(rows, { assignedToMe: true }, "emp-1").map((r) => r.id)).toEqual(["mine"]);
  });

  it("assignedToMe matches nothing when the viewer has no employee record", () => {
    const rows = [conversationRow({ id: "a", assigned_to: "emp-1" })];
    expect(applyConversationQueueFilters(rows, { assignedToMe: true }, null)).toEqual([]);
  });

  it("ownerId='unassigned' matches conversations with no owner", () => {
    const rows = [conversationRow({ id: "unassigned", assigned_to: null }), conversationRow({ id: "assigned", assigned_to: "emp-1" })];
    expect(applyConversationQueueFilters(rows, { ownerId: "unassigned" }, null).map((r) => r.id)).toEqual(["unassigned"]);
  });

  it("ownerId with a real id matches that specific owner", () => {
    const rows = [conversationRow({ id: "a", assigned_to: "emp-1" }), conversationRow({ id: "b", assigned_to: "emp-2" })];
    expect(applyConversationQueueFilters(rows, { ownerId: "emp-2" }, null).map((r) => r.id)).toEqual(["b"]);
  });

  it("combines channel, status, overdue and high-intent filters", () => {
    const rows = [
      conversationRow({ id: "match", primary_channel: "whatsapp", status: "open", overdue: true, highIntent: true }),
      conversationRow({ id: "wrong-channel", primary_channel: "email", status: "open", overdue: true, highIntent: true }),
    ];
    const result = applyConversationQueueFilters(rows, { channel: "whatsapp", status: "open", overdue: true, highIntent: true }, null);
    expect(result.map((r) => r.id)).toEqual(["match"]);
  });

  it("returns every row when no filters are set", () => {
    const rows = [conversationRow({ id: "a" }), conversationRow({ id: "b" })];
    expect(applyConversationQueueFilters(rows, {}, null).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
