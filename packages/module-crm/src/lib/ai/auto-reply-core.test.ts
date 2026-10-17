import { describe, expect, it } from "vitest";
import { isWhatsAppOptOutMessage, preClaimSkipReason, whatsAppContactHash, AUTO_SEND_TOPICS, type AutoReplyContext } from "./auto-reply-core";

// PLATFORM-P1-12.5/12.6: the pure checks behind automatic WhatsApp AI replies.

const NOW = new Date("2026-10-17T10:00:00Z");
const ok: AutoReplyContext = {
  licensed: true,
  aiAllowed: true,
  connected: true,
  optedOut: false,
  message: "What are your hours?",
  occurredAt: "2026-10-17T09:00:00Z",
  isLatestInbound: true,
  alreadyAnswered: false,
};

describe("isWhatsAppOptOutMessage", () => {
  it("matches STOP-style words on their own, in any case", () => {
    for (const text of ["STOP", "stop", "Stop.", " unsubscribe ", "Opt out", "OPT-OUT", "stop all!"]) expect(isWhatsAppOptOutMessage(text)).toBe(true);
  });
  it("doesn't treat a sentence that mentions them as an opt-out", () => {
    for (const text of ["Can you stop by tomorrow?", "stop the order", "", null, "STOPPED"]) expect(isWhatsAppOptOutMessage(text)).toBe(false);
  });
});

describe("whatsAppContactHash", () => {
  it("ignores formatting and never equals the plain number", () => {
    expect(whatsAppContactHash("+91 98000-00001")).toBe(whatsAppContactHash("919800000001"));
    expect(whatsAppContactHash("919800000001")).toMatch(/^[0-9a-f]{64}$/);
    expect(whatsAppContactHash("919800000001")).not.toContain("9198");
  });
});

describe("preClaimSkipReason", () => {
  it("allows a fresh, licensed, connected, unanswered message", () => {
    expect(preClaimSkipReason(ok, NOW)).toBeNull();
  });
  it("checks the licence and the AI policy first, and a failed policy read is a no", () => {
    expect(preClaimSkipReason({ ...ok, licensed: false, aiAllowed: false }, NOW)).toBe("not_licensed");
    expect(preClaimSkipReason({ ...ok, aiAllowed: "unknown" }, NOW)).toBe("policy_check_failed");
    expect(preClaimSkipReason({ ...ok, aiAllowed: false }, NOW)).toBe("ai_off");
  });
  it("closes exactly 24 hours after the customer's message", () => {
    expect(preClaimSkipReason({ ...ok, occurredAt: "2026-10-16T10:00:01Z" }, NOW)).toBeNull();
    expect(preClaimSkipReason({ ...ok, occurredAt: "2026-10-16T10:00:00Z" }, NOW)).toBe("outside_window");
  });
  it("skips opted-out, superseded, answered and empty messages", () => {
    expect(preClaimSkipReason({ ...ok, optedOut: true }, NOW)).toBe("opted_out");
    expect(preClaimSkipReason({ ...ok, isLatestInbound: false }, NOW)).toBe("superseded");
    expect(preClaimSkipReason({ ...ok, alreadyAnswered: true }, NOW)).toBe("already_answered");
    expect(preClaimSkipReason({ ...ok, message: "  " }, NOW)).toBe("no_text");
    expect(preClaimSkipReason({ ...ok, connected: false }, NOW)).toBe("not_connected");
  });
});

describe("AUTO_SEND_TOPICS", () => {
  it("never includes order/job status, needs_person or other", () => {
    expect(AUTO_SEND_TOPICS).not.toContain("order_job_status");
    expect(AUTO_SEND_TOPICS).not.toContain("needs_person");
    expect(AUTO_SEND_TOPICS).not.toContain("other");
  });
});
