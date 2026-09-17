// @vitest-environment jsdom
/**
 * The create-business modal. Being a modal, the things that break invisibly are its
 * dismissal paths and the body scroll lock — a lock that is not restored on unmount
 * leaves the whole app unscrollable after the modal closes.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateBusinessModal } from "./create-business-modal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function setup() {
  const action = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const view = render(<CreateBusinessModal action={action} onClose={onClose} />);
  return { action, onClose, ...view };
}

describe("CreateBusinessModal", () => {
  it("renders a name field and a submit control", () => {
    setup();

    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
  });

  it("focuses the first field so the founder can type immediately", async () => {
    setup();

    await waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
  });

  it("closes on Escape", () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click", () => {
    const { onClose, container } = setup();

    fireEvent.click(container.querySelector(".absolute.inset-0")!);

    expect(onClose).toHaveBeenCalled();
  });

  it("locks body scroll while open", () => {
    setup();

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll on unmount, rather than leaving the app unscrollable", () => {
    document.body.style.overflow = "auto";
    const { unmount } = setup();

    unmount();

    expect(document.body.style.overflow).toBe("auto");
  });

  it("stops listening for Escape once unmounted", () => {
    const { onClose, unmount } = setup();
    unmount();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("submits the entered name to the bound action", async () => {
    const { action } = setup();
    const input = screen.getAllByRole("textbox")[0]!;

    await userEvent.type(input, "New Co");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![0] as FormData).get("name")).toBe("New Co");
  });
});
