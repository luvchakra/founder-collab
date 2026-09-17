// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/dashboard") }));
vi.mock("next/navigation", () => ({ usePathname }));

const { DashboardShell } = await import("./dashboard-shell");

const PROPS = {
  modules: [{ key: "discovery", name: "Discovery", icon: "Target", routePrefix: "/discovery" }],
  businesses: [{ id: "biz-1", name: "Acme Co" }],
  user: { name: "Ada", email: "ada@example.com" },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DashboardShell", () => {
  it("renders the topbar and page content, with the drawer closed", () => {
    render(
      <DashboardShell {...PROPS}>
        <p>page body</p>
      </DashboardShell>,
    );

    expect(screen.getByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("opens the drawer from the topbar toggle — the two are wired to one state", () => {
    render(
      <DashboardShell {...PROPS}>
        <p>page body</p>
      </DashboardShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("falls back to a '#' business href when the caller supplies none", () => {
    render(
      <DashboardShell {...PROPS}>
        <p>body</p>
      </DashboardShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(screen.getByRole("link", { name: /Acme Co/ })).toHaveAttribute("href", "#");
  });

  it("uses the caller's business href when one is given", () => {
    render(
      <DashboardShell {...PROPS} businessHref={(id) => `/dashboard/businesses/${id}`}>
        <p>body</p>
      </DashboardShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(screen.getByRole("link", { name: /Acme Co/ })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1",
    );
  });
});
