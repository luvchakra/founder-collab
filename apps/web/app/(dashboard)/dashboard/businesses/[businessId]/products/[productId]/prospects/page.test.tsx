// @vitest-environment jsdom
/**
 * The prospects tab splits filtering deliberately: `search` is handed to the board and
 * applied client-side against the already-fetched list, while status/stage/industry/sort
 * are passed to the query because stage and sort order are computed server-side. An
 * unknown `sort` value must fall back to "recent" rather than reaching the query. The
 * page also renders the post-redirect summaries (CSV import, bulk research/score),
 * which are the only place the free-tier cutoff is reported back to the founder.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { product, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProspects: vi.fn(),
  listProspectIndustries: vi.fn(),
  board: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/queries", () => ({
  listProspects: h.listProspects,
  listProspectIndustries: h.listProspectIndustries,
}));
vi.mock("@cofounderai/module-discovery/components/prospects/prospects-board", () => ({
  ProspectsBoard: (props: Record<string, unknown>) => {
    h.board(props);
    return <div data-testid="board" />;
  },
}));
vi.mock("./actions", () => ({
  createProspectAction: vi.fn(),
  bulkResearchAction: vi.fn(),
  bulkScoreAction: vi.fn(),
}));

const { default: ProspectsPage } = await import("./page");

type SearchParams = Record<string, string>;

const renderPage = (searchParams: SearchParams = {}) =>
  ProspectsPage({
    params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }),
    searchParams: Promise.resolve(searchParams),
  }).then(render);

const boardProps = () => h.board.mock.calls.at(-1)![0] as Record<string, unknown>;
const BASE = "/dashboard/businesses/biz-1/products/prod-1/prospects";

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.listProspects.mockResolvedValue([]);
  h.listProspectIndustries.mockResolvedValue(["E-commerce"]);
});

afterEach(cleanup);

describe("ProspectsPage — tenancy", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.listProspects).not.toHaveBeenCalled();
  });
});

describe("ProspectsPage — filters", () => {
  it("queries unfiltered, most recent first, by default", async () => {
    await renderPage();

    expect(h.listProspects).toHaveBeenCalledWith(
      "ws-1",
      { status: undefined, industry: undefined, stage: undefined },
      "recent",
    );
    expect(boardProps().hasActiveFilters).toBe(false);
    expect(boardProps().defaultAdvancedOpen).toBe(false);
  });

  it("passes the server-side filters through to the query", async () => {
    await renderPage({ status: "qualified", stage: "sent", industry: "E-commerce", sort: "stage" });

    expect(h.listProspects).toHaveBeenCalledWith(
      "ws-1",
      { status: "qualified", industry: "E-commerce", stage: "sent" },
      "stage",
    );
    expect(boardProps().defaultAdvancedOpen).toBe(true);
  });

  it("accepts the priority sort", async () => {
    await renderPage({ sort: "priority" });

    expect(h.listProspects.mock.calls[0]![2]).toBe("priority");
  });

  it("falls back to recent for a sort value it doesn't know", async () => {
    await renderPage({ sort: "cheapest" });

    expect(h.listProspects.mock.calls[0]![2]).toBe("recent");
  });

  it("keeps the search box client-side rather than in the query", async () => {
    await renderPage({ search: "globex" });

    expect(h.listProspects).toHaveBeenCalledWith(
      "ws-1",
      { status: undefined, industry: undefined, stage: undefined },
      "recent",
    );
    expect(boardProps().initialSearch).toBe("globex");
    // a search still counts as a filter for the "Clear" affordance...
    expect(boardProps().hasActiveFilters).toBe(true);
    // ...but not as a reason to open the advanced panel
    expect(boardProps().defaultAdvancedOpen).toBe(false);
  });

  it("gives the board the workspace's industries to filter by", async () => {
    await renderPage();

    expect(h.listProspectIndustries).toHaveBeenCalledWith("ws-1");
    expect(boardProps().industries).toEqual(["E-commerce"]);
    expect(boardProps().basePath).toBe(BASE);
  });
});

describe("ProspectsPage — toolbar", () => {
  it("links import and discover under the prospects route", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: /Import/i })).toHaveAttribute("href", `${BASE}/import`);
    expect(screen.getByRole("link", { name: /Discover/i })).toHaveAttribute(
      "href",
      `${BASE}/discover`,
    );
  });
});

describe("ProspectsPage — post-action summaries", () => {
  it("says nothing when arriving without a summary", async () => {
    await renderPage();

    expect(screen.queryByText(/Imported/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Researched|Scored/)).not.toBeInTheDocument();
  });

  it("summarises a clean import", async () => {
    await renderPage({ imported: "1", skipped: "0", duplicates: "0" });

    expect(screen.getByText(/Imported 1 prospect\./)).toBeInTheDocument();
    expect(screen.queryByText(/Skipped/)).not.toBeInTheDocument();
  });

  it("reports rows skipped for a missing name and for already being in the pipeline", async () => {
    await renderPage({ imported: "4", skipped: "2", duplicates: "3" });

    expect(screen.getByText(/Imported 4 prospects\./)).toBeInTheDocument();
    expect(screen.getByText(/Skipped 2 row\(s\) missing a name\./)).toBeInTheDocument();
    expect(screen.getByText(/Skipped 3 row\(s\) already in your pipeline\./)).toBeInTheDocument();
  });

  it("summarises a bulk research run", async () => {
    await renderPage({ bulkAction: "research", bulkCompleted: "5", bulkSkipped: "0" });

    expect(screen.getByText(/Researched 5 prospects\./)).toBeInTheDocument();
  });

  it("summarises a bulk scoring run, naming what it skipped", async () => {
    await renderPage({ bulkAction: "score", bulkCompleted: "1", bulkSkipped: "2" });

    expect(screen.getByText(/Scored 1 prospect\./)).toBeInTheDocument();
    expect(screen.getByText(/Skipped 2 \(not eligible for this step, or failed\)\./)).toBeInTheDocument();
  });

  it("says when a bulk run stopped early on the free-tier cap", async () => {
    await renderPage({ bulkAction: "research", bulkCompleted: "3", bulkLimit: "1" });

    expect(
      screen.getByText(/this workspace hit its free-tier monthly AI usage limit/),
    ).toBeInTheDocument();
  });

  it("defaults the completed count when the redirect omitted it", async () => {
    await renderPage({ bulkAction: "score" });

    expect(screen.getByText(/Scored 0 prospects\./)).toBeInTheDocument();
  });
});
