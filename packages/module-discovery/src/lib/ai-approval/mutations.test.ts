/**
 * DISC-AI-APPROVAL-01: only a member with `business.settings.manage` may change the AI
 * approval mode (requirePermission, backed by RLS on core.business_settings), Discovery
 * must be licensed, and a write that matched no row is a failure, not a save. Reading
 * falls back to "review" when the business has no value.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
}));

vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));

const { setAiApprovalMode } = await import("./mutations");
const { getAiApprovalMode, getAiApprovalModeForWorkspace } = await import("./queries");

beforeEach(() => {
  vi.clearAllMocks();
  h.requireModule.mockResolvedValue(undefined);
  h.requirePermission.mockResolvedValue(undefined);
});

describe("setAiApprovalMode", () => {
  it("checks the licence and business.settings.manage, then updates this business's row", async () => {
    const supabase = createFakeSupabase({ query: () => ({ data: [{ business_id: "b1" }], error: null }) });
    h.createClient.mockResolvedValue(supabase);
    await setAiApprovalMode("b1", "auto");
    expect(h.requireModule).toHaveBeenCalledWith("b1", "discovery");
    expect(h.requirePermission).toHaveBeenCalledWith("b1", "business.settings.manage");
    const [update] = supabase.queries("business_settings");
    expect(update!.ops).toContainEqual({ method: "update", args: [{ discovery_ai_approval_mode: "auto" }] });
    expect(update!.ops).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
  });

  it("refuses a member without the permission and writes nothing", async () => {
    const supabase = createFakeSupabase();
    h.createClient.mockResolvedValue(supabase);
    h.requirePermission.mockRejectedValue(new Error("You don't have permission to do this (business.settings.manage)."));
    await expect(setAiApprovalMode("b1", "auto")).rejects.toThrow("business.settings.manage");
    expect(supabase.queries("business_settings")).toHaveLength(0);
  });

  it("refuses when Discovery isn't licensed", async () => {
    h.requireModule.mockRejectedValue(new Error("Customer Discovery isn't licensed"));
    await expect(setAiApprovalMode("b1", "review")).rejects.toThrow("isn't licensed");
    expect(h.requirePermission).not.toHaveBeenCalled();
  });

  it("rejects a value that isn't one of the two modes", async () => {
    await expect(setAiApprovalMode("b1", "always" as never)).rejects.toThrow();
    expect(h.requirePermission).not.toHaveBeenCalled();
  });

  it("reports an update that matched no row as a failure", async () => {
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: [], error: null }) }));
    await expect(setAiApprovalMode("b1", "auto")).rejects.toThrow("could not be saved");
  });
});

describe("getAiApprovalMode", () => {
  it("reads the saved mode", async () => {
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: { discovery_ai_approval_mode: "auto" }, error: null }) }));
    await expect(getAiApprovalMode("b1")).resolves.toBe("auto");
  });

  it("falls back to review with no settings row or an unknown value", async () => {
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: null, error: null }) }));
    await expect(getAiApprovalMode("b1")).resolves.toBe("review");
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: { discovery_ai_approval_mode: "yolo" }, error: null }) }));
    await expect(getAiApprovalMode("b1")).resolves.toBe("review");
  });

  it("throws on a failed read instead of guessing", async () => {
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: null, error: new Error("42501") }) }));
    await expect(getAiApprovalMode("b1")).rejects.toThrow("42501");
  });

  it("resolves the business from the workspace, not from the caller", async () => {
    h.getBusinessIdForWorkspace.mockResolvedValue("b9");
    const supabase = createFakeSupabase({ query: () => ({ data: { discovery_ai_approval_mode: "auto" }, error: null }) });
    h.createClient.mockResolvedValue(supabase);
    await expect(getAiApprovalModeForWorkspace("w1")).resolves.toBe("auto");
    expect(supabase.queries("business_settings")[0]!.ops).toContainEqual({ method: "eq", args: ["business_id", "b9"] });
    h.getBusinessIdForWorkspace.mockResolvedValue(null);
    await expect(getAiApprovalModeForWorkspace("w-unknown")).resolves.toBe("review");
  });
});
