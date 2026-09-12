import { describe, expect, it } from "vitest";
import { updateNotificationPoliciesSchema } from "./platform-notification-policies";

describe("updateNotificationPoliciesSchema (PLATFORM-P0-11.3)", () => {
  it("accepts a valid all-true input", () => {
    const result = updateNotificationPoliciesSchema.safeParse({
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid all-false input", () => {
    const result = updateNotificationPoliciesSchema.safeParse({
      emailEnabled: false,
      inAppEnabled: false,
      pushEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a mixed combination", () => {
    const result = updateNotificationPoliciesSchema.safeParse({
      emailEnabled: true,
      inAppEnabled: false,
      pushEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-boolean value", () => {
    const result = updateNotificationPoliciesSchema.safeParse({
      emailEnabled: "true",
      inAppEnabled: false,
      pushEnabled: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing field", () => {
    const result = updateNotificationPoliciesSchema.safeParse({
      emailEnabled: true,
      inAppEnabled: false,
    });
    expect(result.success).toBe(false);
  });
});
