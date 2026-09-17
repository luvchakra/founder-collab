// @vitest-environment jsdom
/**
 * The prospect detail page is the whole outreach pipeline on one screen, and each section
 * gates the next (research → score → strategy → messages → conversations, per
 * lib/prospects/pipeline.ts). The gates are the subject here: strategy cannot be
 * generated without research, messages cannot be generated until a strategy is
 * *approved*, and an email cannot be sent until some contact has an email address —
 * docs/prospects-pipeline-redesign-requirements.md R1 requires that last one be an
 * inline prompt to add a contact rather than a silently dead button.
 *
 * The header's "Next:" line is derived from all six queries at once, so it is the single
 * assertion that proves the page is reading its own state correctly.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contact,
  conversation,
  message,
  product,
  prospect,
  research,
  score,
  strategy,
  workspace,
} from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getProspect: vi.fn(),
  listContacts: vi.fn(),
  getProspectResearch: vi.fn(),
  listRecentProspectScores: vi.fn(),
  getLatestOutreachStrategy: vi.fn(),
  listMessages: vi.fn(),
  listConversations: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/queries", () => ({
  getProspect: h.getProspect,
}));
vi.mock("@cofounderai/module-discovery/lib/contacts/queries", () => ({
  listContacts: h.listContacts,
}));
vi.mock("@cofounderai/module-discovery/lib/research/queries", () => ({
  getProspectResearch: h.getProspectResearch,
}));
vi.mock("@cofounderai/module-discovery/lib/scoring/queries", () => ({
  listRecentProspectScores: h.listRecentProspectScores,
}));
vi.mock("@cofounderai/module-discovery/lib/outreach/queries", () => ({
  getLatestOutreachStrategy: h.getLatestOutreachStrategy,
}));
vi.mock("@cofounderai/module-discovery/lib/messages/queries", () => ({
  listMessages: h.listMessages,
}));
vi.mock("@cofounderai/module-discovery/lib/conversations/queries", () => ({
  listConversations: h.listConversations,
}));
vi.mock("./actions", () => {
  const noop = () => vi.fn();
  return {
    updateProspectAction: noop(),
    updateProspectStatusAction: noop(),
    addContactAction: noop(),
    updateContactAction: noop(),
    deleteContactAction: noop(),
    researchProspectAction: noop(),
    scoreProspectAction: noop(),
    generateStrategyAction: noop(),
    approveStrategyAction: noop(),
    generateMessageAction: noop(),
    updateMessageContentAction: noop(),
    approveMessageAction: noop(),
    approveAndSendMessageAction: noop(),
    sendMessageAction: noop(),
    markMessageSentAction: noop(),
    deleteMessageAction: noop(),
    generateReplyAction: noop(),
    closeConversationAction: noop(),
    logInboundReplyAction: noop(),
  };
});

const { default: ProspectDetailPage } = await import("./page");

type State = {
  contacts?: ReturnType<typeof contact>[];
  research?: ReturnType<typeof research> | null;
  scores?: ReturnType<typeof score>[];
  strategy?: ReturnType<typeof strategy> | null;
  messages?: ReturnType<typeof message>[];
  conversations?: ReturnType<typeof conversation>[];
};

function given(state: State = {}) {
  h.listContacts.mockResolvedValue(state.contacts ?? []);
  h.getProspectResearch.mockResolvedValue(state.research ?? null);
  h.listRecentProspectScores.mockResolvedValue(state.scores ?? []);
  h.getLatestOutreachStrategy.mockResolvedValue(state.strategy ?? null);
  h.listMessages.mockResolvedValue(state.messages ?? []);
  h.listConversations.mockResolvedValue(state.conversations ?? []);
}

const renderPage = (searchParams: { duplicate?: string } = {}) =>
  ProspectDetailPage({
    params: Promise.resolve({ businessId: "biz-1", productId: "prod-1", prospectId: "prospect-1" }),
    searchParams: Promise.resolve(searchParams),
  }).then(render);

const section = (id: string) => document.querySelector(`#${id}`) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.getProspect.mockResolvedValue(prospect());
  given();
});

afterEach(cleanup);

describe("ProspectDetailPage — tenancy", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.getProspect).not.toHaveBeenCalled();
  });

  it("404s a prospect that does not exist", async () => {
    h.getProspect.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a prospect belonging to another workspace", async () => {
    h.getProspect.mockResolvedValue(prospect({ workspace_id: "ws-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.listContacts).not.toHaveBeenCalled();
  });
});

describe("ProspectDetailPage — header", () => {
  it("names the next action for a brand-new prospect and anchors it to that section", async () => {
    await renderPage();

    const next = screen.getByRole("link", { name: /^Next:/ });
    expect(next).toHaveTextContent("Next: Research");
    expect(next.getAttribute("href")).toBe("#research");
  });

  it("moves the next action along as each step completes", async () => {
    given({ research: research() });
    await renderPage();
    expect(screen.getByRole("link", { name: /^Next:/ })).toHaveAttribute("href", "#score");

    cleanup();
    given({ research: research(), scores: [score()] });
    await renderPage();
    expect(screen.getByRole("link", { name: /^Next:/ })).toHaveAttribute("href", "#strategy");

    cleanup();
    given({ research: research(), scores: [score()], strategy: strategy({ status: "approved" }) });
    await renderPage();
    expect(screen.getByRole("link", { name: /^Next:/ })).toHaveAttribute("href", "#messages");
  });

  it("says nothing is needed once the conversation is closed", async () => {
    given({
      research: research(),
      scores: [score()],
      strategy: strategy({ status: "approved" }),
      messages: [message({ status: "sent", conversation_id: "conv-1" })],
      conversations: [conversation({ status: "closed" })],
    });

    await renderPage();

    expect(screen.getByText("No action needed right now")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Next:/ })).not.toBeInTheDocument();
  });

  it("explains a redirect that hit an existing prospect", async () => {
    await renderPage({ duplicate: "1" });

    expect(screen.getByText(/already in your pipeline -- nothing new was created/)).toBeInTheDocument();
  });

  it("says nothing about duplicates on a normal visit", async () => {
    await renderPage();

    expect(screen.queryByText(/already in your pipeline/)).not.toBeInTheDocument();
  });

  it("links back to the prospect list", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "← Back to prospects" })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1/products/prod-1/prospects",
    );
  });
});

describe("ProspectDetailPage — company details", () => {
  it("pre-fills the editable fields, leaving unknown ones blank", async () => {
    h.getProspect.mockResolvedValue(
      prospect({ company_name: "Globex", website: "https://globex.example", industry: null }),
    );

    await renderPage();

    expect(screen.getByLabelText("Company name")).toHaveValue("Globex");
    expect(screen.getByLabelText("Website")).toHaveValue("https://globex.example");
    expect(screen.getByLabelText("Industry")).toHaveValue("");
  });

  it("offers the three qualification statuses, on the prospect's current one", async () => {
    h.getProspect.mockResolvedValue(prospect({ status: "qualified" }));

    await renderPage();

    const status = screen.getByRole("combobox", { name: "" }) as HTMLSelectElement;
    expect([...status.options].map((o) => o.value)).toEqual(["new", "qualified", "disqualified"]);
    expect(status).toHaveValue("qualified");
  });
});

describe("ProspectDetailPage — research", () => {
  it("offers research and explains the wait when there is none", async () => {
    await renderPage();

    expect(within(section("research")).getByRole("button", { name: "Research" })).toBeEnabled();
    expect(within(section("research")).getByText(/Not researched yet\./)).toBeInTheDocument();
  });

  it("shows what research found, with a source link per evidence item", async () => {
    given({ research: research() });

    await renderPage();

    const panel = within(section("research"));
    expect(panel.getByText(/Globex sells widgets online/)).toBeInTheDocument();
    expect(panel.getByText("manual returns")).toBeInTheDocument();
    expect(panel.getByText("hiring support staff")).toBeInTheDocument();
    expect(panel.getByText("raised a seed round")).toBeInTheDocument();
    expect(panel.getByText("Lead with time saved per return")).toBeInTheDocument();
    expect(panel.getByText("Fact")).toBeInTheDocument();
    expect(panel.getByRole("link", { name: "source" })).toHaveAttribute(
      "href",
      "https://jobs.example",
    );
    expect(panel.getByRole("button", { name: "Re-research" })).toBeInTheDocument();
  });

  it("omits the sections the research came back empty on", async () => {
    given({
      research: research({
        pain_points: [],
        buying_signals: [],
        recent_events: [],
        recommended_angle: null,
        evidence: [],
      }),
    });

    await renderPage();

    const panel = within(section("research"));
    for (const label of ["Pain points", "Buying signals", "Recent events", "Recommended angle", "Evidence"]) {
      expect(panel.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("falls back to the raw confidence value it doesn't have a label for", async () => {
    given({
      research: research({
        evidence: [{ claim: "Something", source_url: null, confidence: "speculation" as never }],
      }),
    });

    await renderPage();

    expect(within(section("research")).getByText("speculation")).toBeInTheDocument();
    expect(within(section("research")).queryByRole("link", { name: "source" })).not.toBeInTheDocument();
  });
});

describe("ProspectDetailPage — score", () => {
  it("says an approved ICP is needed before scoring", async () => {
    await renderPage();

    expect(within(section("score")).getByText("Not scored yet. Requires an approved ICP.")).toBeInTheDocument();
    expect(within(section("score")).getByRole("button", { name: "Score" })).toBeInTheDocument();
  });

  it("breaks the score down by its weighted components", async () => {
    given({ research: research(), scores: [score()] });

    await renderPage();

    const panel = within(section("score"));
    expect(panel.getByText("84")).toBeInTheDocument();
    expect(panel.getByText(/ICP fit 90 .*Intent 80 .*Timing 70/)).toBeInTheDocument();
    expect(panel.getByText("Strong ICP match.")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Rescore" })).toBeInTheDocument();
  });

  it("shows an improvement against the previous score", async () => {
    given({ research: research(), scores: [score({ overall_score: 84 }), score({ id: "s0", overall_score: 70 })] });

    await renderPage();

    expect(within(section("score")).getByText(/▲ 14 since last score \(70\)/)).toBeInTheDocument();
  });

  it("shows a drop against the previous score", async () => {
    given({ research: research(), scores: [score({ overall_score: 60 }), score({ id: "s0", overall_score: 75 })] });

    await renderPage();

    expect(within(section("score")).getByText(/▼ 15 since last score \(75\)/)).toBeInTheDocument();
  });

  it("says so when a rescore changed nothing", async () => {
    given({ research: research(), scores: [score(), score({ id: "s0" })] });

    await renderPage();

    expect(within(section("score")).getByText("No change since last score")).toBeInTheDocument();
  });

  it("compares against nothing on a first score", async () => {
    given({ research: research(), scores: [score()] });

    await renderPage();

    expect(within(section("score")).queryByText(/since last score/)).not.toBeInTheDocument();
  });
});

describe("ProspectDetailPage — strategy", () => {
  it("cannot be generated before the prospect is researched", async () => {
    await renderPage();

    const panel = within(section("strategy"));
    expect(panel.getByRole("button", { name: "Generate strategy" })).toBeDisabled();
    expect(panel.getByText("Research this prospect first.")).toBeInTheDocument();
  });

  it("unlocks once research exists", async () => {
    given({ research: research() });

    await renderPage();

    const panel = within(section("strategy"));
    expect(panel.getByRole("button", { name: "Generate strategy" })).toBeEnabled();
    expect(panel.getByText("No strategy yet.")).toBeInTheDocument();
  });

  it("lets the founder aim the strategy at a specific contact", async () => {
    given({ research: research(), contacts: [contact(), contact({ id: "contact-2", first_name: null, last_name: null })] });

    await renderPage();

    const select = within(section("strategy")).getByRole("combobox") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "No specific contact",
      "Sarah Miller",
      "contact-2",
    ]);
  });

  it("offers no contact picker when the prospect has none", async () => {
    given({ research: research() });

    await renderPage();

    expect(within(section("strategy")).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows a draft strategy with an approve step", async () => {
    given({ research: research(), strategy: strategy() });

    await renderPage();

    const panel = within(section("strategy"));
    expect(panel.getByText("Open on their returns backlog")).toBeInTheDocument();
    expect(panel.getByText("Cut manual return handling")).toBeInTheDocument();
    expect(panel.getByText("15-minute discovery call")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Approve strategy" })).toBeInTheDocument();
    expect(panel.queryByText("Approved")).not.toBeInTheDocument();
  });

  it("marks an approved strategy and drops the approve step", async () => {
    given({ research: research(), strategy: strategy({ status: "approved" }) });

    await renderPage();

    const panel = within(section("strategy"));
    expect(panel.getByText("Approved")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "Approve strategy" })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Generate new strategy" })).toBeInTheDocument();
  });
});

describe("ProspectDetailPage — messages", () => {
  it("cannot be generated until a strategy is approved", async () => {
    given({ research: research(), strategy: strategy() });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByText("Approve an outreach strategy first.")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "Generate message" })).not.toBeInTheDocument();
  });

  it("offers generation once the strategy is approved", async () => {
    given({ research: research(), strategy: strategy({ status: "approved" }) });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByRole("button", { name: "Generate message" })).toBeInTheDocument();
    expect(panel.getByText("No draft messages yet.")).toBeInTheDocument();
  });

  it("blocks sending an email with an inline prompt when no contact has one", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message()],
      contacts: [contact({ email: null })],
    });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByText("Add a contact with an email below before this can be sent.")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /Approve & send email/ })).not.toBeInTheDocument();
  });

  it("offers approve-and-send once some contact has an email, letting you pick which", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message()],
      contacts: [contact(), contact({ id: "contact-2", email: null, first_name: "No", last_name: "Email" })],
    });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByRole("button", { name: /Approve & send email/ })).toBeInTheDocument();
    const select = panel.getByRole("combobox") as HTMLSelectElement;
    // only contacts with an email are offered as recipients
    expect([...select.options].map((o) => o.textContent)).toEqual(["Sarah Miller"]);
    expect(panel.queryByText(/before this can be sent/)).not.toBeInTheDocument();
  });

  it("sends without re-approving once the message is approved", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message({ status: "approved" })],
      contacts: [contact()],
    });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByRole("button", { name: /Send email/ })).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /Approve & send email/ })).not.toBeInTheDocument();
  });

  it("offers a retry and the provider's reason after a failed send", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message({ status: "failed", failure_reason: "Mailbox does not exist" })],
      contacts: [contact()],
    });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByRole("button", { name: /Retry send/ })).toBeInTheDocument();
    expect(panel.getByRole("alert")).toHaveTextContent("Send failed: Mailbox does not exist");
  });

  it("locks a sent message and timestamps it", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message({ status: "sent", sent_at: "2026-02-14T10:00:00Z" })],
      contacts: [contact()],
    });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByText("Cutting your returns backlog")).toBeInTheDocument();
    expect(panel.getByRole("textbox")).toBeDisabled();
    expect(panel.queryByRole("button", { name: "Save edits" })).not.toBeInTheDocument();
    expect(panel.getByText(`Sent ${new Date("2026-02-14T10:00:00Z").toLocaleString()}`)).toBeInTheDocument();
  });

  it("approves and marks sent by hand on a channel it cannot send for", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message({ channel: "linkedin", subject: null })],
    });

    await renderPage();

    const panel = within(section("messages"));
    expect(panel.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    // no subject line for a non-email channel
    expect(panel.queryByPlaceholderText("Subject")).not.toBeInTheDocument();
    expect(panel.queryByText(/before this can be sent/)).not.toBeInTheDocument();
  });

  it("offers Mark sent for an approved non-email message", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message({ channel: "whatsapp", subject: null, status: "approved" })],
    });

    await renderPage();

    expect(within(section("messages")).getByRole("button", { name: "Mark sent" })).toBeInTheDocument();
  });

  it("keeps messages that belong to a conversation out of the drafts list", async () => {
    given({
      research: research(),
      strategy: strategy({ status: "approved" }),
      messages: [message({ id: "msg-2", conversation_id: "conv-1", status: "sent", sent_at: "2026-01-02T00:00:00Z" })],
      conversations: [conversation()],
    });

    await renderPage();

    expect(within(section("messages")).getByText("No draft messages yet.")).toBeInTheDocument();
    expect(within(section("conversations")).getByText(/Hi Sarah/)).toBeInTheDocument();
  });
});

describe("ProspectDetailPage — conversations", () => {
  it("has none until a message is sent", async () => {
    await renderPage();

    expect(
      within(section("conversations")).getByText(/No conversations yet -- mark a message sent to start one\./),
    ).toBeInTheDocument();
  });

  it("threads a conversation in order and offers to log a reply", async () => {
    given({
      messages: [
        message({ id: "m2", conversation_id: "conv-1", direction: "inbound", content: "Tell me more", created_at: "2026-01-02T00:00:00Z" }),
        message({ id: "m1", conversation_id: "conv-1", status: "sent", created_at: "2026-01-01T00:00:00Z" }),
      ],
      conversations: [conversation()],
    });

    await renderPage();

    const panel = within(section("conversations"));
    expect(panel.getByText("Awaiting reply")).toBeInTheDocument();
    const bubbles = panel.getAllByRole("listitem");
    expect(bubbles[0]).toHaveTextContent("Hi Sarah");
    expect(bubbles[1]).toHaveTextContent("Tell me more");
    expect(panel.getByRole("button", { name: "Log reply" })).toBeInTheDocument();
  });

  it("labels an inbound reply's classification and the action it suggests", async () => {
    given({
      messages: [
        message({
          id: "m2",
          conversation_id: "conv-1",
          direction: "inbound",
          content: "How long does setup take?",
          classification: "question",
          recommended_action: "Send an implementation overview",
        }),
      ],
      conversations: [conversation({ status: "replied" })],
    });

    await renderPage();

    const panel = within(section("conversations"));
    expect(panel.getByText("Needs response")).toBeInTheDocument();
    expect(panel.getByText("Question")).toBeInTheDocument();
    expect(panel.getByText("Suggested next step: Send an implementation overview")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Generate reply" })).toBeInTheDocument();
  });

  it("falls back to the raw classification it has no label for", async () => {
    given({
      messages: [
        message({ id: "m2", conversation_id: "conv-1", direction: "inbound", classification: "referral" as never }),
      ],
      conversations: [conversation({ status: "replied" })],
    });

    await renderPage();

    expect(within(section("conversations")).getByText("referral")).toBeInTheDocument();
  });

  it("offers Won and Lost while a conversation is open", async () => {
    given({ conversations: [conversation()] });

    await renderPage();

    const panel = within(section("conversations"));
    expect(panel.getByRole("button", { name: "Won" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Lost" })).toBeInTheDocument();
  });

  it("records the outcome once closed, and stops asking for replies", async () => {
    h.getProspect.mockResolvedValue(prospect({ outcome: "won" }));
    given({ conversations: [conversation({ status: "closed" })] });

    await renderPage();

    const panel = within(section("conversations"));
    expect(panel.getByText("Closed · Won")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "Won" })).not.toBeInTheDocument();
    expect(panel.queryByRole("button", { name: "Log reply" })).not.toBeInTheDocument();
  });

  it("records a lost outcome the same way", async () => {
    h.getProspect.mockResolvedValue(prospect({ outcome: "lost" }));
    given({ conversations: [conversation({ status: "closed" })] });

    await renderPage();

    expect(within(section("conversations")).getByText("Closed · Lost")).toBeInTheDocument();
  });

  it("shows a closed conversation with no recorded outcome as simply closed", async () => {
    given({ conversations: [conversation({ status: "closed" })] });

    await renderPage();

    expect(within(section("conversations")).getByText("Closed")).toBeInTheDocument();
  });

  it("threads each channel separately, with its own icon", async () => {
    given({
      conversations: [
        conversation(),
        conversation({ id: "conv-2", channel: "linkedin", last_message_at: "2026-01-02T00:00:00Z" }),
        conversation({ id: "conv-3", channel: "whatsapp", last_message_at: "2026-01-03T00:00:00Z" }),
      ],
    });

    await renderPage();

    const panel = within(section("conversations"));
    expect(panel.getByText(/email thread/)).toBeInTheDocument();
    expect(panel.getByText(/linkedin thread/)).toBeInTheDocument();
    expect(panel.getByText(/whatsapp thread/)).toBeInTheDocument();
  });
});

describe("ProspectDetailPage — contacts", () => {
  it("says there are none and offers the add form", async () => {
    await renderPage();

    expect(screen.getByText("No contacts yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add contact" })).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Job title")).toBeInTheDocument();
  });

  it("lists the contacts it has", async () => {
    given({ contacts: [contact()] });

    await renderPage();

    // the name also appears in the strategy section's contact picker, so scope to the list
    const contacts = within(
      screen.getByRole("heading", { name: "Contacts" }).closest("section") as HTMLElement,
    );
    expect(contacts.getByText("Sarah Miller")).toBeInTheDocument();
    expect(contacts.getByText("sarah@globex.example")).toBeInTheDocument();
    expect(contacts.queryByText("No contacts yet.")).not.toBeInTheDocument();
  });
});
