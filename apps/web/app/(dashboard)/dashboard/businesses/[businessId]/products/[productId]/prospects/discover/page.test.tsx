// @vitest-environment jsdom
/**
 * Discovery is the one AI feature that reaches outside the workspace, so its review gate
 * is the point: suggestions land in their own table and nothing enters the pipeline until
 * a founder submits the approve form. Every suggestion is pre-checked (approving the whole
 * batch is the common case), and the discard form carries all ids as hidden inputs so
 * unchecking one doesn't leave it behind.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProspectSuggestion } from "@cofounderai/module-discovery/lib/prospects/types";
import { product, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProspectSuggestions: vi.fn(),
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
  listProspectSuggestions: h.listProspectSuggestions,
}));
vi.mock("./actions", () => ({
  runDiscoveryAction: vi.fn(),
  approveSuggestionsAction: vi.fn(),
  discardSuggestionsAction: vi.fn(),
}));

const { default: DiscoverProspectsPage } = await import("./page");

function suggestion(overrides: Partial<ProspectSuggestion> = {}): ProspectSuggestion {
  return {
    id: "sug-1",
    workspace_id: "ws-1",
    company_name: "Globex",
    website: "https://globex.example",
    industry: "E-commerce",
    company_size: "10-50",
    location: "Austin, TX",
    description: "Sells widgets online",
    match_reason: "Runs a returns-heavy DTC store",
    source_url: "https://news.example/globex",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const renderPage = () =>
  DiscoverProspectsPage({
    params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }),
  }).then(render);

const BASE = "/dashboard/businesses/biz-1/products/prod-1/prospects";

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.listProspectSuggestions.mockResolvedValue([]);
});

afterEach(cleanup);

describe("DiscoverProspectsPage — tenancy", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.listProspectSuggestions).not.toHaveBeenCalled();
  });
});

describe("DiscoverProspectsPage", () => {
  it("promises nothing is added without review", async () => {
    await renderPage();

    expect(
      screen.getByText(/Nothing is\s+added to your pipeline until you review and approve it below\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to prospects" })).toHaveAttribute("href", BASE);
  });

  it("offers a search and nothing to approve when no suggestions are waiting", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: "Find 10 new prospects" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add selected to prospects" })).not.toBeInTheDocument();
    expect(screen.getByText(/No suggestions waiting for review yet\./)).toBeInTheDocument();
  });

  it("pre-checks every waiting suggestion", async () => {
    h.listProspectSuggestions.mockResolvedValue([
      suggestion(),
      suggestion({ id: "sug-2", company_name: "Initech" }),
    ]);

    await renderPage();

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual(["sug-1", "sug-2"]);
  });

  it("shows why the AI thinks each company fits, and where it found it", async () => {
    h.listProspectSuggestions.mockResolvedValue([suggestion()]);

    await renderPage();

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Globex")).toBeInTheDocument();
    expect(within(item).getByText("E-commerce · 10-50 · Austin, TX")).toBeInTheDocument();
    expect(within(item).getByText(/Runs a returns-heavy DTC store/)).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://news.example/globex",
    );
    expect(within(item).getByRole("link", { name: "https://globex.example" })).toHaveAttribute(
      "rel",
      "noreferrer",
    );
  });

  it("renders a suggestion the AI could say little about", async () => {
    h.listProspectSuggestions.mockResolvedValue([
      suggestion({
        website: null,
        industry: null,
        company_size: null,
        location: null,
        description: null,
        match_reason: null,
        source_url: null,
      }),
    ]);

    await renderPage();

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Globex")).toBeInTheDocument();
    expect(within(item).getByText("—")).toBeInTheDocument();
    expect(within(item).queryByRole("link")).not.toBeInTheDocument();
    expect(within(item).queryByText(/Why this fits/)).not.toBeInTheDocument();
  });

  it("carries every id into the discard-all form, checked or not", async () => {
    h.listProspectSuggestions.mockResolvedValue([
      suggestion(),
      suggestion({ id: "sug-2", company_name: "Initech" }),
    ]);

    const { container } = await renderPage();

    const hidden = [...container.querySelectorAll('input[type="hidden"][name="ids"]')];
    expect(hidden.map((input) => (input as HTMLInputElement).value)).toEqual(["sug-1", "sug-2"]);
    expect(screen.getByRole("button", { name: "Discard all suggestions" })).toBeInTheDocument();
  });
});
