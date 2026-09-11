import { describe, expect, it } from "vitest";
import { computeWhatsAppWindowStatus } from "./window";

const NOW = new Date("2026-09-11T12:00:00.000Z");

describe("computeWhatsAppWindowStatus", () => {
  it("is within the window right after an inbound message", () => {
    expect(computeWhatsAppWindowStatus("2026-09-11T11:00:00.000Z", NOW)).toEqual({
      withinWindow: true,
      expiresAt: "2026-09-12T11:00:00.000Z",
    });
  });

  it("is within the window just under 24 hours later", () => {
    expect(computeWhatsAppWindowStatus("2026-09-10T12:00:01.000Z", NOW).withinWindow).toBe(true);
  });

  it("is outside the window exactly at the 24-hour boundary", () => {
    expect(computeWhatsAppWindowStatus("2026-09-10T12:00:00.000Z", NOW).withinWindow).toBe(false);
  });

  it("is outside the window well past 24 hours", () => {
    expect(computeWhatsAppWindowStatus("2026-09-09T12:00:00.000Z", NOW).withinWindow).toBe(false);
  });

  it("is outside the window when there's no inbound message at all", () => {
    expect(computeWhatsAppWindowStatus(null, NOW)).toEqual({ withinWindow: false, expiresAt: null });
  });
});
