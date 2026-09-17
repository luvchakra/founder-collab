/**
 * The ICP form's three actions. The generate action wraps itself in runAiAction so a
 * provider failure reaches the founder as a real message rather than Next's redacted
 * digest; the other two are thin and their job is to parse the textareas into arrays and
 * refresh the right path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  generateIcp: vi.fn(),
  updateIcpProfile: vi.fn(),
  approveIcpProfile: vi.fn(),
  parseListField: vi.fn((raw: string) => raw.split("\n").map((l) => l.trim()).filter(Boolean)),
  runAiAction: vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Something went wrong." };
    }
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/ai/generate-icp", () => ({ generateIcp: h.generateIcp }));
vi.mock("@cofounderai/module-discovery/lib/icp/mutations", () => ({
  updateIcpProfile: h.updateIcpProfile,
  approveIcpProfile: h.approveIcpProfile,
  parseListField: h.parseListField,
}));
vi.mock("@cofounderai/core/actions/ai-action-state", () => ({ runAiAction: h.runAiAction }));

const { approveIcpAction, generateIcpAction, updateIcpAction } = await import("./actions");

const ICP_PATH = "/dashboard/businesses/biz-1/products/prod-1/icp";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.generateIcp.mockResolvedValue({ id: "icp-1" });
});

describe("generateIcpAction", () => {
  it("generates and refreshes the ICP page, returning null on success", async () => {
    const result = await generateIcpAction("biz-1", "prod-1", null, form({}));

    expect(h.generateIcp).toHaveBeenCalledWith("prod-1", { force: false });
    expect(h.revalidatePath).toHaveBeenCalledWith(ICP_PATH);
    expect(result).toBeNull();
  });

  it("forces a regenerate only when the form says so", async () => {
    await generateIcpAction("biz-1", "prod-1", null, form({ force: "true" }));
    expect(h.generateIcp).toHaveBeenCalledWith("prod-1", { force: true });

    await generateIcpAction("biz-1", "prod-1", null, form({ force: "false" }));
    expect(h.generateIcp).toHaveBeenLastCalledWith("prod-1", { force: false });
  });

  it("returns a provider failure as state, so the founder sees the real reason", async () => {
    h.generateIcp.mockRejectedValue(new Error("Connect an AI provider before using this feature."));

    expect(await generateIcpAction("biz-1", "prod-1", null, form({}))).toEqual({
      error: "Connect an AI provider before using this feature.",
    });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("runs through runAiAction, which is what keeps redirects propagating", async () => {
    await generateIcpAction("biz-1", "prod-1", null, form({}));

    expect(h.runAiAction).toHaveBeenCalledOnce();
  });
});

describe("updateIcpAction", () => {
  it("parses every list textarea into an array", async () => {
    await updateIcpAction(
      "biz-1",
      "prod-1",
      "icp-1",
      form({
        name: "Mid-market",
        description: "desc",
        industries: "Manufacturing\nLogistics",
        companySizes: "50-200",
        geographies: "India",
        roles: "Ops",
        painPoints: "Stockouts",
        buyingSignals: "Hiring",
        exclusions: "Retail",
      }),
    );

    expect(h.updateIcpProfile).toHaveBeenCalledWith("icp-1", {
      name: "Mid-market",
      description: "desc",
      industries: ["Manufacturing", "Logistics"],
      companySizes: ["50-200"],
      geographies: ["India"],
      roles: ["Ops"],
      painPoints: ["Stockouts"],
      buyingSignals: ["Hiring"],
      exclusions: ["Retail"],
    });
  });

  it("sends empty arrays for omitted textareas", async () => {
    await updateIcpAction("biz-1", "prod-1", "icp-1", form({ name: "X" }));

    expect(h.updateIcpProfile).toHaveBeenCalledWith(
      "icp-1",
      expect.objectContaining({ industries: [], exclusions: [] }),
    );
  });

  it("refreshes the ICP page", async () => {
    await updateIcpAction("biz-1", "prod-1", "icp-1", form({ name: "X" }));

    expect(h.revalidatePath).toHaveBeenCalledWith(ICP_PATH);
  });

  it("lets a validation failure propagate", async () => {
    h.updateIcpProfile.mockRejectedValue(new Error("Name is required."));

    await expect(updateIcpAction("biz-1", "prod-1", "icp-1", form({ name: "" }))).rejects.toThrow(
      "Name is required.",
    );
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("approveIcpAction", () => {
  it("approves and refreshes", async () => {
    await approveIcpAction("biz-1", "prod-1", "icp-1");

    expect(h.approveIcpProfile).toHaveBeenCalledWith("icp-1");
    expect(h.revalidatePath).toHaveBeenCalledWith(ICP_PATH);
  });

  it("lets a failure propagate", async () => {
    h.approveIcpProfile.mockRejectedValue(new Error("denied"));

    await expect(approveIcpAction("biz-1", "prod-1", "icp-1")).rejects.toThrow("denied");
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
