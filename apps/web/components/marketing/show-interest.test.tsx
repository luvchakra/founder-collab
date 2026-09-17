// @vitest-environment jsdom
/**
 * The modal is a hand-rolled dialog rather than a library one, so everything a dialog
 * owes the page is this component's own job and worth pinning: focus lands in the email
 * field, Escape and the backdrop both close it, and the body's scroll lock is *restored*
 * to whatever it was rather than blanked (the landing page sets no overflow of its own
 * today, but a future one would silently lose it).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  submitInterestAction: vi.fn(async (_prev: unknown, _formData: FormData): Promise<unknown> => null),
}));

vi.mock("@cofounderai/module-discovery/actions/interest", () => ({
  submitInterestAction: h.submitInterestAction,
}));

const { ShowInterestCta } = await import("./show-interest");

const openModal = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(screen.getByRole("button", { name: "Show Interest" }));
  return screen.getByRole("dialog");
};

beforeEach(() => {
  vi.resetAllMocks();
  h.submitInterestAction.mockResolvedValue({ success: true });
  document.body.style.overflow = "";
});

afterEach(cleanup);

describe("ShowInterestCta", () => {
  it("renders only the trigger until it is clicked", () => {
    render(<ShowInterestCta />);
    expect(screen.getByRole("button", { name: "Show Interest" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays a low-emphasis ghost button, and forwards extra classes", () => {
    render(<ShowInterestCta className="mt-4" />);
    const trigger = screen.getByRole("button", { name: "Show Interest" });
    expect(trigger).toHaveClass("mt-4");
    expect(trigger).not.toHaveClass("bg-landing-accent");
  });

  it("opens a labelled modal dialog with focus in the email field", async () => {
    const u = userEvent.setup();
    render(<ShowInterestCta />);

    const dialog = await openModal(u);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "show-interest-title");
    expect(screen.getByRole("heading", { name: "Interested in CoFounderAI?" })).toHaveAttribute(
      "id",
      "show-interest-title",
    );
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus());
  });

  it("locks body scroll while open and restores the page's own value on close", async () => {
    const u = userEvent.setup();
    document.body.style.overflow = "auto";
    render(<ShowInterestCta />);

    await openModal(u);
    expect(document.body.style.overflow).toBe("hidden");

    await u.click(screen.getByRole("button", { name: "Close" }));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("closes on Escape", async () => {
    const u = userEvent.setup();
    render(<ShowInterestCta />);
    await openModal(u);

    await u.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    const u = userEvent.setup();
    render(<ShowInterestCta />);
    const dialog = await openModal(u);
    const backdrop = dialog.parentElement!.querySelector('[aria-hidden="true"]')!;

    await u.click(backdrop);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits the email and confirms the signup", async () => {
    const u = userEvent.setup();
    render(<ShowInterestCta />);
    await openModal(u);

    await u.type(screen.getByLabelText("Email"), "founder@example.com");
    await u.click(screen.getByRole("button", { name: "Notify Me" }));

    await waitFor(() => expect(h.submitInterestAction).toHaveBeenCalledTimes(1));
    expect(h.submitInterestAction.mock.calls[0]![1].get("email")).toBe("founder@example.com");
    expect(await screen.findByText("You're on the list! 🎉")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("dismisses the confirmation from its own Close button", async () => {
    const u = userEvent.setup();
    render(<ShowInterestCta />);
    await openModal(u);
    await u.type(screen.getByLabelText("Email"), "founder@example.com");
    await u.click(screen.getByRole("button", { name: "Notify Me" }));
    await screen.findByText("You're on the list! 🎉");

    // two buttons are named "Close" here: the corner X (icon only) and the wide one
    const wideClose = screen
      .getAllByRole("button", { name: "Close" })
      .find((button) => button.textContent === "Close")!;
    await u.click(wideClose);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables the submit button while the signup is in flight", async () => {
    const u = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    h.submitInterestAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<ShowInterestCta />);
    await openModal(u);
    await u.type(screen.getByLabelText("Email"), "founder@example.com");
    await u.click(screen.getByRole("button", { name: "Notify Me" }));

    const submitting = await screen.findByRole("button", { name: "Submitting…" });
    expect(submitting).toBeDisabled();

    release({ success: true });
    await screen.findByText("You're on the list! 🎉");
  });

  it("keeps the form open and marks the field invalid when the action rejects the email", async () => {
    const u = userEvent.setup();
    h.submitInterestAction.mockResolvedValue({ error: "Enter a valid email address." });
    render(<ShowInterestCta />);
    await openModal(u);
    await u.type(screen.getByLabelText("Email"), "founder@example.com");
    await u.click(screen.getByRole("button", { name: "Notify Me" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Notify Me" })).toBeEnabled();
  });
});
