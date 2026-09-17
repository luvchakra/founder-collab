// @vitest-environment jsdom
/**
 * The product stage tracker. Two things it must get right: which tab reads as the current
 * page (Overview is the base path, so it must match exactly rather than prefix-matching
 * every tab under it), and the completion tint, which is how workflow progress reads from
 * colour alone with no separate checkmark.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

const { ProductNav } = await import("./product-nav");

const BASE = "/dashboard/businesses/biz-1/products/prod-1";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ProductNav", () => {
  it("renders the four stages, linked under the product's base path", () => {
    usePathname.mockReturnValue(BASE);
    render(<ProductNav basePath={BASE} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", BASE);
    expect(screen.getByRole("link", { name: "ICP" })).toHaveAttribute("href", `${BASE}/icp`);
    expect(screen.getByRole("link", { name: "Prospects" })).toHaveAttribute("href", `${BASE}/prospects`);
    expect(screen.getByRole("link", { name: "Conversions" })).toHaveAttribute("href", `${BASE}/conversions`);
  });

  it("marks Overview current only on the base path itself", () => {
    usePathname.mockReturnValue(BASE);
    render(<ProductNav basePath={BASE} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("does not leave Overview current on a nested tab's path", () => {
    usePathname.mockReturnValue(`${BASE}/icp`);
    render(<ProductNav basePath={BASE} />);

    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "ICP" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps a tab current on a page nested beneath it", () => {
    usePathname.mockReturnValue(`${BASE}/prospects/p1`);
    render(<ProductNav basePath={BASE} />);

    expect(screen.getByRole("link", { name: "Prospects" })).toHaveAttribute("aria-current", "page");
  });

  it("marks exactly one tab current", () => {
    usePathname.mockReturnValue(`${BASE}/conversions`);
    render(<ProductNav basePath={BASE} />);

    expect(screen.getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("tints a completed stage, so progress reads from colour alone", () => {
    usePathname.mockReturnValue(BASE);
    render(<ProductNav basePath={BASE} completed={{ icp: true }} />);

    expect(screen.getByRole("link", { name: "ICP" }).className).toContain("bg-primary/20");
    expect(screen.getByRole("link", { name: "Prospects" }).className).toContain("bg-muted");
  });

  it("gives the current tab the solid fill, not the completed tint", () => {
    usePathname.mockReturnValue(`${BASE}/icp`);
    render(<ProductNav basePath={BASE} completed={{ icp: true }} />);

    const icp = screen.getByRole("link", { name: "ICP" });
    expect(icp.className).toContain("bg-primary ");
    expect(icp.className).not.toContain("bg-primary/20");
  });

  it("interlocks the tabs with a clip path, first and last shaped differently", () => {
    usePathname.mockReturnValue(BASE);
    render(<ProductNav basePath={BASE} />);

    const [first, , , last] = screen.getAllByRole("link");
    expect(first!.style.clipPath).not.toBe(last!.style.clipPath);
    expect(first!.style.marginLeft).toBe("0px");
    expect(last!.style.marginLeft).toBe("-12px");
  });

  it("renders with no path match at all rather than crashing", () => {
    usePathname.mockReturnValue("/somewhere/else");

    expect(() => render(<ProductNav basePath={BASE} />)).not.toThrow();
    expect(screen.getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(0);
  });

  it("labels itself for assistive tech", () => {
    usePathname.mockReturnValue(BASE);
    render(<ProductNav basePath={BASE} />);

    expect(screen.getByRole("navigation", { name: "Product sections" })).toBeInTheDocument();
  });
});
