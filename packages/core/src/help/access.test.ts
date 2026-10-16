import { describe, expect, it } from "vitest";
import { helpReturnPath, isHelpPath, signInUrlFor } from "./access";

describe("help access", () => {
  it("recognises the help hub and every guide", () => {
    expect(isHelpPath("/help")).toBe(true);
    expect(isHelpPath("/help/finance")).toBe(true);
    expect(isHelpPath("/helpdesk")).toBe(false);
    expect(isHelpPath("/acme/help")).toBe(false);
  });

  it("returns only to a help page after sign-in", () => {
    expect(helpReturnPath("/help")).toBe("/help");
    expect(helpReturnPath("/help/finance")).toBe("/help/finance");
    expect(helpReturnPath("/help/finance/")).toBe("/help/finance");
    for (const next of [null, "", "/dashboard", "//evil.example", "https://evil.example/help", "/help/../platform", "/help/a/b", "/help?x=1", "/help/Finance", "/help/%2e%2e"]) {
      expect(helpReturnPath(next), String(next)).toBeNull();
    }
  });

  it("builds the sign-in URL for a help page, and the plain one otherwise", () => {
    expect(signInUrlFor("/help/getting-started")).toBe("/login?next=%2Fhelp%2Fgetting-started");
    expect(signInUrlFor("/dashboard")).toBe("/login");
  });
});
