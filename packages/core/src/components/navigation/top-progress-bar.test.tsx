// @vitest-environment jsdom
/**
 * The App Router has no "navigation started" event, so this infers one from anchor
 * clicks. Every early return in that handler is a case where showing a progress bar would
 * be wrong — a new tab, a download, an in-page anchor, a modified click — and each leaves
 * a bar stuck on screen if it regresses, so they are enumerated here.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname, useSearchParams } = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/dashboard"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock("next/navigation", () => ({ usePathname, useSearchParams }));

const { TopProgressBar } = await import("./top-progress-bar");

/** Renders the bar plus an anchor to click, and reports whether the bar is showing. */
function setup(attrs: Record<string, string> = { href: "/elsewhere" }) {
  const view = render(
    <div>
      <TopProgressBar />
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a data-testid="link" {...attrs}>
        go
      </a>
    </div>,
  );
  return {
    ...view,
    link: () => view.getByTestId("link"),
    visible: () => view.container.querySelector('[aria-hidden="true"].fixed') !== null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathname.mockReturnValue("/dashboard");
  useSearchParams.mockReturnValue(new URLSearchParams());
  window.history.replaceState({}, "", "/dashboard");
});

afterEach(cleanup);

describe("TopProgressBar", () => {
  it("renders nothing while idle", () => {
    const { visible } = setup();

    expect(visible()).toBe(false);
  });

  it("shows on a plain click to a different same-origin path", () => {
    const { link, visible } = setup();

    fireEvent.click(link(), { button: 0 });

    expect(visible()).toBe(true);
  });

  it("shows for a same-path navigation that changes the query string", () => {
    const { link, visible } = setup({ href: "/dashboard?tab=usage" });

    fireEvent.click(link(), { button: 0 });

    expect(visible()).toBe(true);
  });

  it("triggers from a click on a child element inside the anchor", () => {
    const view = render(
      <div>
        <TopProgressBar />
        <a href="/elsewhere">
          <span data-testid="child">go</span>
        </a>
      </div>,
    );

    fireEvent.click(view.getByTestId("child"), { button: 0 });

    expect(view.container.querySelector('[aria-hidden="true"].fixed')).not.toBeNull();
  });

  it.each([
    ["a middle click", { button: 1 }],
    ["a meta-click (new tab)", { button: 0, metaKey: true }],
    ["a ctrl-click", { button: 0, ctrlKey: true }],
    ["a shift-click", { button: 0, shiftKey: true }],
    ["an alt-click", { button: 0, altKey: true }],
  ])("ignores %s", (_label, init) => {
    const { link, visible } = setup();

    fireEvent.click(link(), init);

    expect(visible()).toBe(false);
  });

  it.each([
    ["a new-tab anchor", { href: "/elsewhere", target: "_blank" }],
    ["a download link", { href: "/file.pdf", download: "" }],
    ["an in-page anchor", { href: "#section" }],
    ["a mailto link", { href: "mailto:a@b.com" }],
    ["a tel link", { href: "tel:+911234" }],
    ["an off-origin link", { href: "https://example.com/x" }],
    ["a link to the current path and query", { href: "/dashboard" }],
    // an href the URL parser rejects outright: better to do nothing than to throw inside
    // a global click listener and break every later navigation
    ["a malformed href", { href: "http://[" }],
  ])("ignores %s", (_label, attrs) => {
    const { link, visible } = setup(attrs);

    fireEvent.click(link(), { button: 0 });

    expect(visible()).toBe(false);
  });

  it("ignores an anchor with no href at all", () => {
    const view = render(
      <div>
        <TopProgressBar />
        <a data-testid="link">go</a>
      </div>,
    );

    fireEvent.click(view.getByTestId("link"), { button: 0 });

    expect(view.container.querySelector('[aria-hidden="true"].fixed')).toBeNull();
  });

  it("ignores a click on something that is not a link", () => {
    const view = render(
      <div>
        <TopProgressBar />
        <button data-testid="btn">go</button>
      </div>,
    );

    fireEvent.click(view.getByTestId("btn"), { button: 0 });

    expect(view.container.querySelector('[aria-hidden="true"].fixed')).toBeNull();
  });

  it("ignores a click another handler already prevented", () => {
    const view = render(
      <div>
        <TopProgressBar />
        <a data-testid="link" href="/elsewhere" onClick={(e) => e.preventDefault()}>
          go
        </a>
      </div>,
    );

    fireEvent.click(view.getByTestId("link"), { button: 0 });

    expect(view.container.querySelector('[aria-hidden="true"].fixed')).toBeNull();
  });

  it("clears once the navigation completes and the settle delay elapses", () => {
    vi.useFakeTimers();
    try {
      const { link, visible, rerender } = setup();
      fireEvent.click(link(), { button: 0 });
      expect(visible()).toBe(true);

      usePathname.mockReturnValue("/elsewhere");
      rerender(
        <div>
          <TopProgressBar />
          <a data-testid="link" href="/elsewhere">
            go
          </a>
        </div>,
      );
      act(() => void vi.advanceTimersByTime(250));

      expect(visible()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops listening once unmounted, leaving no bar behind", () => {
    const { link, unmount } = setup();
    const anchor = link(); // captured before unmount detaches it from the container
    unmount();

    fireEvent.click(anchor, { button: 0 });

    expect(document.querySelector('[aria-hidden="true"].fixed')).toBeNull();
  });
});
