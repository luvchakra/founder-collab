/**
 * These two actions are the only place the UI can reach the service-role licensing
 * lifecycle, which bypasses RLS entirely. `businessId` arrives from a submitted form, so
 * the authorization check in front of it is the whole security boundary (CLAUDE.md
 * principle 8: never trust a client-supplied tenant id). Each test asserts not just that
 * an unauthorized call throws, but that the privileged call was never reached.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
const { activateLicense, deactivateLicense } = vi.hoisted(() => ({
  activateLicense: vi.fn(),
  deactivateLicense: vi.fn(),
}));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@cofounderai/core/db/server", () => ({ createClient }));
vi.mock("@cofounderai/core/licensing/lifecycle", () => ({ activateLicense, deactivateLicense }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { activateModuleAction, deactivateModuleAction } = await import("./actions");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

/** `visible` is what the RLS-scoped business lookup returns — null means "not yours". */
function mockAccess(visible: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: visible, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe.each([
  ["activateModuleAction", () => activateModuleAction, () => activateLicense],
  ["deactivateModuleAction", () => deactivateModuleAction, () => deactivateLicense],
] as const)("%s", (_name, getAction, getLifecycle) => {
  it("runs the lifecycle call once the caller's access to the business is confirmed", async () => {
    mockAccess({ id: BUSINESS });

    await getAction()(BUSINESS, "inventory");

    expect(getLifecycle()).toHaveBeenCalledWith(BUSINESS, "inventory");
  });

  it("checks access through the RLS-scoped client, scoped to the submitted business id", async () => {
    const supabase = mockAccess({ id: BUSINESS });

    await getAction()(BUSINESS, "inventory");

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
    expect(eqFilters(supabase.queries("businesses")[0]!)).toEqual({ id: BUSINESS });
  });

  it("refuses a business the caller cannot see, without touching the service-role path", async () => {
    mockAccess(null);

    await expect(getAction()(BUSINESS, "inventory")).rejects.toThrow(/not found or access denied/i);
    expect(getLifecycle()).not.toHaveBeenCalled();
  });

  it("propagates a failed access check rather than proceeding", async () => {
    mockAccess(null, new Error("select denied"));

    await expect(getAction()(BUSINESS, "inventory")).rejects.toThrow("select denied");
    expect(getLifecycle()).not.toHaveBeenCalled();
  });

  it("revalidates the licenses page only after a successful change", async () => {
    mockAccess({ id: BUSINESS });
    await getAction()(BUSINESS, "inventory");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings/licenses");

    revalidatePath.mockClear();
    mockAccess(null);
    await expect(getAction()(BUSINESS, "inventory")).rejects.toThrow();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
