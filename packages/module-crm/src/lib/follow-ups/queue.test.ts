import { describe, expect, it } from "vitest";
import { applyFollowUpQueueFilters } from "./queue";
import type { FollowUpQueueRow } from "./types";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function row(overrides: Partial<FollowUpQueueRow>): FollowUpQueueRow {
  return {
    id: "f1",
    business_id: "b1",
    party_id: null,
    lead_id: null,
    opportunity_id: null,
    conversation_id: null,
    activity_id: null,
    owner_id: "emp-1",
    due_at: "2026-06-15T09:00:00.000Z",
    status: "pending",
    priority: "normal",
    snoozed_until: null,
    completed_at: null,
    created_at: "2026-06-01",
    updated_at: "2026-06-01",
    partyName: "Acme",
    source: "discovery",
    channel: "whatsapp",
    ...overrides,
  };
}

describe("applyFollowUpQueueFilters", () => {
  it("due_today keeps only items due within today's calendar day", () => {
    const rows = [
      row({ id: "today", due_at: "2026-06-15T20:00:00.000Z" }),
      row({ id: "yesterday", due_at: "2026-06-14T20:00:00.000Z" }),
      row({ id: "tomorrow", due_at: "2026-06-16T01:00:00.000Z" }),
    ];
    expect(applyFollowUpQueueFilters(rows, { view: "due_today" }, NOW).map((r) => r.id)).toEqual(["today"]);
  });

  it("overdue keeps only items due before today started", () => {
    const rows = [row({ id: "yesterday", due_at: "2026-06-14T20:00:00.000Z" }), row({ id: "today", due_at: "2026-06-15T20:00:00.000Z" })];
    expect(applyFollowUpQueueFilters(rows, { view: "overdue" }, NOW).map((r) => r.id)).toEqual(["yesterday"]);
  });

  it("upcoming keeps only items due after today ends", () => {
    const rows = [row({ id: "today", due_at: "2026-06-15T20:00:00.000Z" }), row({ id: "next-week", due_at: "2026-06-22T09:00:00.000Z" })];
    expect(applyFollowUpQueueFilters(rows, { view: "upcoming" }, NOW).map((r) => r.id)).toEqual(["next-week"]);
  });

  it("unassigned keeps only items with no owner", () => {
    const rows = [row({ id: "owned", owner_id: "emp-1" }), row({ id: "unowned", owner_id: null })];
    expect(applyFollowUpQueueFilters(rows, { view: "unassigned" }, NOW).map((r) => r.id)).toEqual(["unowned"]);
  });

  it("high_priority keeps only priority='high' items", () => {
    const rows = [row({ id: "normal", priority: "normal" }), row({ id: "urgent", priority: "high" })];
    expect(applyFollowUpQueueFilters(rows, { view: "high_priority" }, NOW).map((r) => r.id)).toEqual(["urgent"]);
  });

  it("combines a view with owner/source/channel/priority filters", () => {
    const rows = [
      row({ id: "match", priority: "high", source: "discovery", channel: "whatsapp", owner_id: "emp-1" }),
      row({ id: "wrong-source", priority: "high", source: "referral", channel: "whatsapp", owner_id: "emp-1" }),
    ];
    const result = applyFollowUpQueueFilters(rows, { view: "high_priority", source: "discovery", channel: "whatsapp", ownerId: "emp-1" }, NOW);
    expect(result.map((r) => r.id)).toEqual(["match"]);
  });

  it("returns every row for the default/'all' view with no filters", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    expect(applyFollowUpQueueFilters(rows, {}, NOW).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
