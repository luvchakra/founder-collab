// @vitest-environment jsdom
/**
 * The blocking pre-hydration script. It is injected as raw text, so the only way to test
 * it is to read the source it emits and then actually run it — which is worth doing,
 * because a throw here happens before React loads and would blank the page.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeScript } from "./theme-script";

function scriptSource() {
  const { container } = render(<ThemeScript />);
  return container.querySelector("script")!.innerHTML;
}

/** Runs the emitted script exactly as the browser would. */
function runScript() {
  // eslint-disable-next-line no-new-func
  new Function(scriptSource())();
}

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeScript", () => {
  it("renders a script tag", () => {
    const { container } = render(<ThemeScript />);

    expect(container.querySelector("script")).toBeInTheDocument();
  });

  it("reads the same localStorage key ThemeProvider writes", () => {
    expect(scriptSource()).toContain('localStorage.getItem("theme")');
  });

  it("applies a stored dark preference before hydration", () => {
    localStorage.setItem("theme", "dark");

    runScript();

    expect(isDark()).toBe(true);
  });

  it("applies a stored light preference", () => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.add("dark");

    runScript();

    expect(isDark()).toBe(false);
  });

  it("follows the OS preference when the stored value is 'system'", () => {
    localStorage.setItem("theme", "system");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    runScript();

    expect(isDark()).toBe(true);
  });

  it("treats a missing preference as 'system'", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    runScript();

    expect(isDark()).toBe(true);
  });

  it("swallows a localStorage failure rather than blanking the page before React loads", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked by privacy settings");
    });

    try {
      expect(() => runScript()).not.toThrow();
    } finally {
      getItem.mockRestore();
    }
  });
});
