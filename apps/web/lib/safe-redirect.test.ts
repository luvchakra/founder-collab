import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each(["/dashboard", "/onboarding", "/reset-password", "/acme/service/jobs?tab=open#top"])("keeps the on-site path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    ["userinfo trick", "@evil.example"],
    ["absolute URL", "https://evil.example/steal"],
    ["protocol-relative host", "//evil.example"],
    ["backslash host", "/\\evil.example"],
    ["javascript: URL", "javascript:alert(1)"],
    ["embedded tab", "/\t/evil.example"],
    ["relative path", "dashboard"],
  ])("refuses a %s", (_label, next) => {
    expect(safeRedirectPath(next)).toBe("/dashboard");
  });

  it("uses the given fallback for a missing value", () => {
    expect(safeRedirectPath(null, "/login")).toBe("/login");
    expect(safeRedirectPath("", "/login")).toBe("/login");
  });
});
