// @vitest-environment jsdom
/**
 * A count-up that only starts when the number is actually on screen, and never runs at
 * all for prefers-reduced-motion. The animation is driven by performance.now() deltas
 * rather than a frame counter, so the test drives both clocks by hand: real frame timing
 * would make "does it stop at the target" a race.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

const observers: { callback: ObserverCallback; options: unknown; disconnected: boolean }[] = [];
let frames: FrameRequestCallback[] = [];

class FakeIntersectionObserver {
  private readonly record;
  constructor(callback: ObserverCallback, options: unknown) {
    this.record = { callback, options, disconnected: false };
    observers.push(this.record);
  }
  observe() {}
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

/** Runs every frame scheduled so far, as if the clock now read `now` ms. */
function paint(now: number) {
  const pending = frames;
  frames = [];
  act(() => {
    for (const frame of pending) frame(now);
  });
}

beforeEach(() => {
  observers.length = 0;
  frames = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.spyOn(performance, "now").mockReturnValue(1000);
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AnimatedScore", () => {
  it("shows zero until the score scrolls into view", async () => {
    const { AnimatedScore } = await import("./animated-score");
    render(<AnimatedScore target={92} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(frames).toHaveLength(0);
  });

  it("counts up to the target once visible, then stops scheduling frames", async () => {
    const { AnimatedScore } = await import("./animated-score");
    render(<AnimatedScore target={100} durationMs={900} />);

    act(() => observers[0]!.callback([{ isIntersecting: true }]));
    paint(1000);
    expect(screen.getByText("0")).toBeInTheDocument();

    paint(1450);
    expect(screen.getByText("50")).toBeInTheDocument();

    paint(1900);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(frames).toHaveLength(0);
  });

  it("clamps a late frame to the target rather than overshooting", async () => {
    const { AnimatedScore } = await import("./animated-score");
    render(<AnimatedScore target={92} durationMs={900} />);

    act(() => observers[0]!.callback([{ isIntersecting: true }]));
    paint(1000);
    paint(9999);

    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("does nothing while the score is still off screen", async () => {
    const { AnimatedScore } = await import("./animated-score");
    render(<AnimatedScore target={92} />);

    act(() => observers[0]!.callback([{ isIntersecting: false }]));

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(frames).toHaveLength(0);
    expect(observers[0]!.disconnected).toBe(false);
  });

  it("stops observing as soon as it has started animating", async () => {
    const { AnimatedScore } = await import("./animated-score");
    render(<AnimatedScore target={92} />);

    act(() => observers[0]!.callback([{ isIntersecting: true }]));

    expect(observers[0]!.disconnected).toBe(true);
  });

  it("renders the final score immediately, unobserved, for prefers-reduced-motion", async () => {
    setReducedMotion(true);
    vi.resetModules();
    const { AnimatedScore } = await import("./animated-score");
    render(<AnimatedScore target={92} />);

    expect(screen.getByText("92")).toBeInTheDocument();
    expect(observers).toHaveLength(0);
  });

  it("releases the observer on unmount", async () => {
    const { AnimatedScore } = await import("./animated-score");
    const { unmount } = render(<AnimatedScore target={92} />);

    unmount();

    expect(observers[0]!.disconnected).toBe(true);
  });
});
