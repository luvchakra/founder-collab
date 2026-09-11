import { describe, expect, it } from "vitest";
import { evaluateRequiresResponse, isObviousNoise } from "./response-rules";

describe("isObviousNoise", () => {
  it("treats empty or whitespace-only content as noise", () => {
    expect(isObviousNoise("")).toBe(true);
    expect(isObviousNoise("   ")).toBe(true);
    expect(isObviousNoise(null)).toBe(true);
    expect(isObviousNoise(undefined)).toBe(true);
  });

  it("flags common automated-reply patterns", () => {
    expect(isObviousNoise("unsubscribe")).toBe(true);
    expect(isObviousNoise("I am currently out of office until Monday")).toBe(true);
    expect(isObviousNoise("This is an automatic reply to your message")).toBe(true);
    expect(isObviousNoise("Sent from no-reply@example.com")).toBe(true);
  });

  it("does not flag ordinary customer content", () => {
    expect(isObviousNoise("Hi, is this product still available?")).toBe(false);
  });
});

describe("evaluateRequiresResponse", () => {
  it("requires a response for a supported-channel inbound message with real content", () => {
    expect(evaluateRequiresResponse({ direction: "inbound", channel: "whatsapp", contentExcerpt: "Do you have this in stock?" })).toBe(true);
  });

  it("never requires a response for an outbound interaction", () => {
    expect(evaluateRequiresResponse({ direction: "outbound", channel: "whatsapp", contentExcerpt: "Sure, here's the price" })).toBe(false);
  });

  it("never requires a response on a channel with no send path yet", () => {
    expect(evaluateRequiresResponse({ direction: "inbound", channel: "email", contentExcerpt: "Do you have this in stock?" })).toBe(false);
  });

  it("never requires a response to obvious noise", () => {
    expect(evaluateRequiresResponse({ direction: "inbound", channel: "whatsapp", contentExcerpt: "unsubscribe" })).toBe(false);
  });
});
