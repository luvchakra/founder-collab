// @vitest-environment jsdom
/**
 * The whole point of this component is that it animates *on scroll* and not at all for
 * prefers-reduced-motion — so the two things worth testing are that a reduced-motion
 * visitor never gets the observer (nor the layout-shifting translate), and that everyone
 * else starts hidden and is revealed exactly once, with the observer released afterwards.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

const observers: { callback: ObserverCallback; observed: Element[]; disconnected: boolean }[] = [];

class FakeIntersectionObserver {
  private readonly record;
  constructor(callback: ObserverCallback) {
    this.record = { callback, observed: [] as Element[], disconnected: false };
    observers.push(this.record);
  }
  observe(node: Element) {
    this.record.observed.push(node);
  }
  disconnect() {
    this.record.disconnected = true;
  }
  unobserve() {}
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

const scrollIntoView = () =>
  act(() => {
    observers[0]!.callback([{ isIntersecting: true }]);
  });

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FadeIn", () => {
  it("renders its children hidden, watching for them to scroll into view", async () => {
    const { FadeIn } = await import("./fade-in");
    render(
      <FadeIn>
        <p>Benefit</p>
      </FadeIn>,
    );

    const wrapper = screen.getByText("Benefit").parentElement!;
    expect(wrapper).toHaveClass("opacity-0", "translate-y-4");
    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed[0]).toBe(wrapper);
  });

  it("reveals once on intersection and stops observing", async () => {
    const { FadeIn } = await import("./fade-in");
    render(
      <FadeIn>
        <p>Benefit</p>
      </FadeIn>,
    );

    scrollIntoView();

    const wrapper = screen.getByText("Benefit").parentElement!;
    expect(wrapper).toHaveClass("opacity-100", "translate-y-0");
    expect(observers[0]!.disconnected).toBe(true);
  });

  it("stays hidden while the element is still below the fold", async () => {
    const { FadeIn } = await import("./fade-in");
    render(
      <FadeIn>
        <p>Benefit</p>
      </FadeIn>,
    );

    act(() => {
      observers[0]!.callback([{ isIntersecting: false }]);
    });

    expect(screen.getByText("Benefit").parentElement).toHaveClass("opacity-0");
    expect(observers[0]!.disconnected).toBe(false);
  });

  it("applies the stagger delay only once visible, so a hidden card isn't pre-delayed", async () => {
    const { FadeIn } = await import("./fade-in");
    render(
      <FadeIn delayMs={200}>
        <p>Benefit</p>
      </FadeIn>,
    );
    const wrapper = screen.getByText("Benefit").parentElement!;
    expect(wrapper).toHaveStyle({ transitionDelay: "0ms" });

    scrollIntoView();

    expect(wrapper).toHaveStyle({ transitionDelay: "200ms" });
  });

  it("merges caller classes onto the wrapper", async () => {
    const { FadeIn } = await import("./fade-in");
    render(
      <FadeIn className="mt-12">
        <p>Benefit</p>
      </FadeIn>,
    );
    expect(screen.getByText("Benefit").parentElement).toHaveClass("mt-12");
  });

  it("renders visible with no observer at all for prefers-reduced-motion", async () => {
    setReducedMotion(true);
    vi.resetModules();
    const { FadeIn } = await import("./fade-in");
    render(
      <FadeIn>
        <p>Benefit</p>
      </FadeIn>,
    );

    expect(screen.getByText("Benefit").parentElement).toHaveClass("opacity-100");
    expect(observers).toHaveLength(0);
  });

  it("releases the observer when unmounted before it ever fires", async () => {
    const { FadeIn } = await import("./fade-in");
    const { unmount } = render(
      <FadeIn>
        <p>Benefit</p>
      </FadeIn>,
    );

    unmount();

    expect(observers[0]!.disconnected).toBe(true);
  });
});
