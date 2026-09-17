// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useTheme } = vi.hoisted(() => ({ useTheme: vi.fn() }));
vi.mock("./theme-provider", () => ({ useTheme }));

const { ThemeToggle } = await import("./theme-toggle");

let setTheme: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setTheme = vi.fn();
  useTheme.mockReturnValue({ theme: "system", setTheme });
});

afterEach(cleanup);

describe("ThemeToggle", () => {
  it("offers all three themes", () => {
    render(<ThemeToggle />);

    for (const label of ["Light", "Dark", "System"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it.each(["light", "dark", "system"] as const)("marks '%s' pressed when it is active", (theme) => {
    useTheme.mockReturnValue({ theme, setTheme });
    render(<ThemeToggle />);

    const label = theme[0]!.toUpperCase() + theme.slice(1);
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "system"],
  ] as const)("selects %s when clicked", (label, value) => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(setTheme).toHaveBeenCalledWith(value);
  });

  it("renders type=button so it never submits an enclosing form", () => {
    render(<ThemeToggle />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });
});
