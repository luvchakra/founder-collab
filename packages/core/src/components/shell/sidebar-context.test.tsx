// @vitest-environment jsdom
/**
 * The drawer's open state is shared between the topbar's hamburger and the drawer, which
 * are siblings rather than nested. The contract worth pinning is that it starts closed
 * (the drawer must not cover the page on first paint) and that using the hook outside the
 * provider fails loudly rather than silently rendering a drawer that can never open.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, useSidebar } from "./sidebar-context";

afterEach(cleanup);

describe("SidebarProvider / useSidebar", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: SidebarProvider });

    expect(result.current.open).toBe(false);
  });

  it("opens and closes through setOpen", () => {
    const { result } = renderHook(() => useSidebar(), { wrapper: SidebarProvider });

    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);

    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });

  it("shares one state between two separate consumers", () => {
    function Toggle() {
      const { setOpen } = useSidebar();
      return <button onClick={() => setOpen(true)}>open</button>;
    }
    function Drawer() {
      const { open } = useSidebar();
      return <span>{open ? "drawer open" : "drawer closed"}</span>;
    }

    render(
      <SidebarProvider>
        <Toggle />
        <Drawer />
      </SidebarProvider>,
    );

    expect(screen.getByText("drawer closed")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "open" }).click());
    expect(screen.getByText("drawer open")).toBeInTheDocument();
  });

  it("throws a clear error when used outside the provider", () => {
    // React logs the thrown render error; silence it so the test output stays readable.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useSidebar())).toThrow(/must be used within a SidebarProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
