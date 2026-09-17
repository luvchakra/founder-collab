// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

const listeners: Array<() => void> = [];

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

beforeEach(() => {
  listeners.length = 0;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: (_event: string, handler: () => void) => listeners.push(handler),
      removeEventListener: (_event: string, handler: () => void) => {
        const i = listeners.indexOf(handler);
        if (i >= 0) listeners.splice(i, 1);
      },
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("is true below the 768px breakpoint", () => {
    setViewport(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("is false at exactly the breakpoint", () => {
    setViewport(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("is false above the breakpoint", () => {
    setViewport(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("updates when the media query reports a change", () => {
    setViewport(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    setViewport(500);
    act(() => listeners.forEach((fire) => fire()));

    expect(result.current).toBe(true);
  });

  it("returns a boolean, never the undefined it starts from", () => {
    setViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });

  it("unsubscribes on unmount", () => {
    setViewport(1024);
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners).toHaveLength(1);

    unmount();

    expect(listeners).toHaveLength(0);
  });
});
