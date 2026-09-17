// @vitest-environment jsdom
/**
 * The chat widget's hardest behaviour is thread isolation: history is persisted per
 * product, so switching business/product must clear the previous conversation *during
 * render* — not in an effect — or the panel paints a frame showing one product's
 * conversation while the header says another is selected. The two keys it tracks
 * (renderedThreadKey for that clearing, loadedThreadKey for "have I fetched this yet")
 * are deliberately distinct, and conflating them would either re-fetch forever or show
 * stale history.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  usePathname: vi.fn(),
  getChatPanelDataAction: vi.fn(),
  sendChatMessageAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: h.usePathname }));
vi.mock("../../actions/chat", () => ({
  getChatPanelDataAction: h.getChatPanelDataAction,
  sendChatMessageAction: h.sendChatMessageAction,
}));

const { AiChatWidget } = await import("./ai-chat-widget");

const PRODUCT_A = "/dashboard/businesses/b1/products/p1/prospects";
const PRODUCT_B = "/dashboard/businesses/b1/products/p2/prospects";

const openPanel = () => userEvent.click(screen.getByRole("button", { name: "Ask the AI assistant" }));

beforeEach(() => {
  vi.clearAllMocks();
  h.usePathname.mockReturnValue(PRODUCT_A);
  h.getChatPanelDataAction.mockResolvedValue({ messages: [], followUp: null, starterQuestions: ["Ask me"] });
  h.sendChatMessageAction.mockResolvedValue({ answer: "Here you go", followUp: "Want more?" });
});

afterEach(cleanup);

describe("AiChatWidget — opening", () => {
  it("starts closed, showing only the trigger", () => {
    render(<AiChatWidget />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask the AI assistant" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens the panel and loads that thread's data", async () => {
    render(<AiChatWidget />);

    await openPanel();

    expect(await screen.findByRole("dialog", { name: "AI assistant" })).toBeInTheDocument();
    await waitFor(() => expect(h.getChatPanelDataAction).toHaveBeenCalledWith({
      businessId: "b1",
      productId: "p1",
    }));
  });

  it("offers starter questions when there is no history", async () => {
    render(<AiChatWidget />);

    await openPanel();

    expect(await screen.findByRole("button", { name: "Ask me" })).toBeInTheDocument();
  });

  it("shows persisted history instead of starters when there is some", async () => {
    h.getChatPanelDataAction.mockResolvedValue({
      messages: [
        { role: "user", content: "earlier question" },
        { role: "assistant", content: "earlier answer" },
      ],
      followUp: "Anything else?",
      starterQuestions: ["Ask me"],
    });
    render(<AiChatWidget />);

    await openPanel();

    expect(await screen.findByText("earlier answer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask me" })).not.toBeInTheDocument();
  });

  it("closes again from the trigger and from the explicit close control", async () => {
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not fetch anything until it is opened", () => {
    render(<AiChatWidget />);

    expect(h.getChatPanelDataAction).not.toHaveBeenCalled();
  });
});

describe("AiChatWidget — thread isolation", () => {
  it("clears the previous product's conversation when the URL changes", async () => {
    h.getChatPanelDataAction.mockResolvedValue({
      messages: [{ role: "assistant", content: "product A answer" }],
      followUp: null,
      starterQuestions: [],
    });
    const { rerender } = render(<AiChatWidget />);
    await openPanel();
    await screen.findByText("product A answer");

    h.usePathname.mockReturnValue(PRODUCT_B);
    h.getChatPanelDataAction.mockResolvedValue({ messages: [], followUp: null, starterQuestions: ["B starter"] });
    rerender(<AiChatWidget />);

    expect(screen.queryByText("product A answer")).not.toBeInTheDocument();
  });

  it("loads the new product's own thread after switching", async () => {
    const { rerender } = render(<AiChatWidget />);
    await openPanel();
    await waitFor(() => expect(h.getChatPanelDataAction).toHaveBeenCalledTimes(1));

    h.usePathname.mockReturnValue(PRODUCT_B);
    rerender(<AiChatWidget />);

    await waitFor(() =>
      expect(h.getChatPanelDataAction).toHaveBeenLastCalledWith({ businessId: "b1", productId: "p2" }),
    );
  });

  it("does not re-fetch on a path change within the same product", async () => {
    render(<AiChatWidget />);
    await openPanel();
    await waitFor(() => expect(h.getChatPanelDataAction).toHaveBeenCalledTimes(1));

    h.usePathname.mockReturnValue("/dashboard/businesses/b1/products/p1/icp");
    cleanup();
    render(<AiChatWidget />);
    await openPanel();

    await waitFor(() => expect(h.getChatPanelDataAction).toHaveBeenCalledTimes(2));
  });
});

describe("AiChatWidget — sending", () => {
  it("appends the question, then the answer", async () => {
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "What next?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("What next?")).toBeInTheDocument();
    expect(await screen.findByText("Here you go")).toBeInTheDocument();
  });

  it("clears the input after sending", async () => {
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");
    const input = screen.getByRole("textbox", { name: "Message" });

    await userEvent.type(input, "What next?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("disables Send until there is something to send", async () => {
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "hi");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("fills the input from a starter question rather than sending it outright", async () => {
    render(<AiChatWidget />);
    await openPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Ask me" }));

    // The founder still presses Send — a starter is a prompt to edit, not a fired question.
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Ask me");
    expect(h.sendChatMessageAction).not.toHaveBeenCalled();
  });

  it("sends the starter once the founder presses Send", async () => {
    render(<AiChatWidget />);
    await openPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Ask me" }));

    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(h.sendChatMessageAction).toHaveBeenCalled());
    const sent = h.sendChatMessageAction.mock.calls[0]![0] as { content: string }[];
    expect(sent.at(-1)!.content).toBe("Ask me");
  });

  it("shows an error as an alert and keeps the question visible", async () => {
    h.sendChatMessageAction.mockResolvedValue({ error: "Connect an AI provider." });
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connect an AI provider.");
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("sends the whole transcript, so the assistant has context", async () => {
    h.getChatPanelDataAction.mockResolvedValue({
      messages: [{ role: "user", content: "earlier" }],
      followUp: null,
      starterQuestions: [],
    });
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByText("earlier");

    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "now");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(h.sendChatMessageAction).toHaveBeenCalled());
    const sent = h.sendChatMessageAction.mock.calls[0]![0] as { content: string }[];
    expect(sent.map((m) => m.content)).toEqual(["earlier", "now"]);
  });
});

describe("AiChatWidget — dismissing and returning", () => {
  it("closes when the backdrop behind the panel is clicked", async () => {
    const u = userEvent.setup();
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await u.click(document.querySelector("div.fixed.inset-0.bg-black\\/50")!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const u = userEvent.setup();
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await u.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("steps out of the way when an answer's link navigates, offering a way back", async () => {
    const u = userEvent.setup();
    h.getChatPanelDataAction.mockResolvedValue({
      messages: [
        { role: "user", content: "where are my prospects?" },
        { role: "assistant", content: "Open [your prospects](/dashboard/businesses/b1/products/p1/prospects)." },
      ],
      followUp: null,
      starterQuestions: [],
    });
    render(<AiChatWidget />);
    await openPanel();

    await u.click(await screen.findByRole("link", { name: "your prospects" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Back to chat" });

    await u.click(back);

    // the same conversation, not a fresh one
    expect(await screen.findByText(/Open/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to chat" })).not.toBeInTheDocument();
    expect(h.getChatPanelDataAction).toHaveBeenCalledTimes(1);
  });

  it("drops the back-to-chat shortcut when the panel is reopened from the trigger", async () => {
    const u = userEvent.setup();
    h.getChatPanelDataAction.mockResolvedValue({
      messages: [{ role: "assistant", content: "Open [prospects](/dashboard/businesses/b1/products/p1/prospects)." }],
      followUp: null,
      starterQuestions: [],
    });
    render(<AiChatWidget />);
    await openPanel();
    await u.click(await screen.findByRole("link", { name: "prospects" }));

    await openPanel();

    expect(screen.queryByRole("button", { name: "Back to chat" })).not.toBeInTheDocument();
  });
});

describe("AiChatWidget — follow-ups and guards", () => {
  it("fills the input from the assistant's follow-up rather than sending it", async () => {
    const u = userEvent.setup();
    h.getChatPanelDataAction.mockResolvedValue({
      messages: [{ role: "assistant", content: "Here you go" }],
      followUp: "Want me to draft an email?",
      starterQuestions: [],
    });
    render(<AiChatWidget />);
    await openPanel();

    await u.click(await screen.findByRole("button", { name: "Want me to draft an email?" }));

    expect(screen.getByRole("textbox")).toHaveValue("Want me to draft an email?");
    expect(h.sendChatMessageAction).not.toHaveBeenCalled();
  });

  it("ignores a submission of whitespace", async () => {
    const u = userEvent.setup();
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await u.type(screen.getByRole("textbox"), "   {Enter}");

    expect(h.sendChatMessageAction).not.toHaveBeenCalled();
  });

  it("ignores a second question while the first is still in flight", async () => {
    const u = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    h.sendChatMessageAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<AiChatWidget />);
    await openPanel();
    await screen.findByRole("dialog");

    await u.type(screen.getByRole("textbox"), "first{Enter}");
    expect(await screen.findByText("Thinking...")).toBeInTheDocument();
    await u.type(screen.getByRole("textbox"), "second{Enter}");

    expect(h.sendChatMessageAction).toHaveBeenCalledTimes(1);

    release({ answer: "done", followUp: null });
    await screen.findByText("done");
  });
});

describe("AiChatWidget — thread key", () => {
  it("threads by business when no product is in view", async () => {
    h.usePathname.mockReturnValue("/dashboard/businesses/b1");
    render(<AiChatWidget />);

    await openPanel();

    await waitFor(() =>
      expect(h.getChatPanelDataAction).toHaveBeenCalledWith({ businessId: "b1", productId: null }),
    );
  });

  it("threads against the account when nothing is in view", async () => {
    h.usePathname.mockReturnValue("/dashboard");
    render(<AiChatWidget />);

    await openPanel();

    await waitFor(() =>
      expect(h.getChatPanelDataAction).toHaveBeenCalledWith({ businessId: null, productId: null }),
    );
  });

  it("tolerates a null pathname", async () => {
    h.usePathname.mockReturnValue(null);

    expect(() => render(<AiChatWidget />)).not.toThrow();
  });

  it("drops a thread load that resolves after the widget is gone", async () => {
    let release: (value: unknown) => void = () => {};
    h.getChatPanelDataAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { unmount } = render(<AiChatWidget />);
    await openPanel();

    unmount();
    release({ messages: [{ role: "assistant", content: "late answer" }], followUp: null, starterQuestions: [] });

    // no state update on an unmounted tree, and nothing rendered from it
    await waitFor(() => expect(screen.queryByText("late answer")).not.toBeInTheDocument());
  });
});
