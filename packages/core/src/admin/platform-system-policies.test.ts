import { describe, expect, it } from "vitest";
import { updateSystemPoliciesSchema } from "./platform-system-policies";

const validInput = {
  sessionDurationMinutes: "60",
  passwordMinLength: "10",
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  maxFileSizeMb: "25",
  defaultTimezone: "Asia/Kolkata",
  defaultCurrency: "inr",
  dataRetentionDefaultDays: "365",
  auditRetentionDays: "730",
  rateLimitApiPerMinute: "120",
  rateLimitAiPerMinute: "30",
  rateLimitWebhooksPerMinute: "60",
  rateLimitImportsPerHour: "10",
  rateLimitExportsPerHour: "10",
  rateLimitAutomationPerMinute: "20",
  reason: "Tightening password requirements ahead of the security review.",
};

describe("updateSystemPoliciesSchema (PLATFORM-P0-14.1/14.2/14.3, config-only)", () => {
  it("accepts a fully-populated policy and coerces numeric strings", () => {
    const result = updateSystemPoliciesSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionDurationMinutes).toBe(60);
      expect(result.data.passwordMinLength).toBe(10);
      expect(result.data.rateLimitApiPerMinute).toBe(120);
      expect(result.data.rateLimitAiPerMinute).toBe(30);
    }
  });

  it("uppercases the default currency code", () => {
    const result = updateSystemPoliciesSchema.safeParse({ ...validInput, defaultCurrency: "usd" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultCurrency).toBe("USD");
  });

  it("rejects a currency code that isn't exactly 3 letters", () => {
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, defaultCurrency: "US" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, defaultCurrency: "USDX" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, defaultCurrency: "12A" }).success).toBe(false);
  });

  it("requires a non-empty default timezone", () => {
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, defaultTimezone: "" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, defaultTimezone: "   " }).success).toBe(false);
  });

  it("normalizes an empty optional numeric field to null -- not yet configured is valid", () => {
    const result = updateSystemPoliciesSchema.safeParse({
      ...validInput,
      sessionDurationMinutes: "",
      maxFileSizeMb: "",
      dataRetentionDefaultDays: "",
      auditRetentionDays: "",
      rateLimitAiPerMinute: "",
      rateLimitWebhooksPerMinute: "",
      rateLimitImportsPerHour: "",
      rateLimitExportsPerHour: "",
      rateLimitAutomationPerMinute: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionDurationMinutes).toBeNull();
      expect(result.data.maxFileSizeMb).toBeNull();
      expect(result.data.dataRetentionDefaultDays).toBeNull();
      expect(result.data.auditRetentionDays).toBeNull();
      expect(result.data.rateLimitAiPerMinute).toBeNull();
      expect(result.data.rateLimitWebhooksPerMinute).toBeNull();
      expect(result.data.rateLimitImportsPerHour).toBeNull();
      expect(result.data.rateLimitExportsPerHour).toBeNull();
      expect(result.data.rateLimitAutomationPerMinute).toBeNull();
    }
  });

  it("rejects an empty required password minimum length or API rate limit", () => {
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, passwordMinLength: "" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, rateLimitApiPerMinute: "" }).success).toBe(false);
  });

  it("rejects a non-positive value for any rate-limit or retention field", () => {
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, passwordMinLength: "0" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, rateLimitApiPerMinute: "-1" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, sessionDurationMinutes: "0" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, dataRetentionDefaultDays: "-30" }).success).toBe(false);
  });

  it("rejects a non-integer value for a whole-number field", () => {
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, passwordMinLength: "8.5" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, rateLimitApiPerMinute: "not-a-number" }).success).toBe(false);
  });

  it("requires a non-empty reason", () => {
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, reason: "" }).success).toBe(false);
    expect(updateSystemPoliciesSchema.safeParse({ ...validInput, reason: "   " }).success).toBe(false);
  });
});
