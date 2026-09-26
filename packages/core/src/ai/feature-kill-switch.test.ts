import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { isAiOperationDisabled } = await import("./feature-kill-switch");

/** PLATFORM-P0-10.4 -- the runtime read behind the AI feature kill switch. */
describe("isAiOperationDisabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("is true only for an operation explicitly switched off", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: { enabled: false }, error: null }) }));
    expect(await isAiOperationDisabled("chat")).toBe(true);
  });

  it("treats an operation with no switch row as enabled", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: null, error: null }) }));
    expect(await isAiOperationDisabled("chat")).toBe(false);
  });

  it("fails open on a read error rather than blocking every AI call", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: null, error: { message: "boom" } }) }));
    expect(await isAiOperationDisabled("chat")).toBe(false);
  });
});
