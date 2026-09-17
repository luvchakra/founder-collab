// @vitest-environment jsdom
/**
 * The board owns the live client-side search (typing filters the already server-filtered
 * list with no round trip) and the Advanced panel's open state. The empty-state wording
 * is the part that carries meaning: "no prospects match these filters" and "no prospects
 * yet" tell a founder two very different things.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectsBoard } from "./prospects-board";

const BASE = "/dashboard/businesses/b1/products/p1/prospects";

function prospect(id: string, company_name: string) {
  return {
    id,
    company_name,
    industry: "Mfg",
    fit_score: 50,
    stage: "new",
    nextAction: null,
    lastActivityAt: "2026-09-01T00:00:00.000Z",
    status: "new",
  } as unknown as Parameters<typeof ProspectsBoard>[0]["prospects"][number];
}

function setup(props: Partial<Parameters<typeof ProspectsBoard>[0]> = {}) {
  return render(
    <ProspectsBoard
      prospects={[prospect("p1", "Acme Ltd"), prospect("p2", "Beta Industries")]}
      basePath={BASE}
      initialSearch=""
      status=""
      stage=""
      industry=""
      sort="recent"
      industries={["Mfg"]}
      defaultAdvancedOpen={false}
      hasActiveFilters={false}
      bulkResearchAction={vi.fn()}
      bulkScoreAction={vi.fn()}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("ProspectsBoard — search", () => {
  it("lists every prospect before any typing", () => {
    setup();

    expect(screen.getByRole("link", { name: /Acme Ltd/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Beta Industries/ })).toBeInTheDocument();
  });

  it("filters as you type, without a round trip", async () => {
    setup();

    await userEvent.type(screen.getByRole("searchbox"), "acme");

    expect(screen.getByRole("link", { name: /Acme Ltd/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Beta Industries/ })).not.toBeInTheDocument();
  });

  it("matches anywhere in the name, case-insensitively", async () => {
    setup();

    await userEvent.type(screen.getByRole("searchbox"), "INDUSTR");

    expect(screen.getByRole("link", { name: /Beta Industries/ })).toBeInTheDocument();
  });

  it("starts from a search already in the URL", () => {
    setup({ initialSearch: "beta" });

    expect(screen.getByRole("searchbox")).toHaveValue("beta");
    expect(screen.queryByRole("link", { name: /Acme Ltd/ })).not.toBeInTheDocument();
  });

  it("ignores surrounding whitespace in the query", async () => {
    setup();

    await userEvent.type(screen.getByRole("searchbox"), "   ");

    expect(screen.getByRole("link", { name: /Acme Ltd/ })).toBeInTheDocument();
  });
});

describe("ProspectsBoard — empty states", () => {
  it("says there are no prospects yet when the list is genuinely empty", () => {
    setup({ prospects: [] });

    expect(screen.getByText("No prospects yet.")).toBeInTheDocument();
  });

  it("says nothing matched when a search excluded everything", async () => {
    setup();

    await userEvent.type(screen.getByRole("searchbox"), "zzzz");

    expect(screen.getByText("No prospects match these filters.")).toBeInTheDocument();
  });

  it("says nothing matched when server-side filters excluded everything", () => {
    setup({ prospects: [], hasActiveFilters: true });

    expect(screen.getByText("No prospects match these filters.")).toBeInTheDocument();
  });
});

describe("ProspectsBoard — advanced panel", () => {
  it("starts closed by default and toggles open", async () => {
    setup();
    const toggle = screen.getByRole("button", { name: /Advanced/ });

    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Advanced/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("starts open when the caller says the URL already carries filters", () => {
    setup({ defaultAdvancedOpen: true });

    expect(screen.getByRole("button", { name: /Advanced/ })).toHaveAttribute("aria-expanded", "true");
  });
});
