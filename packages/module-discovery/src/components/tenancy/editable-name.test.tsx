// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableName } from "./editable-name";

afterEach(cleanup);

function setup(result: unknown = { success: true }, name = "Acme Co") {
  const action = vi.fn().mockResolvedValue(result);
  render(<EditableName name={name} action={action} headingClassName="text-2xl" />);
  return { action };
}

describe("EditableName", () => {
  it("renders the name as a heading with a rename affordance", () => {
    setup();

    expect(screen.getByRole("heading", { name: "Acme Co" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Acme Co" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("applies the caller's heading class, so each page controls its own size", () => {
    setup();

    expect(screen.getByRole("heading").classList.contains("text-2xl")).toBe(true);
  });

  it("opens an input prefilled with the current name", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Rename Acme Co" }));

    expect(screen.getByRole("textbox")).toHaveValue("Acme Co");
  });

  it("submits the field as `name`", async () => {
    const { action } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Acme Co" }));

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Renamed Co");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![1] as FormData).get("name")).toBe("Renamed Co");
  });

  it("closes on success — the fresh name arrives through the prop", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Acme Co" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("stays open on failure, showing the reason rather than discarding the typing", async () => {
    setup({ error: "Name is required." });
    await userEvent.click(screen.getByRole("button", { name: "Rename Acme Co" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required.");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("cancels without saving", async () => {
    const { action } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Acme Co" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
