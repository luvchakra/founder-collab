// @vitest-environment jsdom
/**
 * Hand-rolled rather than next-themes, so the three-state logic and its localStorage
 * synchronisation are ours to keep correct. The subtle parts: the provider must start at
 * "system" on the first render (matching what theme-script.tsx already painted, or React
 * reports a hydration mismatch), and "system" must keep tracking the OS preference live
 * while an explicit choice must not.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

let mediaListeners: Array<() => void>;
let prefersDark: boolean;

function mockMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return prefersDark;
      },
      addEventListener: (_e: string, handler: () => void) => mediaListeners.push(handler),
      removeEventListener: (_e: string, handler: () => void) => {
        const i = mediaListeners.indexOf(handler);
        if (i >= 0) mediaListeners.splice(i, 1);
      },
    })),
  );
}

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  mediaListeners = [];
  prefersDark = false;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  mockMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("defaults to system when nothing is stored", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe("system");
  });

  it.each(["light", "dark", "system"] as const)("adopts a stored '%s' preference", (stored) => {
    localStorage.setItem("theme", stored);

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe(stored);
  });

  it("ignores a junk stored value rather than adopting it", () => {
    localStorage.setItem("theme", "neon");

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe("system");
  });

  it("adds the dark class for an explicit dark theme", () => {
    localStorage.setItem("theme", "dark");
    renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(isDark()).toBe(true);
  });

  it("removes the dark class for an explicit light theme, even when the OS prefers dark", () => {
    prefersDark = true;
    localStorage.setItem("theme", "light");
    renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(isDark()).toBe(false);
  });

  it("follows the OS preference under 'system'", () => {
    prefersDark = true;
    renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(isDark()).toBe(true);
  });

  it("keeps tracking the OS while on 'system'", () => {
    prefersDark = false;
    renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(isDark()).toBe(false);

    prefersDark = true;
    act(() => mediaListeners.forEach((fire) => fire()));

    expect(isDark()).toBe(true);
  });

  it("stops tracking the OS once an explicit theme is chosen", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme("light"));
    expect(mediaListeners).toHaveLength(0);

    prefersDark = true;
    act(() => mediaListeners.forEach((fire) => fire()));
    expect(isDark()).toBe(false);
  });

  it("persists a chosen theme and applies it immediately", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme("dark"));

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("renders its children", () => {
    render(
      <ThemeProvider>
        <p>content</p>
      </ThemeProvider>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });
});

describe("useTheme", () => {
  it("throws outside a ThemeProvider rather than silently no-op'ing", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useTheme())).toThrow(/must be used within a ThemeProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
