// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeSourceCard } from "./knowledge-source-card";

afterEach(cleanup);

function setup(result: unknown = { success: true }) {
  const updateAction = vi.fn().mockResolvedValue(result);
  const deleteAction = vi.fn().mockResolvedValue(undefined);
  render(
    <KnowledgeSourceCard
      sourceName="spec.pdf"
      sourceType="document"
      content="The product forecasts stock."
      updateAction={updateAction}
      deleteAction={deleteAction}
    />,
  );
  return { updateAction, deleteAction };
}

describe("KnowledgeSourceCard", () => {
  it("shows the source name with its type, and the content", () => {
    setup();

    expect(screen.getByText(/spec\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("(document)")).toBeInTheDocument();
    expect(screen.getByText("The product forecasts stock.")).toBeInTheDocument();
  });

  it("offers edit and delete controls", () => {
    setup();

    expect(screen.getByRole("button", { name: "Edit source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete source" })).toBeInTheDocument();
  });

  it("opens an editor prefilled with the content", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));

    expect(screen.getByRole("textbox")).toHaveValue("The product forecasts stock.");
  });

  it("relabels the edit control while editing, so the toggle reads correctly", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));

    expect(screen.getByRole("button", { name: "Cancel edit" })).toBeInTheDocument();
  });

  it("submits the edited content as `value`", async () => {
    const { updateAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Updated text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAction).toHaveBeenCalled());
    expect((updateAction.mock.calls[0]![1] as FormData).get("value")).toBe("Updated text");
  });

  it("closes the editor once the save succeeds", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("stays open on failure, showing the reason", async () => {
    setup({ error: "Content is required." });
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Content is required.");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("cancels without saving", async () => {
    const { updateAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(updateAction).not.toHaveBeenCalled();
  });

  it("submits the delete form", async () => {
    const { deleteAction } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Delete source" }));

    await waitFor(() => expect(deleteAction).toHaveBeenCalled());
  });

  it("expands and re-collapses a long source's content", async () => {
    const u = userEvent.setup();
    setup();
    const content = "The product forecasts stock.";

    expect(screen.getByText(content)).toHaveClass("line-clamp-3");

    await u.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(content)).not.toHaveClass("line-clamp-3");

    await u.click(screen.getByRole("button", { expanded: true }));
    expect(screen.getByText(content)).toHaveClass("line-clamp-3");
  });
});
