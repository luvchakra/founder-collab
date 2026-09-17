// @vitest-environment jsdom
/**
 * Markdown-lite for chat answers: **bold** and [text](url) only, because the model's
 * output is deliberately constrained to that subset. The distinction that carries weight
 * is internal versus external links — an internal portal path routes through next/link
 * and closes the chat panel, an external one opens in a new tab with noopener.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "./chat-markdown";

afterEach(cleanup);

describe("ChatMarkdown", () => {
  it("renders plain text as a paragraph", () => {
    render(<ChatMarkdown text="Just some text" />);

    expect(screen.getByText("Just some text")).toBeInTheDocument();
  });

  it("splits on blank lines into separate paragraphs", () => {
    // Braces, not a plain attribute string: JSX attribute strings do not process escapes,
    // so text="a\n\nb" would pass a literal backslash-n rather than a blank line.
    const { container } = render(<ChatMarkdown text={"First para\n\nSecond para"} />);

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("drops empty blocks rather than emitting empty paragraphs", () => {
    const { container } = render(<ChatMarkdown text={"One\n\n\n\n   \n\nTwo"} />);

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("renders **bold** as strong", () => {
    render(<ChatMarkdown text="A **bold** word" />);

    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("keeps the text around a match untouched", () => {
    const { container } = render(<ChatMarkdown text="before **mid** after" />);

    expect(container.textContent).toBe("before mid after");
  });

  it("routes an internal path through next/link", () => {
    render(<ChatMarkdown text="See [your ICP](/dashboard/businesses/b1/products/p1/icp)" />);

    const link = screen.getByRole("link", { name: "your ICP" });
    expect(link).toHaveAttribute("href", "/dashboard/businesses/b1/products/p1/icp");
    expect(link).not.toHaveAttribute("target");
  });

  it("opens an external link in a new tab, with noopener", () => {
    render(<ChatMarkdown text="Source: [example](https://example.com/a)" />);

    const link = screen.getByRole("link", { name: "example" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("fires the callback for an internal link only", () => {
    const onInternalLinkClick = vi.fn();
    render(
      <ChatMarkdown
        text="[inside](/dashboard) and [outside](https://example.com)"
        onInternalLinkClick={onInternalLinkClick}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "outside" }));
    expect(onInternalLinkClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "inside" }));
    expect(onInternalLinkClick).toHaveBeenCalledOnce();
  });

  it("handles several matches in one paragraph, in order", () => {
    const { container } = render(<ChatMarkdown text="**one** then [two](/x) then **three**" />);

    expect(container.textContent).toBe("one then two then three");
    expect(screen.getAllByText(/one|three/).every((el) => el.tagName === "STRONG")).toBe(true);
  });

  it("leaves an unmatched marker as literal text", () => {
    const { container } = render(<ChatMarkdown text="**unclosed and [broken](" />);

    expect(container.textContent).toBe("**unclosed and [broken](");
  });

  it("renders nothing for empty input rather than an empty paragraph", () => {
    const { container } = render(<ChatMarkdown text="   " />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("resets its regex between renders, so a second call is not offset by the first", () => {
    render(<ChatMarkdown text="**a**" />);
    cleanup();
    render(<ChatMarkdown text="**a**" />);

    expect(screen.getByText("a").tagName).toBe("STRONG");
  });
});
