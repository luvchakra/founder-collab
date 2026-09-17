// @vitest-environment jsdom
/**
 * The inline edit control. Its subtle part is exiting edit mode: that happens by
 * comparing against the previous action state during render rather than in an effect
 * (React's own guidance on avoiding a setState-in-effect cascade), so the tests cover
 * both outcomes — a success closes the editor, an error keeps it open with the reason
 * visible, which is the difference between losing the founder's typing and not.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableText } from "./editable-text";

afterEach(cleanup);

function setup(props: Partial<Parameters<typeof EditableText>[0]> = {}) {
  const action = vi.fn().mockResolvedValue({ success: true });
  render(
    <EditableText value="About us" action={action} placeholder="Add a description" {...props} />,
  );
  return { action };
}

describe("EditableText — collapsed", () => {
  it("shows the value with an edit affordance, not a form", () => {
    setup();

    expect(screen.getByText("About us")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows the placeholder, muted, when there is no value", () => {
    setup({ value: null });

    const text = screen.getByText("Add a description");
    expect(text.classList.contains("italic")).toBe(true);
  });

  it("labels the edit button with the placeholder when empty, so it reads meaningfully", () => {
    setup({ value: null });

    expect(screen.getByRole("button", { name: "Add a description" })).toBeInTheDocument();
  });
});

describe("EditableText — editing", () => {
  it("opens an input prefilled with the current value", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox")).toHaveValue("About us");
  });

  it("opens an empty input when there is no value", async () => {
    setup({ value: null });

    await userEvent.click(screen.getByRole("button", { name: "Add a description" }));

    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("submits the field as `value`", async () => {
    const { action } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "New text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![1] as FormData).get("value")).toBe("New text");
  });

  it("closes the editor once the save succeeds", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("keeps the editor open on failure, showing the reason", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Name is required." });
    render(<EditableText value="x" action={action} placeholder="p" />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required.");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("cancels back to the collapsed view without saving", async () => {
    const { action } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("renders a textarea when the field is multiline", async () => {
    setup({ multiline: true });

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  it("renders a single-line input by default", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox").tagName).toBe("INPUT");
  });
});
