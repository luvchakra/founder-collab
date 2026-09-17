/**
 * Next redacts a thrown Server Action error in production, so an AI action that lets its
 * error propagate shows the founder a generic digest instead of the real reason. This
 * wrapper converts a throw into returned state — except for Next's own control-flow
 * throws (redirect/notFound), which must keep propagating or a redirect after a
 * successful action would silently turn into an error banner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { unstable_rethrow } = vi.hoisted(() => ({
  // Mirrors Next's real behaviour: re-throw its own control-flow errors, ignore the rest.
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  }),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow }));

const { runAiAction } = await import("./ai-action-state");

beforeEach(() => vi.clearAllMocks());

describe("runAiAction", () => {
  it("returns null when the action body succeeds", async () => {
    expect(await runAiAction(async () => "ignored")).toBeNull();
  });

  it("returns a thrown Error's real message as state", async () => {
    expect(await runAiAction(async () => {
      throw new Error("Your Anthropic key is invalid.");
    })).toEqual({ error: "Your Anthropic key is invalid." });
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    expect(await runAiAction(async () => {
      throw "just a string";
    })).toEqual({ error: "Something went wrong." });
  });

  it("lets a redirect() keep propagating instead of swallowing it as a failure", async () => {
    await expect(
      runAiAction(async () => {
        throw new Error("NEXT_REDIRECT;/dashboard");
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  it("checks every error against Next's control-flow rethrow before converting it", async () => {
    const thrown = new Error("boom");

    await runAiAction(async () => {
      throw thrown;
    });

    expect(unstable_rethrow).toHaveBeenCalledWith(thrown);
  });

  it("awaits the body, so a rejected promise is caught rather than escaping unhandled", async () => {
    expect(await runAiAction(() => Promise.reject(new Error("async failure")))).toEqual({
      error: "async failure",
    });
  });
});
