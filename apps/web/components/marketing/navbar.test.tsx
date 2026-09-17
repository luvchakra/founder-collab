// @vitest-environment jsdom
/**
 * Two navs, not one: the desktop nav is always in the DOM (hidden by a media class) and
 * the mobile one only exists while the hamburger is open, so "is the menu open" has to be
 * asserted against the mobile nav specifically. Every mobile link closes the drawer —
 * they're same-page anchors, so nothing else would.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Navbar } from "./navbar";

const SECTIONS = ["Product", "How It Works", "Benefits", "Pricing", "FAQ"];

const toggle = () => screen.getByRole("button", { name: /menu/i });
const mobileNav = () => screen.queryByRole("navigation", { name: "Mobile" });

afterEach(cleanup);

describe("Navbar", () => {
  it("links the logo home and offers both auth entry points", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "CoFounderAI" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "Log In" })[0]).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link", { name: "Start Free" })[0]).toHaveAttribute("href", "/signup");
  });

  it("anchors the desktop nav at each landing section", () => {
    render(<Navbar />);

    const desktop = screen.getByRole("navigation", { name: "Primary" });
    for (const label of SECTIONS) {
      expect(within(desktop).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `#${label.toLowerCase().replace(/ /g, "-")}`,
      );
    }
  });

  it("starts with the mobile drawer closed", () => {
    render(<Navbar />);

    expect(mobileNav()).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAccessibleName("Open menu");
  });

  it("opens and closes the drawer from the hamburger", async () => {
    const u = userEvent.setup();
    render(<Navbar />);

    await u.click(toggle());
    expect(mobileNav()).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAccessibleName("Close menu");

    await u.click(toggle());
    expect(mobileNav()).not.toBeInTheDocument();
  });

  it("closes the drawer when a section link is followed", async () => {
    const u = userEvent.setup();
    render(<Navbar />);
    await u.click(toggle());

    await u.click(within(mobileNav()!).getByRole("link", { name: "Pricing" }));

    expect(mobileNav()).not.toBeInTheDocument();
  });

  it("closes the drawer when Log In is followed", async () => {
    const u = userEvent.setup();
    render(<Navbar />);
    await u.click(toggle());

    await u.click(within(mobileNav()!).getByRole("link", { name: "Log In" }));

    expect(mobileNav()).not.toBeInTheDocument();
  });
});
