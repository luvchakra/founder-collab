// @vitest-environment jsdom
/**
 * The topbar's own logic is its optionality: `businesses` and `chatSlot` are both absent
 * on some renders, and `chatSlot` in particular is the escape hatch that lets a
 * module-owned widget appear in core's shell without core importing the module.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "./sidebar-context";
import { AppTopbar } from "./app-topbar";

function renderTopbar(props: Partial<Parameters<typeof AppTopbar>[0]> = {}) {
  return render(
    <SidebarProvider>
      <AppTopbar {...props} />
    </SidebarProvider>,
  );
}

afterEach(cleanup);

describe("AppTopbar", () => {
  it("always renders the drawer toggle and the logo home link", () => {
    renderTopbar();

    expect(screen.getByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CoFounderAI" })).toHaveAttribute("href", "/dashboard");
  });

  it("renders the business switcher only when businesses are supplied", () => {
    const { container } = renderTopbar();
    const withoutSwitcher = container.querySelectorAll("button").length;
    cleanup();

    const { container: withBusinesses } = renderTopbar({
      businesses: [{ id: "biz-1", name: "Acme Co" }],
      activeBusinessId: "biz-1",
    });

    expect(withBusinesses.querySelectorAll("button").length).toBeGreaterThan(withoutSwitcher);
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  it("renders the alert bell with an empty list when no alerts are given", () => {
    renderTopbar();

    expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
  });

  it("passes alerts through to the bell", () => {
    renderTopbar({
      alerts: [{ id: "a1", severity: "info", message: "Something", href: "/x" }],
    });

    expect(screen.getByRole("button", { name: "1 unread alerts" })).toBeInTheDocument();
  });

  it("renders a module-owned chat slot without core knowing what it is", () => {
    renderTopbar({ chatSlot: <div data-testid="module-widget" /> });

    expect(screen.getByTestId("module-widget")).toBeInTheDocument();
  });

  it("omits the chat slot when none is given", () => {
    renderTopbar();

    expect(screen.queryByTestId("module-widget")).not.toBeInTheDocument();
  });

  it("falls back to a no-op business href rather than crashing when none is supplied", () => {
    expect(() =>
      renderTopbar({ businesses: [{ id: "biz-1", name: "Acme Co" }] }),
    ).not.toThrow();
  });
});
