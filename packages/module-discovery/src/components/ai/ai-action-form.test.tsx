// @vitest-environment jsdom
/**
 * AiActionForm exists so an AI failure shows its real message instead of Next's
 * production-redacted generic error. Its contract with the caller is that the action
 * returns state rather than throwing — a thrown error would reach the route's error.tsx
 * and lose its message, defeating the whole component.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiActionForm } from "./ai-action-form";

afterEach(cleanup);

describe("AiActionForm", () => {
  it("renders its button and runs the action on submit", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(<AiActionForm action={action} buttonLabel="Generate" pendingText="Generating..." />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("shows nothing extra when the action succeeds", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(<AiActionForm action={action} buttonLabel="Generate" pendingText="..." />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a returned error inline, as an alert", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Approve an ICP first." });
    render(<AiActionForm action={action} buttonLabel="Generate" pendingText="..." />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Approve an ICP first.");
  });

  it("adds BYOK guidance only for a provider-shaped failure", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ error: "Your openai API key could not complete this request." });
    render(<AiActionForm action={action} buttonLabel="Generate" pendingText="..." />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("What you can do:")).toBeInTheDocument();
  });

  it("withholds BYOK guidance for an ordinary validation failure", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Approve an ICP first." });
    render(<AiActionForm action={action} buttonLabel="Generate" pendingText="..." />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    await screen.findByRole("alert");
    expect(screen.queryByText("What you can do:")).not.toBeInTheDocument();
  });

  it("renders extra form fields before the button, so they submit with it", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <AiActionForm action={action} buttonLabel="Generate" pendingText="...">
        <input name="force" defaultValue="true" readOnly />
      </AiActionForm>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0]![1] as FormData;
    expect(formData.get("force")).toBe("true");
  });
});
