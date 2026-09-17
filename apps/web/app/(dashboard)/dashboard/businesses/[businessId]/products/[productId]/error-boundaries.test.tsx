// @vitest-environment jsdom
/**
 * Every tab under a product gets its own error boundary rather than sharing the product
 * one, so a failed AI call on (say) the ICP tab leaves the rest of the product shell
 * mounted. They are deliberately identical, and the thing worth pinning is that each one
 * really is wired to the shared BYOK notice and passes `reset` through — a boundary that
 * rendered nothing, or dropped reset, would strand the founder with no way to retry.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductError from "./error";
import ConversionsError from "./conversions/error";
import IcpError from "./icp/error";
import UsageError from "./usage/error";
import DiscoverError from "./prospects/discover/error";
import ProspectError from "./prospects/[prospectId]/error";

const BOUNDARIES: [string, typeof ProductError][] = [
  ["product", ProductError],
  ["conversions", ConversionsError],
  ["icp", IcpError],
  ["usage", UsageError],
  ["prospect discovery", DiscoverError],
  ["prospect detail", ProspectError],
];

afterEach(cleanup);

describe.each(BOUNDARIES)("%s error boundary", (_name, Boundary) => {
  it("surfaces the failure with the BYOK recovery options", () => {
    render(
      <Boundary
        error={new Error("Your Anthropic API key could not complete this request.")}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText(/API key could not complete this request/)).toBeInTheDocument();
    expect(screen.getByText("What you can do:")).toBeInTheDocument();
  });

  it("lets the founder retry through reset", async () => {
    const reset = vi.fn();
    render(<Boundary error={new Error("boom")} reset={reset} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
