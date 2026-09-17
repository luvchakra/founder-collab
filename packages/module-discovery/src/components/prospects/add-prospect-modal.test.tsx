// @vitest-environment jsdom
/**
 * Shares CreateBusinessModal's chrome, so the tests here concentrate on what differs: the
 * dialog semantics, the field set, and the fact that there is deliberately no
 * close-on-success path — the action redirects, so the page navigates away instead.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddProspectModal } from "./add-prospect-modal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function setup() {
  const action = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const view = render(<AddProspectModal action={action} onClose={onClose} />);
  return { action, onClose, ...view };
}

describe("AddProspectModal", () => {
  it("renders as a labelled modal dialog", () => {
    setup();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Add a prospect" })).toBeInTheDocument();
  });

  it("requires only the company name", () => {
    setup();

    expect(screen.getByLabelText("Company name")).toBeRequired();
    expect(screen.getByLabelText("Website")).not.toBeRequired();
    expect(screen.getByLabelText("Industry")).not.toBeRequired();
  });

  it("keeps the website field a plain text input, so a bare domain is accepted", () => {
    setup();

    expect(screen.getByLabelText("Website")).toHaveAttribute("type", "text");
  });

  it("focuses the company name so the founder can type immediately", async () => {
    setup();

    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Company name")));
  });

  it("closes from the explicit close control", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape and on a backdrop click", () => {
    const { onClose, container } = setup();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('[aria-hidden="true"].absolute')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("locks body scroll and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = setup();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("auto");
  });

  it("submits the entered fields to the bound action", async () => {
    const { action } = setup();

    await userEvent.type(screen.getByLabelText("Company name"), "Acme Ltd");
    await userEvent.type(screen.getByLabelText("Website"), "acme.com");
    await userEvent.click(screen.getByRole("button", { name: /add prospect/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0]![0] as FormData;
    expect(formData.get("companyName")).toBe("Acme Ltd");
    expect(formData.get("website")).toBe("acme.com");
  });

  it("does not close itself on success — the action redirects instead", async () => {
    const { action, onClose } = setup();

    await userEvent.type(screen.getByLabelText("Company name"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: /add prospect/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
