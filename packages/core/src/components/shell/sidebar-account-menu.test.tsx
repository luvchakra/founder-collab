// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarAccountMenu } from "./sidebar-account-menu";

const USER = { name: "Ada Lovelace", email: "ada@example.com" };

function renderMenu(props: Partial<Parameters<typeof SidebarAccountMenu>[0]> = {}) {
  const onNavigate = vi.fn();
  const view = render(<SidebarAccountMenu user={USER} onNavigate={onNavigate} {...props} />);
  return { ...view, onNavigate };
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

afterEach(cleanup);

describe("SidebarAccountMenu", () => {
  it("shows the user's name on the trigger, with the menu closed", () => {
    renderMenu();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each([
    ["two words", "Ada Lovelace", "AL"],
    ["one word", "Ada", "A"],
    ["three words, capped at two", "Ada Byron Lovelace", "AB"],
    ["lowercase input", "ada lovelace", "AL"],
    ["extra spaces", "  Ada   Lovelace  ", "AL"],
  ])("derives initials from %s", (_label, name, expected) => {
    renderMenu({ user: { ...USER, name } });

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("opens on the trigger and shows the account identity", () => {
    renderMenu();

    openMenu();

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it.each([
    ["Profile", "/dashboard/settings/profile"],
    ["Usage", "/dashboard/settings/usage"],
    ["Billing", "/dashboard/settings/billing"],
    ["Appearance", "/dashboard/settings/appearance"],
    ["Settings", "/dashboard/settings/ai-provider"],
  ])("links %s to this platform's own %s route", (label, href) => {
    renderMenu();
    openMenu();

    expect(screen.getByRole("menuitem", { name: label })).toHaveAttribute("href", href);
  });

  it("closes the drawer as well as the menu when an item navigates", () => {
    const { onNavigate } = renderMenu();
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers a sign-out control", () => {
    renderMenu({ onSignOut: vi.fn() });
    openMenu();

    expect(screen.getByRole("button", { name: /Log Out/ })).toBeInTheDocument();
  });

  it("renders without a sign-out handler rather than crashing", () => {
    renderMenu({ onSignOut: undefined });

    expect(() => openMenu()).not.toThrow();
    expect(screen.getByRole("button", { name: /Log Out/ })).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderMenu();
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles shut when the trigger is clicked again", () => {
    renderMenu();
    openMenu();

    fireEvent.click(screen.getByRole("button", { expanded: true }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
