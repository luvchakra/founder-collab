// @vitest-environment jsdom
/**
 * The dashboard's error boundary exists so a failed AI call surfaces as the BYOK recovery
 * notice rather than Next's default error screen — and so `reset` stays wired to the
 * retry button.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardError from "./error";

afterEach(cleanup);

describe("DashboardError", () => {
  it("shows the AI failure's own message with the recovery options", () => {
    render(
      <DashboardError
        error={Object.assign(new Error("Your Anthropic API key could not complete this request."), {
          digest: "abc123",
        })}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText(/API key could not complete this request/)).toBeInTheDocument();
    expect(screen.getByText("What you can do:")).toBeInTheDocument();
  });

  it("retries through the boundary's own reset", async () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error("boom")} reset={reset} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
