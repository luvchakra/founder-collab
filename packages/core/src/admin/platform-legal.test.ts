import { describe, expect, it } from "vitest";
import { publishLegalVersionSchema } from "./platform-legal";

// PLATFORM-P1-09.1: what a publish needs.
describe("publishLegalVersionSchema", () => {
  const base = { document: "terms", version: "2026-10", summary: "First published version", requiresAcceptance: true } as const;
  it("accepts a labelled version with a summary", () => {
    expect(publishLegalVersionSchema.safeParse(base).success).toBe(true);
  });
  it("requires a label, a summary and a known document", () => {
    expect(publishLegalVersionSchema.safeParse({ ...base, version: " " }).success).toBe(false);
    expect(publishLegalVersionSchema.safeParse({ ...base, summary: "" }).success).toBe(false);
    expect(publishLegalVersionSchema.safeParse({ ...base, document: "cookies" }).success).toBe(false);
  });
});
