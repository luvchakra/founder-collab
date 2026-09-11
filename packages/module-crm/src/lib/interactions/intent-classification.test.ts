import { describe, expect, it } from "vitest";
import { classifyMessageIntent } from "./intent-classification";

describe("classifyMessageIntent", () => {
  it("returns general_enquiry at zero confidence for empty content", () => {
    expect(classifyMessageIntent("")).toEqual({ intent: "general_enquiry", confidence: 0 });
    expect(classifyMessageIntent(null)).toEqual({ intent: "general_enquiry", confidence: 0 });
    expect(classifyMessageIntent(undefined)).toEqual({ intent: "general_enquiry", confidence: 0 });
  });

  it("classifies a pricing question", () => {
    expect(classifyMessageIntent("How much does this cost?").intent).toBe("pricing");
  });

  it("classifies an availability question", () => {
    expect(classifyMessageIntent("Is this in stock right now?").intent).toBe("availability");
  });

  it("classifies clear purchase intent", () => {
    expect(classifyMessageIntent("I want to buy this today").intent).toBe("purchase_intent");
  });

  it("classifies an appointment request", () => {
    expect(classifyMessageIntent("Can I book an appointment for tomorrow?").intent).toBe("appointment");
  });

  it("classifies a complaint", () => {
    expect(classifyMessageIntent("This is terrible, I want a refund").intent).toBe("complaint");
  });

  it("classifies obvious spam", () => {
    expect(classifyMessageIntent("Unsubscribe from this list").intent).toBe("spam");
  });

  it("falls back to general_enquiry at low but non-zero confidence for unmatched content", () => {
    const result = classifyMessageIntent("Hello there, just saying hi");
    expect(result.intent).toBe("general_enquiry");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.5);
  });
});
