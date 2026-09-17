// @vitest-environment jsdom
/**
 * A plain GET form, deliberately: the server reads these back off the query string, so
 * the `name` of every control is load-bearing and the defaults have to reflect the
 * filters already applied (a re-render that dropped them would silently reset the view
 * on the next submit). The industry select only exists when the workspace has industries
 * to offer, and "Clear" only when there is something to clear.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProspectFilters } from "./prospect-filters";

const BASE = "/dashboard/businesses/b1/products/p1/prospects";

function renderFilters(overrides: Partial<Parameters<typeof ProspectFilters>[0]> = {}) {
  return render(
    <ProspectFilters
      basePath={BASE}
      status=""
      stage=""
      industry=""
      sort="recent"
      industries={[]}
      open
      hasActiveFilters={false}
      {...overrides}
    />,
  );
}

afterEach(cleanup);

describe("ProspectFilters", () => {
  it("submits as a GET form so the server can re-query", () => {
    const { container } = renderFilters();
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).not.toHaveClass("hidden");
  });

  it("hides itself rather than unmounting when closed", () => {
    const { container } = renderFilters({ open: false });
    expect(container.querySelector("form")).toHaveClass("hidden");
    // still mounted: the board toggles `open`, it does not remount the panel
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("offers the three prospect statuses plus 'Any'", () => {
    renderFilters();
    const status = screen.getByLabelText("Status");
    expect(status).toHaveAttribute("name", "status");
    expect([...(status as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      "",
      "new",
      "qualified",
      "disqualified",
    ]);
  });

  it("labels each pipeline stage with its display name", () => {
    renderFilters();
    const stage = screen.getByLabelText("Stage");
    expect(stage).toHaveAttribute("name", "stage");
    const options = [...(stage as HTMLSelectElement).options];
    expect(options[0]!.value).toBe("");
    expect(options.length).toBeGreaterThan(1);
    expect(options.slice(1).every((o) => o.textContent !== o.value)).toBe(true);
  });

  it("omits the industry filter when the workspace has no industries", () => {
    renderFilters();
    expect(screen.queryByLabelText("Industry")).not.toBeInTheDocument();
  });

  it("lists the workspace's industries when it has some", () => {
    renderFilters({ industries: ["Retail", "Logistics"], industry: "Logistics" });
    const industry = screen.getByLabelText("Industry") as HTMLSelectElement;
    expect([...industry.options].map((o) => o.value)).toEqual(["", "Retail", "Logistics"]);
    expect(industry).toHaveValue("Logistics");
  });

  it("pre-selects the filters already applied", () => {
    renderFilters({ status: "qualified", stage: "contacted", sort: "priority" });
    expect(screen.getByLabelText("Status")).toHaveValue("qualified");
    expect(screen.getByLabelText("Sort")).toHaveValue("priority");
  });

  it("only offers Clear when a filter is active, pointing back at the unfiltered list", () => {
    const { unmount } = renderFilters();
    expect(screen.queryByRole("link", { name: "Clear" })).not.toBeInTheDocument();
    unmount();

    renderFilters({ hasActiveFilters: true });
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", BASE);
  });
});
