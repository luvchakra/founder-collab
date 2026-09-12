import { describe, expect, it } from "vitest";
import { RESOURCE_KEYS, setPlanLimitSchema } from "./platform-plan-limits";

describe("RESOURCE_KEYS (PLATFORM-P0-04.5)", () => {
  it("declares exactly the 13 dimensions the doc names", () => {
    expect(RESOURCE_KEYS).toHaveLength(13);
    expect(RESOURCE_KEYS).toContain("businesses");
    expect(RESOURCE_KEYS).toContain("whatsapp_conversations");
    expect(new Set(RESOURCE_KEYS).size).toBe(13);
  });
});

describe("setPlanLimitSchema (PLATFORM-P0-04.6 tri-state)", () => {
  it("accepts state=limited with a valid non-negative integer", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitValue).toBe(5);
  });

  it("accepts limitValue = 0 as a real, meaningful limit, not 'no value'", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "0" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitValue).toBe(0);
  });

  it("rejects state=limited with no limitValue", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "" });
    expect(result.success).toBe(false);
  });

  it("rejects state=limited with a negative limitValue", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects state=limited with a non-integer limitValue", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "2.5" });
    expect(result.success).toBe(false);
  });

  it("accepts state=unlimited with no limitValue", () => {
    const result = setPlanLimitSchema.safeParse({ state: "unlimited", limitValue: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitValue).toBeNull();
  });

  it("accepts state=disabled with no limitValue", () => {
    const result = setPlanLimitSchema.safeParse({ state: "disabled" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitValue).toBeNull();
  });

  it("rejects state=unlimited with a numeric limitValue -- never a fake number standing in for unlimited", () => {
    const result = setPlanLimitSchema.safeParse({ state: "unlimited", limitValue: "999999999" });
    expect(result.success).toBe(false);
  });

  it("rejects state=disabled with a numeric limitValue", () => {
    const result = setPlanLimitSchema.safeParse({ state: "disabled", limitValue: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown state value", () => {
    const result = setPlanLimitSchema.safeParse({ state: "bogus", limitValue: "" });
    expect(result.success).toBe(false);
  });
});

describe("setPlanLimitSchema limitType (PLATFORM-P0-06.5 decision #2)", () => {
  it("defaults limitType to 'hard' when state=limited and no limitType is given -- today's already-shipped denial semantics are the unchanged default", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitType).toBe("hard");
  });

  it("accepts an explicit limitType='soft' for state=limited", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "5", limitType: "soft" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitType).toBe("soft");
  });

  it("accepts an explicit limitType='hard' for state=limited", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "5", limitType: "hard" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitType).toBe("hard");
  });

  it("normalizes limitType to null when state=unlimited, regardless of what was passed in", () => {
    const result = setPlanLimitSchema.safeParse({ state: "unlimited", limitValue: "", limitType: "soft" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitType).toBeNull();
  });

  it("normalizes limitType to null when state=disabled, regardless of what was passed in", () => {
    const result = setPlanLimitSchema.safeParse({ state: "disabled", limitType: "hard" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limitType).toBeNull();
  });

  it("rejects an unrecognized limitType value", () => {
    const result = setPlanLimitSchema.safeParse({ state: "limited", limitValue: "5", limitType: "bogus" });
    expect(result.success).toBe(false);
  });
});
