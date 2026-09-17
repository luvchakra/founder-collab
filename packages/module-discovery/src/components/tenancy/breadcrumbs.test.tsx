// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

afterEach(cleanup);

describe("Breadcrumbs", () => {
  it("links every item that has an href", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Acme Co", href: "/dashboard/businesses/biz-1" },
          { label: "Widgets" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Acme Co" })).toBeInTheDocument();
  });

  it("leaves the current page unlinked", () => {
    render(<Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Widgets" }]} />);

    expect(screen.queryByRole("link", { name: "Widgets" })).not.toBeInTheDocument();
    expect(screen.getByText("Widgets")).toBeInTheDocument();
  });

  it("labels itself for assistive tech", () => {
    render(<Breadcrumbs items={[{ label: "Dashboard" }]} />);

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  it("renders an empty trail without crashing", () => {
    expect(() => render(<Breadcrumbs items={[]} />)).not.toThrow();
  });
});
