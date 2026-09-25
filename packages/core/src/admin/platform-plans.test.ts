import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "../db/admin";
import { createPlatformPlanSchema, listPublicPlans, updatePlatformPlanSchema } from "./platform-plans";

vi.mock("../db/admin", () => ({ createAdminClient: vi.fn() }));

const validInput = {
  key: "growth",
  name: "Growth",
  description: "For teams scaling past the basics.",
  price: 2999,
  billingInterval: "month" as const,
  currency: "inr",
  status: "active" as const,
  displayOrder: 1,
  marketingVisible: true,
  reason: "Setting up the initial catalog",
};

describe("createPlatformPlanSchema (PLATFORM-P0-04.1)", () => {
  it("accepts a fully populated, valid input", () => {
    const result = createPlatformPlanSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("lowercases the key and uppercases the currency", () => {
    const result = createPlatformPlanSchema.safeParse({ ...validInput, key: "GROWTH", currency: "inr" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("growth");
      expect(result.data.currency).toBe("INR");
    }
  });

  it("rejects a key with spaces, hyphens, or other non-slug characters", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, key: "growth plan" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, key: "growth-plan" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, key: "" }).success).toBe(false);
  });

  it("requires a non-empty plan name", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, name: "  " }).success).toBe(false);
  });

  it("turns an empty description into null", () => {
    const result = createPlatformPlanSchema.safeParse({ ...validInput, description: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  it("rejects a negative price", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, price: -1 }).success).toBe(false);
  });

  it("accepts a zero price (the Free plan)", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, price: 0 }).success).toBe(true);
  });

  it("rejects a billing interval outside month/year", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, billingInterval: "week" }).success).toBe(false);
  });

  it("rejects a currency code that isn't 3 letters", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, currency: "RS" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, currency: "INDIAN" }).success).toBe(false);
  });

  it("rejects a status outside the four-value lifecycle (PLATFORM-P0-04.7)", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, status: "beta" }).success).toBe(false);
  });

  it("accepts every lifecycle status the story names", () => {
    for (const s of ["draft", "active", "deprecated", "archived"]) {
      expect(createPlatformPlanSchema.safeParse({ ...validInput, status: s }).success).toBe(true);
    }
  });

  it("rejects a non-integer display order", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, displayOrder: 1.5 }).success).toBe(false);
  });

  it("rejects an empty reason (PLATFORM-P0-17.1 -- every plan change must be audited)", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, reason: "" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, reason: "   " }).success).toBe(false);
  });
});

describe("updatePlatformPlanSchema (PLATFORM-P0-04.1)", () => {
  it("has no key field at all -- a plan's key is immutable after creation", () => {
    const { key: _key, ...rest } = validInput;
    const result = updatePlatformPlanSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect("key" in result.data).toBe(false);
  });
});

/**
 * /pricing is public, so it reads platform.plans past its superadmin-only RLS. These pin
 * down the two things that carve-out must never get wrong: it only ever shows what a
 * superadmin published for the marketing site, and it never takes the page down.
 */
describe("listPublicPlans (the /pricing page's read)", () => {
  const KEY = "SUPABASE_SERVICE_ROLE_KEY";
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
    vi.restoreAllMocks();
    vi.mocked(createAdminClient).mockReset();
  });

  function fakeClient(result: { data: unknown; error: unknown }) {
    const calls: { select?: string; eq: [string, unknown][] } = { eq: [] };
    const query = {
      select(columns: string) {
        calls.select = columns;
        return query;
      },
      eq(column: string, value: unknown) {
        calls.eq.push([column, value]);
        return query;
      },
      order: () => Promise.resolve(result),
    };
    vi.mocked(createAdminClient).mockReturnValue({ from: () => query } as never);
    return calls;
  }

  it("returns no plans, rather than throwing, when the service-role key is missing", async () => {
    delete process.env[KEY];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(listPublicPlans()).resolves.toEqual([]);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("asks only for active plans a superadmin marked visible on the marketing site", async () => {
    process.env[KEY] = "test-key";
    const calls = fakeClient({ data: [], error: null });
    await listPublicPlans();
    expect(calls.eq).toEqual([
      ["status", "active"],
      ["marketing_visible", true],
    ]);
    expect(calls.select).not.toContain("updated_by");
    expect(calls.select).not.toContain("*");
  });

  it("normalizes a numeric price that arrives as a string", async () => {
    process.env[KEY] = "test-key";
    fakeClient({
      data: [{ key: "pro", name: "Pro", description: null, price: "2999.00", billing_interval: "month", currency: "INR" }],
      error: null,
    });
    await expect(listPublicPlans()).resolves.toEqual([
      { key: "pro", name: "Pro", description: null, price: 2999, billingInterval: "month", currency: "INR" },
    ]);
  });

  it("returns no plans when the query fails", async () => {
    process.env[KEY] = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeClient({ data: null, error: { message: "boom" } });
    await expect(listPublicPlans()).resolves.toEqual([]);
  });
});
