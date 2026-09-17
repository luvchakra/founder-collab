/**
 * The settings form in front of BYOK key storage. Its own job is narrow: reject anything
 * that is not one of the three supported providers before the key reaches the mutation,
 * and surface a provider's rejection inline rather than as a thrown, redacted error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  connectAiProvider: vi.fn(),
  disconnectAiProvider: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/ai-providers/mutations", () => ({
  connectAiProvider: h.connectAiProvider,
  disconnectAiProvider: h.disconnectAiProvider,
}));

const { connectProviderAction, disconnectProviderAction } = await import("./actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: clear wipes recorded calls but keeps an
  // implementation, so a mockRejectedValue set in one test would leak into the next.
  vi.resetAllMocks();
});

describe("connectProviderAction", () => {
  it.each(["openai", "anthropic", "google"])("connects %s", async (provider) => {
    const result = await connectProviderAction("acct-1", null, form({ provider, apiKey: "sk-x" }));

    expect(h.connectAiProvider).toHaveBeenCalledWith("acct-1", provider, "sk-x");
    expect(result).toBeNull();
  });

  it.each([
    ["an unknown provider", "cohere"],
    ["an empty provider", ""],
  ])("rejects %s without reaching the mutation", async (_label, provider) => {
    const result = await connectProviderAction("acct-1", null, form({ provider, apiKey: "sk-x" }));

    expect(result).toEqual({ error: "Choose an AI provider." });
    expect(h.connectAiProvider).not.toHaveBeenCalled();
  });

  it("surfaces the provider's rejection reason inline", async () => {
    h.connectAiProvider.mockRejectedValue(new Error("That API key was rejected by the provider."));

    expect(await connectProviderAction("acct-1", null, form({ provider: "openai", apiKey: "bad" }))).toEqual(
      { error: "That API key was rejected by the provider." },
    );
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    h.connectAiProvider.mockRejectedValue("just a string");

    expect(await connectProviderAction("acct-1", null, form({ provider: "openai", apiKey: "x" }))).toEqual({
      error: "Connection failed.",
    });
  });

  it("refreshes the settings page only after a successful connection", async () => {
    await connectProviderAction("acct-1", null, form({ provider: "openai", apiKey: "sk-x" }));

    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/settings/ai-provider");
  });

  it("passes an empty key through to the mutation, which owns that validation", async () => {
    await connectProviderAction("acct-1", null, form({ provider: "openai" }));

    expect(h.connectAiProvider).toHaveBeenCalledWith("acct-1", "openai", "");
  });
});

describe("disconnectProviderAction", () => {
  it("disconnects and refreshes the page", async () => {
    await disconnectProviderAction("acct-1");

    expect(h.disconnectAiProvider).toHaveBeenCalledWith("acct-1");
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/settings/ai-provider");
  });

  it("lets a failure propagate rather than reporting success", async () => {
    h.disconnectAiProvider.mockRejectedValue(new Error("denied"));

    await expect(disconnectProviderAction("acct-1")).rejects.toThrow("denied");
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
