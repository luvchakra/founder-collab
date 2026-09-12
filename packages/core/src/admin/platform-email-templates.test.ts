import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATE_KEYS, updateEmailTemplateSchema } from "./platform-email-templates";

const validInput = {
  templateKey: "welcome" as const,
  subject: "Welcome to WonderArc",
  body: "Hi {{name}}, welcome aboard.",
  reason: "Writing the first real copy for this template.",
};

describe("EMAIL_TEMPLATE_KEYS (PLATFORM-P0-11.2)", () => {
  it("has exactly the seven purposes §15 names, in the doc's own order", () => {
    expect(EMAIL_TEMPLATE_KEYS).toEqual([
      "welcome",
      "verification",
      "password_security",
      "subscription",
      "usage_limits",
      "compliance_reminders",
      "system_announcements",
    ]);
  });
});

describe("updateEmailTemplateSchema (PLATFORM-P0-11.2)", () => {
  it("accepts a fully valid input", () => {
    const result = updateEmailTemplateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("normalizes empty subject/body to null (clearing a template back to unconfigured)", () => {
    const result = updateEmailTemplateSchema.safeParse({ ...validInput, subject: "", body: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBeNull();
      expect(result.data.body).toBeNull();
    }
  });

  it("rejects an unknown template key", () => {
    const result = updateEmailTemplateSchema.safeParse({ ...validInput, templateKey: "not_a_real_template" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank reason", () => {
    const result = updateEmailTemplateSchema.safeParse({ ...validInput, reason: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts every one of the seven template keys", () => {
    for (const templateKey of EMAIL_TEMPLATE_KEYS) {
      const result = updateEmailTemplateSchema.safeParse({ ...validInput, templateKey });
      expect(result.success).toBe(true);
    }
  });
});
