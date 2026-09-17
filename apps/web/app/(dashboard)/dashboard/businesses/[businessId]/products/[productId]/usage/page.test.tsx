// @vitest-environment jsdom
/**
 * The per-workspace usage tab is the founder-visible half of the free-tier cap: it warns
 * when *either* limit is reached (spend or run count, not both), and labels each internal
 * operation key with something a founder can read — falling back to the raw key rather
 * than showing nothing for an operation added since this map was written.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceUsage } from "@cofounderai/module-discovery/lib/usage/types";
import { FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { product, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getWorkspaceUsage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/usage/queries", () => ({
  getWorkspaceUsage: h.getWorkspaceUsage,
}));

const { default: UsagePage } = await import("./page");

function usage(overrides: Partial<WorkspaceUsage> = {}): WorkspaceUsage {
  return {
    workspaceId: "ws-1",
    periodStart: "2026-03-01T00:00:00Z",
    periodEnd: "2026-04-01T00:00:00Z",
    totalRuns: 0,
    totalCost: 0,
    byOperation: [],
    ...overrides,
  };
}

const renderPage = () =>
  UsagePage({ params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }) }).then(render);

const LIMIT_WARNING = /Free-tier limit reached for this month/;

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.getWorkspaceUsage.mockResolvedValue(usage());
});

afterEach(cleanup);

describe("UsagePage", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.getWorkspaceUsage).not.toHaveBeenCalled();
  });

  it("reports an unused workspace without warning about limits", async () => {
    await renderPage();

    expect(screen.getByText("0% of AI credits used")).toBeInTheDocument();
    expect(screen.getByText(`0 / ${FREE_TIER_MONTHLY_RUN_LIMIT} runs`)).toBeInTheDocument();
    expect(screen.getByText("No AI usage yet this month.")).toBeInTheDocument();
    expect(screen.queryByText(LIMIT_WARNING)).not.toBeInTheDocument();
  });

  it("warns once the spend cap is reached", async () => {
    h.getWorkspaceUsage.mockResolvedValue(usage({ totalRuns: 2, totalCost: 20 }));

    await renderPage();

    expect(screen.getByText("100% of AI credits used")).toBeInTheDocument();
    expect(screen.getByText(LIMIT_WARNING)).toBeInTheDocument();
  });

  it("warns on the run cap even when the spend is negligible", async () => {
    h.getWorkspaceUsage.mockResolvedValue(
      usage({ totalRuns: FREE_TIER_MONTHLY_RUN_LIMIT, totalCost: 0.01 }),
    );

    await renderPage();

    expect(screen.getByText("0% of AI credits used")).toBeInTheDocument();
    expect(screen.getByText(LIMIT_WARNING)).toBeInTheDocument();
  });

  it("stays quiet just below both caps", async () => {
    h.getWorkspaceUsage.mockResolvedValue(
      usage({ totalRuns: FREE_TIER_MONTHLY_RUN_LIMIT - 1, totalCost: 19 }),
    );

    await renderPage();

    expect(screen.queryByText(LIMIT_WARNING)).not.toBeInTheDocument();
  });

  it("labels each operation for a human, pluralising the run count", async () => {
    h.getWorkspaceUsage.mockResolvedValue(
      usage({
        totalRuns: 3,
        totalCost: 1,
        byOperation: [
          { operation: "research_prospect", runs: 2, cost: 0.8 },
          { operation: "chat", runs: 1, cost: 0.2 },
        ],
      }),
    );

    await renderPage();

    expect(screen.getByText("Prospect research")).toBeInTheDocument();
    expect(screen.getByText("2 runs")).toBeInTheDocument();
    expect(screen.getByText("AI assistant")).toBeInTheDocument();
    expect(screen.getByText("1 run")).toBeInTheDocument();
  });

  it("falls back to the raw key for an operation it has no label for", async () => {
    h.getWorkspaceUsage.mockResolvedValue(
      usage({ totalRuns: 1, totalCost: 1, byOperation: [{ operation: "summarise_thread", runs: 1, cost: 1 }] }),
    );

    await renderPage();

    expect(screen.getByText("summarise_thread")).toBeInTheDocument();
  });

  it("labels the period from the usage window", async () => {
    await renderPage();

    expect(
      screen.getByText(
        new Date("2026-03-01T00:00:00Z").toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        }),
      ),
    ).toBeInTheDocument();
  });
});
