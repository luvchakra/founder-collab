// @vitest-environment jsdom
/**
 * The prospects table. Its substance is selection and grouping: rows group into one tbody
 * per pipeline stage (empty stages omitted), while "select all" and the bulk bar operate
 * on the full flattened list across every group — so a selection made in one group must
 * still be counted and submitted from the bar above all of them.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectsTable } from "./prospects-table";

const BASE = "/dashboard/businesses/b1/products/p1/prospects";

function prospect(id: string, stage: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    company_name: `Co ${id}`,
    industry: "Mfg",
    fit_score: 50,
    stage,
    nextAction: null,
    lastActivityAt: "2026-09-01T00:00:00.000Z",
    status: "new",
    ...overrides,
  } as unknown as Parameters<typeof ProspectsTable>[0]["prospects"][number];
}

function setup(prospects: Parameters<typeof ProspectsTable>[0]["prospects"]) {
  const bulkResearchAction = vi.fn();
  const bulkScoreAction = vi.fn();
  const view = render(
    <ProspectsTable
      prospects={prospects}
      basePath={BASE}
      bulkResearchAction={bulkResearchAction}
      bulkScoreAction={bulkScoreAction}
    />,
  );
  return { bulkResearchAction, bulkScoreAction, ...view };
}

const rowCheckboxes = () => screen.getAllByRole("checkbox").slice(1);

afterEach(cleanup);

describe("ProspectsTable — rendering", () => {
  it("lists every prospect, linked to its detail page", () => {
    setup([prospect("p1", "new"), prospect("p2", "new")]);

    expect(screen.getByRole("link", { name: /Co p1/ })).toHaveAttribute("href", `${BASE}/p1`);
    expect(screen.getByRole("link", { name: /Co p2/ })).toHaveAttribute("href", `${BASE}/p2`);
  });

  it("groups rows into one tbody per stage, omitting empty stages", () => {
    const { container } = setup([prospect("p1", "new"), prospect("p2", "researched")]);

    expect(container.querySelectorAll("tbody")).toHaveLength(2);
  });

  it("puts every prospect of one stage in a single group", () => {
    const { container } = setup([
      prospect("p1", "new"),
      prospect("p2", "new"),
      prospect("p3", "researched"),
    ]);

    expect(container.querySelectorAll("tbody")).toHaveLength(2);
  });

  it("renders an empty table without crashing", () => {
    const { container } = setup([]);

    expect(container.querySelectorAll("tbody")).toHaveLength(0);
  });
});

describe("ProspectsTable — selection", () => {
  it("hides the bulk bar until something is selected", () => {
    setup([prospect("p1", "new")]);

    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("shows the bulk bar with a count once a row is checked", () => {
    setup([prospect("p1", "new"), prospect("p2", "new")]);

    fireEvent.click(rowCheckboxes()[0]!);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("counts a selection that spans two stage groups", () => {
    setup([prospect("p1", "new"), prospect("p2", "researched")]);

    for (const box of rowCheckboxes()) fireEvent.click(box);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("unchecks a row on a second click", () => {
    setup([prospect("p1", "new"), prospect("p2", "new")]);

    fireEvent.click(rowCheckboxes()[0]!);
    fireEvent.click(rowCheckboxes()[0]!);

    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("select-all checks every row across every group", () => {
    setup([prospect("p1", "new"), prospect("p2", "researched"), prospect("p3", "scored")]);

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);

    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("select-all toggles back off when everything is already selected", () => {
    setup([prospect("p1", "new"), prospect("p2", "new")]);
    const selectAll = screen.getAllByRole("checkbox")[0]!;

    fireEvent.click(selectAll);
    fireEvent.click(selectAll);

    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("reflects a full manual selection in the select-all checkbox", () => {
    setup([prospect("p1", "new"), prospect("p2", "new")]);

    for (const box of rowCheckboxes()) fireEvent.click(box);

    expect(screen.getAllByRole("checkbox")[0]!).toBeChecked();
  });

  it("clears the selection from the bulk bar", () => {
    setup([prospect("p1", "new")]);
    fireEvent.click(rowCheckboxes()[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("leaves select-all unchecked for an empty table", () => {
    setup([]);

    expect(screen.getAllByRole("checkbox")[0]!).not.toBeChecked();
  });
});

describe("ProspectsTable — bulk actions", () => {
  it("submits the checked ids to the research action", async () => {
    const { bulkResearchAction } = setup([prospect("p1", "new"), prospect("p2", "new")]);
    fireEvent.click(rowCheckboxes()[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Research selected" }));

    await waitFor(() => expect(bulkResearchAction).toHaveBeenCalled());
    expect((bulkResearchAction.mock.calls[0]![0] as FormData).getAll("ids")).toEqual(["p1"]);
  });

  it("explains that ineligible prospects are skipped, so the count is not a surprise", () => {
    setup([prospect("p1", "new")]);

    fireEvent.click(rowCheckboxes()[0]!);

    expect(screen.getByText(/the rest are skipped/)).toBeInTheDocument();
  });

  it("flags a stalled prospect and dashes out the fields it has no value for", () => {
    setup([
      prospect("p1", "new", {
        isStuck: true,
        industry: null,
        company_size: null,
        location: null,
        fit_score: null,
      }),
    ]);

    expect(screen.getByText("Needs next step")).toBeInTheDocument();
    // industry, size, location and fit score all fall back to a dash
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("links the next action straight to the section that performs it", () => {
    setup([prospect("p1", "new", { nextAction: "Research" })]);

    expect(screen.getByRole("link", { name: "Research" }).getAttribute("href")).toBe(
      `${BASE}/p1#research`,
    );
  });

  it("still links an action it has no anchor for, rather than dropping it", () => {
    setup([prospect("p1", "new", { nextAction: "Do something new" })]);

    expect(screen.getByRole("link", { name: "Do something new" }).getAttribute("href")).toBe(
      `${BASE}/p1#`,
    );
  });

  it("leaves the action cell empty for a prospect waiting on someone else", () => {
    setup([prospect("p1", "sent", { nextAction: null })]);

    expect(screen.queryByRole("link", { name: /^(Research|Score|Generate)/ })).not.toBeInTheDocument();
  });
});
