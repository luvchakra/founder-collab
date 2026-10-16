import { beforeEach, describe, expect, it, vi } from "vitest";

// Help is signed-in only. A server action can be posted to any page's URL, so this one
// checks the session itself and returns no help text without it.

const h = vi.hoisted(() => ({ getClaims: vi.fn(), answerHelpQuestion: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ auth: { getClaims: h.getClaims } }) }));
vi.mock("@cofounderai/core/help/assistant", () => ({ answerHelpQuestion: h.answerHelpQuestion }));

const { askHelp } = await import("./actions");

function ask(question: string) {
  const data = new FormData();
  data.set("question", question);
  return askHelp({ status: "idle" }, data);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.answerHelpQuestion.mockResolvedValue({ answer: "Use Reverse.", sources: [{ guideSlug: "finance" }], mode: "ai", cached: false });
});

describe("askHelp", () => {
  it("refuses without a session and returns no help content", async () => {
    h.getClaims.mockResolvedValue({ data: null, error: null });

    const result = await ask("How do I reverse a journal entry?");

    expect(result).toEqual({ status: "error", question: "How do I reverse a journal entry?", message: "Sign in to ask a question." });
    expect(h.answerHelpQuestion).not.toHaveBeenCalled();
  });

  it("answers a signed-in user", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const result = await ask("How do I reverse a journal entry?");

    expect(result).toMatchObject({ status: "answered", answer: "Use Reverse." });
  });

  it("does nothing for an empty question", async () => {
    expect(await ask("  ")).toEqual({ status: "idle" });
    expect(h.getClaims).not.toHaveBeenCalled();
  });
});
