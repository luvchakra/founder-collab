import { describe, expect, it } from "vitest";
import { classifyMessageIntent, isHighCommercialIntent } from "./intent-classification";

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

describe("isHighCommercialIntent", () => {
  it("treats pricing, availability, purchase_intent, and appointment as high commercial intent", () => {
    expect(isHighCommercialIntent("pricing")).toBe(true);
    expect(isHighCommercialIntent("availability")).toBe(true);
    expect(isHighCommercialIntent("purchase_intent")).toBe(true);
    expect(isHighCommercialIntent("appointment")).toBe(true);
  });

  it("does not treat a generic product question or general enquiry as high commercial intent", () => {
    expect(isHighCommercialIntent("product_question")).toBe(false);
    expect(isHighCommercialIntent("general_enquiry")).toBe(false);
  });

  it("does not treat support/complaint/feedback/review/spam as high commercial intent", () => {
    expect(isHighCommercialIntent("support")).toBe(false);
    expect(isHighCommercialIntent("complaint")).toBe(false);
    expect(isHighCommercialIntent("feedback")).toBe(false);
    expect(isHighCommercialIntent("review")).toBe(false);
    expect(isHighCommercialIntent("spam")).toBe(false);
  });

  it("is false for null/undefined", () => {
    expect(isHighCommercialIntent(null)).toBe(false);
    expect(isHighCommercialIntent(undefined)).toBe(false);
  });
});
