import { describe, expect, it } from "vitest";
import { buildPrefilledMessageWithRef, buildWaMeLink, extractClickToChatRef, stripClickToChatRef } from "./link";

describe("buildPrefilledMessageWithRef", () => {
  it("appends the ref tag to the message", () => {
    expect(buildPrefilledMessageWithRef("Hi! I'm interested.", "AB12CD")).toBe("Hi! I'm interested. [ref:AB12CD]");
  });
});

describe("extractClickToChatRef", () => {
  it("extracts the ref code from a tagged message", () => {
    expect(extractClickToChatRef("Hi! I'm interested. [ref:AB12CD]")).toBe("AB12CD");
  });

  it("returns null for a message with no ref tag", () => {
    expect(extractClickToChatRef("Just a normal message")).toBeNull();
  });

  it("returns null for null text", () => {
    expect(extractClickToChatRef(null)).toBeNull();
  });
});

describe("stripClickToChatRef", () => {
  it("removes the ref tag and trims the result", () => {
    expect(stripClickToChatRef("Hi! I'm interested. [ref:AB12CD]")).toBe("Hi! I'm interested.");
  });

  it("leaves untagged text unchanged", () => {
    expect(stripClickToChatRef("Just a normal message")).toBe("Just a normal message");
  });
});

describe("buildWaMeLink", () => {
  it("builds a wa.me URL with digits-only number and encoded message", () => {
    expect(buildWaMeLink("+1 (555) 123-4567", "Hi there!")).toBe("https://wa.me/15551234567?text=Hi%20there!");
  });
});
