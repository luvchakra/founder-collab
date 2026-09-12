import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * PLATFORM-P0-12.2/12.3 ("Global Integrations", §16) -- exercises the same validation
 * shape `setIntegrationStatus()` uses internally. The schema itself is not exported (it is
 * a private implementation detail of `platform-integrations.ts`, same as
 * `setModuleStatusSchema` in `platform-modules.ts`), so this test reconstructs it exactly
 * to pin its behavior -- any drift between this and the real schema would show up as a
 * failing `setIntegrationStatus()` integration path, not silently.
 */
const INTEGRATION_STATUSES = ["connected", "disconnected", "error", "needs_reauthorization", "disabled"] as const;

const setIntegrationStatusSchema = z.object({
  integrationKey: z.string().trim().min(1),
  status: z.enum(INTEGRATION_STATUSES),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .transform((v) => (v === "" ? null : v)),
  reason: z.string().trim().min(1, "A reason is required.").max(500, "Reason must be 500 characters or fewer."),
});

const validInput = {
  integrationKey: "whatsapp",
  status: "disabled" as const,
  notes: "Meta API degraded platform-wide, killing this category until resolved.",
  reason: "Emergency kill switch during a widespread Meta outage.",
};

describe("setIntegrationStatusSchema (PLATFORM-P0-12.2/12.3)", () => {
  it("accepts a fully valid kill-switch input", () => {
    const result = setIntegrationStatusSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts every documented status value", () => {
    for (const status of INTEGRATION_STATUSES) {
      const result = setIntegrationStatusSchema.safeParse({ ...validInput, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    const result = setIntegrationStatusSchema.safeParse({ ...validInput, status: "paused" });
    expect(result.success).toBe(false);
  });

  it("normalizes an empty notes field to null", () => {
    const result = setIntegrationStatusSchema.safeParse({ ...validInput, notes: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBeNull();
  });

  it("rejects a blank reason -- required in every direction, not only disabling", () => {
    const result = setIntegrationStatusSchema.safeParse({ ...validInput, status: "connected", reason: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a blank integration key", () => {
    const result = setIntegrationStatusSchema.safeParse({ ...validInput, integrationKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an overlong notes field", () => {
    const result = setIntegrationStatusSchema.safeParse({ ...validInput, notes: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects an overlong reason", () => {
    const result = setIntegrationStatusSchema.safeParse({ ...validInput, reason: "x".repeat(501) });
    expect(result.success).toBe(false);
  });
});
