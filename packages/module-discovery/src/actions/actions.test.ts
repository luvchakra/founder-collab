/**
 * The module's own server actions. All three follow the same rule for the same reason:
 * Next redacts a thrown Server Action error's message in production, so a failure the
 * founder needs to read has to come back as state. Onboarding additionally derives a
 * business/product name from free text, because the two-question design never asks for
 * one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  }),
  getChatPanelData: vi.fn(),
  sendChatMessage: vi.fn(),
  recordInterestSignup: vi.fn(),
  notifyInterestSignup: vi.fn(),
  createBusiness: vi.fn(),
  createProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  addKnowledgeSource: vi.fn(),
  understandProduct: vi.fn(),
  generateIcp: vi.fn(),
  approveIcpProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ unstable_rethrow: h.unstable_rethrow }));
vi.mock("../lib/ai/chat", () => ({
  getChatPanelData: h.getChatPanelData,
  sendChatMessage: h.sendChatMessage,
}));
vi.mock("../lib/interest/mutations", () => ({ recordInterestSignup: h.recordInterestSignup }));
vi.mock("../lib/interest/notify", () => ({ notifyInterestSignup: h.notifyInterestSignup }));
vi.mock("../lib/tenancy/mutations", () => ({
  createBusiness: h.createBusiness,
  createProduct: h.createProduct,
}));
vi.mock("../lib/tenancy/queries", () => ({ getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../lib/knowledge/mutations", () => ({ addKnowledgeSource: h.addKnowledgeSource }));
vi.mock("../lib/ai/understand-product", () => ({ understandProduct: h.understandProduct }));
vi.mock("../lib/ai/generate-icp", () => ({ generateIcp: h.generateIcp }));
vi.mock("../lib/icp/mutations", () => ({ approveIcpProfile: h.approveIcpProfile }));

const { AiProviderError } = await import("../lib/ai/router");
const { UsageLimitExceededError } = await import("../lib/usage/limits");
const { getChatPanelDataAction, sendChatMessageAction } = await import("./chat");
const { submitInterestAction } = await import("./interest");
const { approveOnboardingIcpAction, runOnboardingAction } = await import("./onboarding");

const NO_CONTEXT = { businessId: null, productId: null };
const REPLY = { answer: "a", followUp: null };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  h.sendChatMessage.mockResolvedValue(REPLY);
  h.getChatPanelData.mockResolvedValue({ messages: [], followUp: null, starterQuestions: ["q"] });
  h.recordInterestSignup.mockResolvedValue({ isNew: true });
  h.notifyInterestSignup.mockResolvedValue(undefined);
  h.createBusiness.mockResolvedValue({ id: "biz-1" });
  h.createProduct.mockResolvedValue({ id: "prod-1" });
  h.getWorkspaceForProduct.mockResolvedValue({ id: "w1" });
  h.addKnowledgeSource.mockResolvedValue({ id: "k1" });
  h.understandProduct.mockResolvedValue({ category: "B2B" });
  h.generateIcp.mockResolvedValue({ id: "icp-1" });
  h.approveIcpProfile.mockResolvedValue(undefined);
});

describe("sendChatMessageAction", () => {
  it("returns the assistant's reply", async () => {
    await expect(sendChatMessageAction([{ role: "user", content: "hi" }], NO_CONTEXT)).resolves.toEqual(REPLY);
  });

  it("surfaces a BYOK failure's own message", async () => {
    h.sendChatMessage.mockRejectedValue(new AiProviderError("invalid_key", "Your key was rejected."));

    await expect(sendChatMessageAction([], NO_CONTEXT)).resolves.toEqual({
      error: "Your key was rejected.",
    });
  });

  it("surfaces a usage-limit failure's own message", async () => {
    h.sendChatMessage.mockRejectedValue(new UsageLimitExceededError("runs"));

    const result = await sendChatMessageAction([], NO_CONTEXT);

    expect(result).toMatchObject({ error: expect.stringContaining("AI runs") });
  });

  it("hides an unexpected failure behind a generic message, logging the real one", async () => {
    h.sendChatMessage.mockRejectedValue(new Error("TypeError: cannot read x of undefined"));

    await expect(sendChatMessageAction([], NO_CONTEXT)).resolves.toEqual({
      error: "Something went wrong. Try again.",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("getChatPanelDataAction", () => {
  it("returns the panel's data", async () => {
    await expect(getChatPanelDataAction(NO_CONTEXT)).resolves.toMatchObject({ starterQuestions: ["q"] });
  });

  it("degrades to an empty panel rather than breaking the page", async () => {
    h.getChatPanelData.mockRejectedValue(new Error("boom"));

    await expect(getChatPanelDataAction(NO_CONTEXT)).resolves.toEqual({
      messages: [],
      followUp: null,
      starterQuestions: [],
    });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("submitInterestAction", () => {
  it("records the signup and notifies the founder", async () => {
    await expect(submitInterestAction(null, form({ email: "  a@b.com  " }))).resolves.toEqual({
      success: true,
    });
    expect(h.recordInterestSignup).toHaveBeenCalledWith("a@b.com");
    expect(h.notifyInterestSignup).toHaveBeenCalledWith("a@b.com");
  });

  it("does not re-notify on a repeat submission, but still reports success to the visitor", async () => {
    h.recordInterestSignup.mockResolvedValue({ isNew: false });

    await expect(submitInterestAction(null, form({ email: "a@b.com" }))).resolves.toEqual({
      success: true,
    });
    expect(h.notifyInterestSignup).not.toHaveBeenCalled();
  });

  it("requires an email", async () => {
    await expect(submitInterestAction(null, form({ email: "  " }))).resolves.toEqual({
      error: "Enter your email to get notified.",
    });
    expect(h.recordInterestSignup).not.toHaveBeenCalled();
  });

  it.each(["not-an-email", "a@b", "a b@c.com", "@b.com"])("rejects %s", async (email) => {
    await expect(submitInterestAction(null, form({ email }))).resolves.toEqual({
      error: "Enter a valid email address.",
    });
    expect(h.recordInterestSignup).not.toHaveBeenCalled();
  });

  it("returns a generic message on failure, logging the real one", async () => {
    h.recordInterestSignup.mockRejectedValue(new Error("db down"));

    await expect(submitInterestAction(null, form({ email: "a@b.com" }))).resolves.toEqual({
      error: "Something went wrong -- please try again.",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("submitInterestAction — missing field", () => {
  it("treats a submission with no email field as an empty email", async () => {
    await expect(submitInterestAction(null, new FormData())).resolves.toEqual({
      error: "Enter your email to get notified.",
    });
  });
});

describe("runOnboardingAction", () => {
  const ANSWERS = {
    accountId: "acct-1",
    productDescription: "A tool that forecasts stock for small manufacturers",
    targetAudience: "Ops leads at 50-200 person manufacturers",
  };

  it("builds the whole starting state from two free-text answers", async () => {
    const result = await runOnboardingAction(null, form(ANSWERS));

    expect(result).toEqual({
      data: {
        businessId: "biz-1",
        productId: "prod-1",
        icpId: "icp-1",
        profile: { category: "B2B" },
        icp: { id: "icp-1" },
      },
    });
  });

  it("records both answers as the product's first knowledge source", async () => {
    await runOnboardingAction(null, form(ANSWERS));

    const content = String(h.addKnowledgeSource.mock.calls[0]![1].content);
    expect(content).toContain(ANSWERS.productDescription);
    expect(content).toContain(ANSWERS.targetAudience);
  });

  it("derives a short name from the description rather than asking for one", async () => {
    await runOnboardingAction(null, form(ANSWERS));

    const name = h.createBusiness.mock.calls[0]![1].name as string;
    expect(name.length).toBeLessThanOrEqual(40);
    expect(ANSWERS.productDescription.startsWith(name)).toBe(true);
    expect(h.createProduct).toHaveBeenCalledWith("biz-1", { name });
  });

  it("falls back to a placeholder name when the first word is already too long", async () => {
    await runOnboardingAction(null, form({ ...ANSWERS, productDescription: "x".repeat(60) }));

    expect(h.createBusiness).toHaveBeenCalledWith("acct-1", { name: "My Product" });
  });

  it("collapses runs of whitespace when deriving the name", async () => {
    await runOnboardingAction(null, form({ ...ANSWERS, productDescription: "  Stock   forecasting  tool " }));

    expect(h.createBusiness).toHaveBeenCalledWith("acct-1", { name: "Stock forecasting tool" });
  });

  it.each([
    ["no product description", { ...ANSWERS, productDescription: "" }, "Tell us what you're building first."],
    ["no target audience", { ...ANSWERS, targetAudience: "  " }, "Tell us who you think needs it."],
  ])("refuses with %s, before creating anything", async (_label, fields, message) => {
    await expect(runOnboardingAction(null, form(fields))).resolves.toEqual({ error: message });
    expect(h.createBusiness).not.toHaveBeenCalled();
  });

  it("returns a failure as state, with the real reason", async () => {
    h.understandProduct.mockRejectedValue(new Error("Connect an AI provider."));

    await expect(runOnboardingAction(null, form(ANSWERS))).resolves.toEqual({
      error: "Connect an AI provider.",
    });
  });

  it("reports a product with no workspace rather than continuing", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(runOnboardingAction(null, form(ANSWERS))).resolves.toEqual({
      error: "Workspace not found for the new product.",
    });
    expect(h.understandProduct).not.toHaveBeenCalled();
  });

  it("lets a Next control-flow throw propagate", async () => {
    h.createBusiness.mockRejectedValue(new Error("NEXT_REDIRECT;/x"));

    await expect(runOnboardingAction(null, form(ANSWERS))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("treats a submission with no fields at all as an empty description", async () => {
    await expect(runOnboardingAction(null, new FormData())).resolves.toEqual({
      error: "Tell us what you're building first.",
    });
    expect(h.createBusiness).not.toHaveBeenCalled();
  });

  it("passes an empty account id through rather than crashing on a missing field", async () => {
    const data = form(ANSWERS);
    data.delete("accountId");

    await runOnboardingAction(null, data);

    expect(h.createBusiness.mock.calls[0]![0]).toBe("");
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    h.understandProduct.mockRejectedValue("a string");

    await expect(runOnboardingAction(null, form(ANSWERS))).resolves.toEqual({
      error: "Something went wrong.",
    });
  });
});

describe("approveOnboardingIcpAction", () => {
  it("approves and reports no error", async () => {
    await expect(approveOnboardingIcpAction("icp-1")).resolves.toBeNull();
    expect(h.approveIcpProfile).toHaveBeenCalledWith("icp-1");
  });

  it("returns a failure as state", async () => {
    h.approveIcpProfile.mockRejectedValue(new Error("denied"));

    await expect(approveOnboardingIcpAction("icp-1")).resolves.toEqual({ error: "denied" });
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    h.approveIcpProfile.mockRejectedValue("a string");

    await expect(approveOnboardingIcpAction("icp-1")).resolves.toEqual({
      error: "Something went wrong.",
    });
  });
});
