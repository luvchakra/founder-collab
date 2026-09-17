// @vitest-environment jsdom
/**
 * The last-resort error boundary body. Its one piece of logic is conditional: the
 * BYOK "what you can do" list only appears when the message actually looks like a
 * provider failure — Next redacts a thrown error's message in production, so showing
 * provider advice for a generic digest would misdirect the founder.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiErrorNotice } from "./ai-error-notice";
import { AiErrorOptions } from "./ai-error-options";

afterEach(cleanup);

describe("AiErrorNotice", () => {
  it("shows the error's message and a retry control", () => {
    const reset = vi.fn();
    render(<AiErrorNotice error={new Error("Something specific failed")} reset={reset} />);

    expect(screen.getByText("Something specific failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("offers BYOK guidance for a provider-shaped failure", () => {
    render(
      <AiErrorNotice
        error={new Error("Your anthropic API key could not complete this request.")}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText("What you can do:")).toBeInTheDocument();
  });

  it("withholds that guidance for a generic production digest, which would misdirect", () => {
    render(
      <AiErrorNotice
        error={Object.assign(new Error("An error occurred in the Server Components render"), {
          digest: "123",
        })}
        reset={vi.fn()}
      />,
    );

    expect(screen.queryByText("What you can do:")).not.toBeInTheDocument();
  });
});

describe("AiErrorOptions", () => {
  it("links to the AI provider settings page, where the key is actually fixed", () => {
    render(<AiErrorOptions />);

    expect(screen.getByRole("link", { name: /AI Provider settings/ })).toHaveAttribute(
      "href",
      "/dashboard/settings/ai-provider",
    );
  });

  it("names all three supported providers", () => {
    render(<AiErrorOptions />);

    const text = screen.getByText(/connect a different provider/i).textContent ?? "";
    for (const provider of ["OpenAI", "Anthropic", "Google"]) {
      expect(text).toContain(provider);
    }
  });
});
