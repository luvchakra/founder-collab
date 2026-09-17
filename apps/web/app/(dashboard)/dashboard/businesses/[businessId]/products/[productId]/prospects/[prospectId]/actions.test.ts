/**
 * The prospect detail page's action surface — nineteen actions, mostly thin. The ones with
 * real behaviour are tested in full: approve-and-send does three things in order (retarget,
 * approve, send) where a wrong order would send to the previous recipient, and closing a
 * conversation is also the moment the deal outcome is recorded, which is what adds the
 * customer role to the shared party.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateProspect: vi.fn(),
  updateProspectStatus: vi.fn(),
  setProspectOutcome: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  researchProspect: vi.fn(),
  scoreProspect: vi.fn(),
  generateOutreachStrategy: vi.fn(),
  approveOutreachStrategy: vi.fn(),
  generateOutreachMessage: vi.fn(),
  generateReply: vi.fn(),
  updateMessageContent: vi.fn(),
  updateMessageContact: vi.fn(),
  approveMessage: vi.fn(),
  markMessageSent: vi.fn(),
  deleteMessage: vi.fn(),
  sendMessage: vi.fn(),
  closeConversation: vi.fn(),
  logInboundReply: vi.fn(),
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
vi.mock("@cofounderai/module-discovery/lib/prospects/mutations", () => ({
  updateProspect: h.updateProspect,
  updateProspectStatus: h.updateProspectStatus,
  setProspectOutcome: h.setProspectOutcome,
}));
vi.mock("@cofounderai/module-discovery/lib/contacts/mutations", () => ({
  createContact: h.createContact,
  updateContact: h.updateContact,
  deleteContact: h.deleteContact,
}));
vi.mock("@cofounderai/module-discovery/lib/ai/research-prospect", () => ({
  researchProspect: h.researchProspect,
}));
vi.mock("@cofounderai/module-discovery/lib/scoring/score-prospect", () => ({
  scoreProspect: h.scoreProspect,
}));
vi.mock("@cofounderai/module-discovery/lib/ai/generate-strategy", () => ({
  generateOutreachStrategy: h.generateOutreachStrategy,
}));
vi.mock("@cofounderai/module-discovery/lib/outreach/mutations", () => ({
  approveOutreachStrategy: h.approveOutreachStrategy,
}));
vi.mock("@cofounderai/module-discovery/lib/ai/generate-message", () => ({
  generateOutreachMessage: h.generateOutreachMessage,
}));
vi.mock("@cofounderai/module-discovery/lib/ai/generate-reply", () => ({ generateReply: h.generateReply }));
vi.mock("@cofounderai/module-discovery/lib/messages/mutations", () => ({
  updateMessageContent: h.updateMessageContent,
  updateMessageContact: h.updateMessageContact,
  approveMessage: h.approveMessage,
  markMessageSent: h.markMessageSent,
  deleteMessage: h.deleteMessage,
}));
vi.mock("@cofounderai/module-discovery/lib/messages/send", () => ({ sendMessage: h.sendMessage }));
vi.mock("@cofounderai/module-discovery/lib/conversations/mutations", () => ({
  closeConversation: h.closeConversation,
  logInboundReply: h.logInboundReply,
}));
vi.mock("@cofounderai/core/actions/ai-action-state", () => ({ runAiAction: h.runAiAction }));

const A = await import("./actions");

const PATH = "/dashboard/businesses/biz-1/products/prod-1/prospects/p1";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(h)) {
    if (fn !== h.runAiAction && fn !== h.revalidatePath) (fn as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  }
});

describe("prospect edits", () => {
  it("passes every field through for the mutation to normalize", async () => {
    await A.updateProspectAction("biz-1", "prod-1", "p1", form({ companyName: "Acme", website: "acme.com" }));

    expect(h.updateProspect).toHaveBeenCalledWith("p1", {
      companyName: "Acme",
      website: "acme.com",
      industry: "",
      companySize: "",
      location: "",
      description: "",
      linkedinUrl: "",
      twitterUrl: "",
      companyEmail: "",
    });
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("sets the submitted status", async () => {
    await A.updateProspectStatusAction("biz-1", "prod-1", "p1", form({ status: "qualified" }));

    expect(h.updateProspectStatus).toHaveBeenCalledWith("p1", "qualified");
  });

  it("defaults an omitted status to 'new'", async () => {
    await A.updateProspectStatusAction("biz-1", "prod-1", "p1", form({}));

    expect(h.updateProspectStatus).toHaveBeenCalledWith("p1", "new");
  });
});

describe("contact actions", () => {
  it("creates a contact against the workspace and prospect", async () => {
    await A.addContactAction("biz-1", "prod-1", "w1", "p1", form({ firstName: "Ada", email: "a@b.com" }));

    expect(h.createContact).toHaveBeenCalledWith("w1", "p1", {
      firstName: "Ada",
      lastName: "",
      jobTitle: "",
      email: "a@b.com",
      linkedinUrl: "",
      phone: "",
    });
  });

  it("updates and deletes a contact by id", async () => {
    await A.updateContactAction("biz-1", "prod-1", "p1", "c1", form({ firstName: "Ada" }));
    expect(h.updateContact).toHaveBeenCalledWith("c1", expect.objectContaining({ firstName: "Ada" }));

    await A.deleteContactAction("biz-1", "prod-1", "p1", "c1");
    expect(h.deleteContact).toHaveBeenCalledWith("c1");
  });
});

describe("AI-invoking actions", () => {
  it.each([
    ["researchProspectAction", () => A.researchProspectAction("biz-1", "prod-1", "p1"), () => h.researchProspect, ["p1"]],
    ["generateMessageAction", () => A.generateMessageAction("biz-1", "prod-1", "p1", "s1"), () => h.generateOutreachMessage, ["s1"]],
    ["generateReplyAction", () => A.generateReplyAction("biz-1", "prod-1", "p1", "conv-1"), () => h.generateReply, ["conv-1"]],
  ] as const)("%s runs through runAiAction and refreshes on success", async (_n, run, getMock, args) => {
    expect(await run()).toBeNull();

    expect(getMock()).toHaveBeenCalledWith(...args);
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it.each([
    ["researchProspectAction", () => A.researchProspectAction("biz-1", "prod-1", "p1"), () => h.researchProspect],
    ["generateMessageAction", () => A.generateMessageAction("biz-1", "prod-1", "p1", "s1"), () => h.generateOutreachMessage],
    ["generateReplyAction", () => A.generateReplyAction("biz-1", "prod-1", "p1", "conv-1"), () => h.generateReply],
  ] as const)("%s returns a provider failure as state", async (_n, run, getMock) => {
    getMock().mockRejectedValue(new Error("Connect an AI provider."));

    expect(await run()).toEqual({ error: "Connect an AI provider." });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("generates a strategy for the chosen contact, or none", async () => {
    await A.generateStrategyAction("biz-1", "prod-1", "p1", null, form({ contactId: "c1" }));
    expect(h.generateOutreachStrategy).toHaveBeenCalledWith("p1", "c1");

    await A.generateStrategyAction("biz-1", "prod-1", "p1", null, form({ contactId: "" }));
    expect(h.generateOutreachStrategy).toHaveBeenLastCalledWith("p1", null);
  });

  it("scores without the AI wrapper — scoring is deterministic and free", async () => {
    await A.scoreProspectAction("biz-1", "prod-1", "p1");

    expect(h.scoreProspect).toHaveBeenCalledWith("p1");
    expect(h.runAiAction).not.toHaveBeenCalled();
  });

  it("approves a strategy by id", async () => {
    await A.approveStrategyAction("biz-1", "prod-1", "p1", "s1");

    expect(h.approveOutreachStrategy).toHaveBeenCalledWith("s1");
  });
});

describe("message actions", () => {
  it("passes a present subject through, and null when the field is absent", async () => {
    await A.updateMessageContentAction("biz-1", "prod-1", "p1", "m1", form({ content: "Body", subject: "Hi" }));
    expect(h.updateMessageContent).toHaveBeenCalledWith("m1", "Body", "Hi");

    await A.updateMessageContentAction("biz-1", "prod-1", "p1", "m1", form({ content: "Body" }));
    expect(h.updateMessageContent).toHaveBeenLastCalledWith("m1", "Body", null);
  });

  it("keeps an explicitly empty subject distinct from an absent one", async () => {
    await A.updateMessageContentAction("biz-1", "prod-1", "p1", "m1", form({ content: "B", subject: "" }));

    expect(h.updateMessageContent).toHaveBeenCalledWith("m1", "B", "");
  });

  it.each([
    ["approveMessageAction", () => A.approveMessageAction("biz-1", "prod-1", "p1", "m1"), () => h.approveMessage],
    ["markMessageSentAction", () => A.markMessageSentAction("biz-1", "prod-1", "p1", "m1"), () => h.markMessageSent],
    ["deleteMessageAction", () => A.deleteMessageAction("biz-1", "prod-1", "p1", "m1"), () => h.deleteMessage],
  ] as const)("%s acts on the message and refreshes", async (_n, run, getMock) => {
    await run();

    expect(getMock()).toHaveBeenCalledWith("m1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });
});

describe("approveAndSendMessageAction", () => {
  it("retargets, approves, then sends — in that order", async () => {
    const order: string[] = [];
    h.updateMessageContact.mockImplementation(async () => void order.push("retarget"));
    h.approveMessage.mockImplementation(async () => void order.push("approve"));
    h.sendMessage.mockImplementation(async () => void order.push("send"));

    expect(
      await A.approveAndSendMessageAction("biz-1", "prod-1", "p1", "m1", null, form({ contactId: "c1" })),
    ).toBeNull();

    expect(order).toEqual(["retarget", "approve", "send"]);
    expect(h.updateMessageContact).toHaveBeenCalledWith("m1", "c1");
  });

  it("skips retargeting when no contact was chosen", async () => {
    await A.approveAndSendMessageAction("biz-1", "prod-1", "p1", "m1", null, form({ contactId: "" }));

    expect(h.updateMessageContact).not.toHaveBeenCalled();
    expect(h.approveMessage).toHaveBeenCalledWith("m1");
    expect(h.sendMessage).toHaveBeenCalledWith("m1");
  });

  it("surfaces a pre-flight failure as state rather than throwing", async () => {
    h.sendMessage.mockRejectedValue(new Error("No contact email on file"));

    expect(
      await A.approveAndSendMessageAction("biz-1", "prod-1", "p1", "m1", null, form({})),
    ).toEqual({ error: "No contact email on file" });
  });

  it("does not send if approval failed", async () => {
    h.approveMessage.mockRejectedValue(new Error("denied"));

    await A.approveAndSendMessageAction("biz-1", "prod-1", "p1", "m1", null, form({}));

    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});

describe("sendMessageAction", () => {
  it("retries a send, retargeting first when a contact is chosen", async () => {
    expect(
      await A.sendMessageAction("biz-1", "prod-1", "p1", "m1", null, form({ contactId: "c2" })),
    ).toBeNull();

    expect(h.updateMessageContact).toHaveBeenCalledWith("m1", "c2");
    expect(h.sendMessage).toHaveBeenCalledWith("m1");
    expect(h.approveMessage).not.toHaveBeenCalled();
  });

  it("surfaces a failure as state", async () => {
    h.sendMessage.mockRejectedValue(new Error("not configured"));

    expect(await A.sendMessageAction("biz-1", "prod-1", "p1", "m1", null, form({}))).toEqual({
      error: "not configured",
    });
  });
});

describe("closeConversationAction", () => {
  it.each(["won", "lost"])("closes the thread and records a '%s' outcome", async (outcome) => {
    await A.closeConversationAction("biz-1", "prod-1", "p1", "conv-1", form({ outcome }));

    expect(h.closeConversation).toHaveBeenCalledWith("conv-1");
    expect(h.setProspectOutcome).toHaveBeenCalledWith("p1", outcome);
  });

  it.each([
    ["no outcome", ""],
    ["an unrecognized outcome", "maybe"],
  ])("closes without recording an outcome given %s", async (_label, outcome) => {
    await A.closeConversationAction("biz-1", "prod-1", "p1", "conv-1", form({ outcome }));

    expect(h.closeConversation).toHaveBeenCalledWith("conv-1");
    expect(h.setProspectOutcome).not.toHaveBeenCalled();
  });
});

describe("logInboundReplyAction", () => {
  it("logs the typed reply and refreshes", async () => {
    expect(
      await A.logInboundReplyAction("biz-1", "prod-1", "p1", "conv-1", null, form({ content: "They said yes" })),
    ).toBeNull();

    expect(h.logInboundReply).toHaveBeenCalledWith("conv-1", "They said yes");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("returns a classification failure as state, since logging involves an AI call", async () => {
    h.logInboundReply.mockRejectedValue(new Error("free-tier allowance"));

    expect(
      await A.logInboundReplyAction("biz-1", "prod-1", "p1", "conv-1", null, form({ content: "x" })),
    ).toEqual({ error: "free-tier allowance" });
  });
});
