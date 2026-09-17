/**
 * Discovery's three actions. The run action is the one that matters: it wraps in
 * runAiAction so a BYOK failure reaches the founder as text, while the redirect inside it
 * must still propagate — which is exactly what runAiAction's unstable_rethrow preserves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  discoverProspects: vi.fn(),
  approveProspectSuggestions: vi.fn(),
  discardProspectSuggestions: vi.fn(),
  runAiAction: vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (error) {
      // Mirrors the real wrapper: Next's own control-flow throws keep propagating.
      if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
      return { error: error instanceof Error ? error.message : "Something went wrong." };
    }
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/ai/discover-prospects", () => ({
  discoverProspects: h.discoverProspects,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/mutations", () => ({
  approveProspectSuggestions: h.approveProspectSuggestions,
  discardProspectSuggestions: h.discardProspectSuggestions,
}));
vi.mock("@cofounderai/core/actions/ai-action-state", () => ({ runAiAction: h.runAiAction }));

const { approveSuggestionsAction, discardSuggestionsAction, runDiscoveryAction } = await import("./actions");

const DISCOVER = "/dashboard/businesses/biz-1/products/prod-1/prospects/discover";
const PROSPECTS = "/dashboard/businesses/biz-1/products/prod-1/prospects";

function form(ids: string[]) {
  const data = new FormData();
  for (const id of ids) data.append("ids", id);
  return data;
}

async function captureRedirect(run: () => Promise<unknown>) {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return h.redirect.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.discoverProspects.mockResolvedValue(undefined);
  h.approveProspectSuggestions.mockResolvedValue(3);
  h.discardProspectSuggestions.mockResolvedValue(undefined);
});

describe("runDiscoveryAction", () => {
  it("runs discovery and returns to the discover page", async () => {
    const target = await captureRedirect(() => runDiscoveryAction("biz-1", "prod-1", "w1"));

    expect(h.discoverProspects).toHaveBeenCalledWith("w1");
    expect(target).toBe(DISCOVER);
  });

  it("returns a BYOK failure as state rather than throwing", async () => {
    h.discoverProspects.mockRejectedValue(new Error("Connect an AI provider before using this feature."));

    expect(await runDiscoveryAction("biz-1", "prod-1", "w1")).toEqual({
      error: "Connect an AI provider before using this feature.",
    });
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("refreshes the discover page before redirecting", async () => {
    await captureRedirect(() => runDiscoveryAction("biz-1", "prod-1", "w1"));

    expect(h.revalidatePath).toHaveBeenCalledWith(DISCOVER);
  });
});

describe("approveSuggestionsAction", () => {
  it("approves the selected ids and reports how many were added", async () => {
    const target = await captureRedirect(() =>
      approveSuggestionsAction("biz-1", "prod-1", "w1", form(["s1", "s2", "s3"])),
    );

    expect(h.approveProspectSuggestions).toHaveBeenCalledWith("w1", ["s1", "s2", "s3"]);
    expect(target).toBe(`${PROSPECTS}?imported=3`);
  });

  it("refreshes both the prospects list and the discover page", async () => {
    await captureRedirect(() => approveSuggestionsAction("biz-1", "prod-1", "w1", form(["s1"])));

    expect(h.revalidatePath).toHaveBeenCalledWith(PROSPECTS);
    expect(h.revalidatePath).toHaveBeenCalledWith(DISCOVER);
  });

  it("passes an empty selection through", async () => {
    h.approveProspectSuggestions.mockResolvedValue(0);

    const target = await captureRedirect(() =>
      approveSuggestionsAction("biz-1", "prod-1", "w1", form([])),
    );

    expect(h.approveProspectSuggestions).toHaveBeenCalledWith("w1", []);
    expect(target).toBe(`${PROSPECTS}?imported=0`);
  });

  it("lets a failure propagate rather than redirecting", async () => {
    h.approveProspectSuggestions.mockRejectedValue(new Error("denied"));

    await expect(
      approveSuggestionsAction("biz-1", "prod-1", "w1", form(["s1"])),
    ).rejects.toThrow("denied");
    expect(h.redirect).not.toHaveBeenCalled();
  });
});

describe("discardSuggestionsAction", () => {
  it("discards the selected ids and stays on the discover page", async () => {
    const target = await captureRedirect(() =>
      discardSuggestionsAction("biz-1", "prod-1", "w1", form(["s1", "s2"])),
    );

    expect(h.discardProspectSuggestions).toHaveBeenCalledWith("w1", ["s1", "s2"]);
    expect(target).toBe(DISCOVER);
  });

  it("lets a failure propagate", async () => {
    h.discardProspectSuggestions.mockRejectedValue(new Error("denied"));

    await expect(
      discardSuggestionsAction("biz-1", "prod-1", "w1", form(["s1"])),
    ).rejects.toThrow("denied");
  });
});
