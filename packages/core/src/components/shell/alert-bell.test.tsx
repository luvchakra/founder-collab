// @vitest-environment jsdom
/**
 * Alerts are derived on every render, so read/unread has no server-side model and lives
 * in localStorage keyed by each alert's stable id. That makes two things worth pinning:
 * the badge must count only unread alerts (and go red only for an unread *warning*), and
 * a localStorage that throws — private mode, full quota — must degrade to "nothing is
 * read" rather than breaking the topbar.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertBell } from "./alert-bell";
import type { ShellAlert } from "./types";

const STORAGE_KEY = "cofounder-ai:read-alert-ids";

const INFO: ShellAlert = { id: "a1", severity: "info", message: "Profile missing", href: "/a" };
const WARNING: ShellAlert = { id: "a2", severity: "warning", message: "Credits used up", href: "/b" };

function open(alerts: ShellAlert[] = [INFO, WARNING]) {
  render(<AlertBell alerts={alerts} />);
  fireEvent.click(screen.getByRole("button"));
}

const badge = () => screen.getByRole("button").querySelector("span.rounded-full");

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("AlertBell", () => {
  it("counts every alert as unread when nothing is stored", () => {
    render(<AlertBell alerts={[INFO, WARNING]} />);

    expect(screen.getByRole("button", { name: "2 unread alerts" })).toBeInTheDocument();
    expect(badge()).toHaveTextContent("2");
  });

  it("shows no badge and a neutral label when there is nothing to read", () => {
    render(<AlertBell alerts={[]} />);

    expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
    expect(badge()).toBeNull();
  });

  it("caps the badge at 9+", () => {
    render(
      <AlertBell
        alerts={Array.from({ length: 12 }, (_, i) => ({ ...INFO, id: `a${i}` }))}
      />,
    );

    expect(badge()).toHaveTextContent("9+");
  });

  it("uses the destructive badge only when an unread warning is present", () => {
    render(<AlertBell alerts={[INFO]} />);
    expect(badge()!.className).toContain("bg-primary");
    cleanup();

    render(<AlertBell alerts={[INFO, WARNING]} />);
    expect(badge()!.className).toContain("bg-destructive");
  });

  it("excludes stored-read alerts from the count", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a1"]));

    render(<AlertBell alerts={[INFO, WARNING]} />);

    expect(screen.getByRole("button", { name: "1 unread alerts" })).toBeInTheDocument();
  });

  it("drops back to the neutral badge once the warning has been read", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a2"]));

    render(<AlertBell alerts={[INFO, WARNING]} />);

    expect(badge()!.className).toContain("bg-primary");
  });

  it("opens and closes the dropdown from the bell", () => {
    render(<AlertBell alerts={[INFO]} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("menu", { name: "Alerts" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("lists each alert linked to its own href", () => {
    open();

    expect(screen.getByRole("menuitem", { name: /Profile missing/ })).toHaveAttribute("href", "/a");
    expect(screen.getByRole("menuitem", { name: /Credits used up/ })).toHaveAttribute("href", "/b");
  });

  it("shows an all-caught-up message when there are no alerts", () => {
    open([]);

    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("marks an alert read when clicked, and persists that", () => {
    open([INFO, WARNING]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Profile missing/ }));

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(["a1"]);
    expect(screen.getByRole("button", { name: "1 unread alerts" })).toBeInTheDocument();
  });

  it("closes the dropdown after clicking an alert", () => {
    open([INFO]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Profile missing/ }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not re-write storage when an already-read alert is clicked again", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a1"]));
    open([INFO]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    try {
      fireEvent.click(screen.getByRole("menuitem", { name: /Profile missing/ }));
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it("closes on Escape", () => {
    open([INFO]);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("treats unreadable storage as 'nothing read' rather than failing to render", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    render(<AlertBell alerts={[INFO, WARNING]} />);

    expect(screen.getByRole("button", { name: "2 unread alerts" })).toBeInTheDocument();
  });

  it("survives a localStorage read that throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    try {
      expect(() => render(<AlertBell alerts={[INFO]} />)).not.toThrow();
    } finally {
      getItem.mockRestore();
    }
  });

  it("survives a localStorage write that throws, still marking read in-session", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    try {
      open([INFO]);
      fireEvent.click(screen.getByRole("menuitem", { name: /Profile missing/ }));

      expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
    } finally {
      setItem.mockRestore();
    }
  });
});
