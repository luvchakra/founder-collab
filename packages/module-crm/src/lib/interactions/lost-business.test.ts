import { describe, expect, it } from "vitest";
import { formatAge, toPotentialLostBusinessQueueRow, type PotentialLostBusinessRow } from "./lost-business";

const NOW = new Date("2026-09-11T12:00:00.000Z");

const baseRow: PotentialLostBusinessRow = {
  interactionId: "int-1",
  conversationId: "conv-1",
  partyId: "party-1",
  channel: "whatsapp",
  contentExcerpt: "Is this in stock?",
  occurredAt: "2026-09-11T10:00:00.000Z",
  intent: null,
  opportunityId: null,
  responseDueAt: null,
};

describe("toPotentialLostBusinessQueueRow", () => {
  it("computes age in milliseconds since occurred_at", () => {
    expect(toPotentialLostBusinessQueueRow(baseRow, NOW).ageMs).toBe(2 * 60 * 60 * 1000);
  });

  it("is not overdue when there's no response_due_at at all", () => {
    expect(toPotentialLostBusinessQueueRow(baseRow, NOW).overdue).toBe(false);
  });

  it("is overdue when response_due_at is in the past", () => {
    const row = { ...baseRow, responseDueAt: "2026-09-11T11:00:00.000Z" };
    expect(toPotentialLostBusinessQueueRow(row, NOW).overdue).toBe(true);
  });

  it("is not overdue when response_due_at is still in the future", () => {
    const row = { ...baseRow, responseDueAt: "2026-09-11T13:00:00.000Z" };
    expect(toPotentialLostBusinessQueueRow(row, NOW).overdue).toBe(false);
  });
});

describe("formatAge", () => {
  it("shows minutes under an hour", () => {
    expect(formatAge(45 * 60_000)).toBe("45m");
  });

  it("shows hours under a day", () => {
    expect(formatAge(5 * 60 * 60_000)).toBe("5h");
  });

  it("shows whole days beyond that", () => {
    expect(formatAge(3 * 24 * 60 * 60_000)).toBe("3d");
  });

  it("collapses non-positive ages to 'just now'", () => {
    expect(formatAge(0)).toBe("just now");
    expect(formatAge(-1000)).toBe("just now");
  });
});
