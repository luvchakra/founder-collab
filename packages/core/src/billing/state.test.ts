import { describe, expect, it } from "vitest";
import { isEntitledStatus, isLiveStatus, mapRazorpayStatus, mapStripeStatus } from "./state";

describe("BILL-15 provider status mapping", () => {
  it("maps Stripe states, folding cancel-at-period-end into cancel_scheduled", () => {
    expect(mapStripeStatus("active", false)).toBe("active");
    expect(mapStripeStatus("active", true)).toBe("cancel_scheduled");
    expect(mapStripeStatus("canceled", true)).toBe("cancelled");
    expect(mapStripeStatus("incomplete_expired", false)).toBe("expired");
    expect(mapStripeStatus("past_due", false)).toBe("past_due");
  });

  it("maps Razorpay states", () => {
    expect(mapRazorpayStatus("authenticated", false)).toBe("incomplete");
    expect(mapRazorpayStatus("pending", false)).toBe("past_due");
    expect(mapRazorpayStatus("halted", false)).toBe("unpaid");
    expect(mapRazorpayStatus("completed", false)).toBe("expired");
    expect(mapRazorpayStatus("active", true)).toBe("cancel_scheduled");
  });

  it("maps an unknown state to incomplete, which never grants anything", () => {
    expect(mapStripeStatus("something_new", false)).toBe("incomplete");
    expect(mapRazorpayStatus("something_new", false)).toBe("incomplete");
    expect(isEntitledStatus("incomplete")).toBe(false);
  });

  it("keeps modules while active, trialing, past_due or cancel_scheduled only", () => {
    expect(["active", "trialing", "past_due", "cancel_scheduled"].every((s) => isEntitledStatus(s as never))).toBe(true);
    expect(["unpaid", "paused", "cancelled", "expired", "incomplete"].some((s) => isEntitledStatus(s as never))).toBe(false);
  });

  it("treats unpaid and paused as still occupying the business's live slot", () => {
    expect(isLiveStatus("unpaid")).toBe(true);
    expect(isLiveStatus("paused")).toBe(true);
    expect(isLiveStatus("cancelled")).toBe(false);
    expect(isLiveStatus("incomplete")).toBe(false);
  });
});
