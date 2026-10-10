import { describe, expect, it } from "vitest";
import { legalContentHash } from "./legal-hash";

// PLATFORM-P1-09.1: the version fingerprint is stable and per document.
describe("legalContentHash", () => {
  it("is a stable SHA-256 per document", () => {
    expect(legalContentHash("terms")).toMatch(/^[0-9a-f]{64}$/);
    expect(legalContentHash("terms")).toBe(legalContentHash("terms"));
    expect(legalContentHash("privacy")).not.toBe(legalContentHash("terms"));
  });
});
