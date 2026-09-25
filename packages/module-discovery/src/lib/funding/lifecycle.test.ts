/**
 * FND-06/09/11/13. The Funding state machines: approvals cannot be skipped, closed
 * records cannot be reopened, and stages that record money need the figure.
 */
import { describe, expect, it } from "vitest";
import {
  allowedStageMoves,
  canSend,
  checkDiligenceMove,
  checkOutreachMove,
  checkRoundMove,
  checkStageMove,
} from "./lifecycle";

const noMoney = { committedAmount: null, investedAmount: null, currency: null };

describe("investor pipeline", () => {
  it("allows skipping forward, one step back, and passing", () => {
    const moves = allowedStageMoves("contacted");
    expect(moves).toContain("meeting");
    expect(moves).toContain("term_discussion");
    expect(moves).toContain("target");
    expect(moves).not.toContain("identified");
    expect(moves).toContain("passed");
  });

  it("treats Invested as final and reopens a pass only at Target", () => {
    expect(allowedStageMoves("invested")).toEqual([]);
    expect(allowedStageMoves("passed")).toEqual(["target"]);
  });

  it("needs the committed amount to reach Committed, and the received amount to reach Invested", () => {
    expect(checkStageMove("term_discussion", "committed", noMoney).ok).toBe(false);
    expect(checkStageMove("term_discussion", "committed", { ...noMoney, committedAmount: 500000, currency: "INR" }).ok).toBe(true);
    expect(checkStageMove("committed", "invested", { committedAmount: 500000, investedAmount: null, currency: "INR" }).ok).toBe(false);
  });

  it("refuses a move to the current stage", () => {
    expect(checkStageMove("meeting", "meeting", noMoney).ok).toBe(false);
  });
});

describe("rounds", () => {
  it("needs a target and currency to open", () => {
    expect(checkRoundMove("planning", "open", { targetAmount: null, currency: null }).ok).toBe(false);
    expect(checkRoundMove("planning", "open", { targetAmount: 10_000_000, currency: "INR" }).ok).toBe(true);
  });

  it("cannot reopen a closed round", () => {
    expect(checkRoundMove("closed", "open", { targetAmount: 1, currency: "INR" }).ok).toBe(false);
  });
});

describe("outreach", () => {
  it("reserves approval for approvers and has no status write for sending", () => {
    expect(checkOutreachMove("awaiting_approval", "approved")).toMatchObject({ ok: true, requiresApproval: true });
    expect(checkOutreachMove("approved", "sent").ok).toBe(false);
    expect(checkOutreachMove("draft", "approved").ok).toBe(false);
  });

  it("sends only approved outreach", () => {
    expect(canSend("approved", "2026-09-25T00:00:00Z").ok).toBe(true);
    expect(canSend("draft", null).ok).toBe(false);
    expect(canSend("approved", null).ok).toBe(false);
  });
});

describe("diligence", () => {
  it("needs a response before submitting", () => {
    expect(checkDiligenceMove("in_progress", "submitted", { response: " " }).ok).toBe(false);
    expect(checkDiligenceMove("in_progress", "submitted", { response: "See data room" }).ok).toBe(true);
  });

  it("reserves accepting and closing for approvers", () => {
    expect(checkDiligenceMove("submitted", "accepted", { response: "x" })).toMatchObject({ ok: true, requiresApproval: true });
    expect(checkDiligenceMove("accepted", "closed", { response: "x" })).toMatchObject({ ok: true, requiresApproval: true });
    expect(checkDiligenceMove("open", "accepted", { response: "x" }).ok).toBe(false);
  });
});
