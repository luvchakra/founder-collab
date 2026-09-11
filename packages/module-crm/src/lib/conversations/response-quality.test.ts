import { describe, expect, it } from "vitest";
import { checkOverlyLong, responseQualityPrompt } from "./response-quality";

describe("checkOverlyLong", () => {
  it("returns null for a normal-length reply", () => {
    expect(checkOverlyLong("Thanks for reaching out, we'll get back to you shortly!")).toBeNull();
  });

  it("flags a reply past the threshold, naming its actual length", () => {
    const long = "a".repeat(500);
    const flag = checkOverlyLong(long);
    expect(flag).not.toBeNull();
    expect(flag?.type).toBe("overly_long");
    expect(flag?.detail).toContain("500");
  });
});

describe("responseQualityPrompt", () => {
  it("includes the customer name, last message, products, and draft when all are known", () => {
    const prompt = responseQualityPrompt({
      businessName: "Acme Traders",
      customerName: "Priya Sharma",
      lastInboundMessage: "How much for the blue widget?",
      knownProductNames: ["Blue Widget", "Red Widget"],
      draft: "Thanks Priya! Someone will follow up shortly.",
    });
    expect(prompt).toContain("Acme Traders");
    expect(prompt).toContain("Priya Sharma");
    expect(prompt).toContain("How much for the blue widget?");
    expect(prompt).toContain("Blue Widget, Red Widget");
    expect(prompt).toContain("Thanks Priya!");
  });

  it("falls back to honest placeholders when the customer, message, or products are unknown", () => {
    const prompt = responseQualityPrompt({
      businessName: "Acme Traders",
      customerName: null,
      lastInboundMessage: null,
      knownProductNames: [],
      draft: "Hi there!",
    });
    expect(prompt).toContain("unknown -- no matched contact");
    expect(prompt).toContain("(no prior inbound message in this conversation)");
    expect(prompt).toContain("(none on file)");
  });
});
