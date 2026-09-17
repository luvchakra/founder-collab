// @vitest-environment jsdom
/**
 * Account-wide AI usage. Two things here are easy to get subtly wrong: the free-tier
 * allowance is *per workspace* (lib/usage/limits.ts), so the headline percentage must
 * divide by every workspace on the account — including ones with no usage, which never
 * appear as a row — and a product with no runs this month is dropped from the table
 * rather than shown as a zero row.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceUsage } from "@cofounderai/module-discovery/lib/usage/types";
import { business, product, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  listBusinesses: vi.fn(),
  listProducts: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getWorkspaceUsage: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getCurrentAccount: h.getCurrentAccount,
  listBusinesses: h.listBusinesses,
  listProducts: h.listProducts,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/usage/queries", () => ({
  getWorkspaceUsage: h.getWorkspaceUsage,
}));

const { default: AccountUsagePage } = await import("./page");

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

const renderPage = () => AccountUsagePage().then(render);
const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1", name: "Ada" });
  h.listBusinesses.mockResolvedValue([business()]);
  h.listProducts.mockResolvedValue([product()]);
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.getWorkspaceUsage.mockResolvedValue(usage({ totalRuns: 4, totalCost: 5 }));
});

afterEach(cleanup);

describe("AccountUsagePage", () => {
  it("sends a signed-out visitor to login", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(h.listBusinesses).not.toHaveBeenCalled();
  });

  it("reports the month's runs and the share of the allowance spent", async () => {
    await renderPage();

    // $5 of one workspace's $20 allowance
    expect(screen.getByText("25% of AI credits used")).toBeInTheDocument();
    expect(screen.getByText("4 runs")).toBeInTheDocument();
  });

  it("spreads the allowance across every workspace on the account", async () => {
    h.listProducts.mockResolvedValue([product(), product({ id: "prod-2", name: "Invoice Radar" })]);
    h.getWorkspaceForProduct.mockImplementation(async (productId: string) =>
      workspace({ id: `ws-${productId}`, product_id: productId }),
    );
    h.getWorkspaceUsage.mockImplementation(async (workspaceId: string) =>
      workspaceId === "ws-prod-1"
        ? usage({ workspaceId, totalRuns: 4, totalCost: 5 })
        : usage({ workspaceId, totalRuns: 0, totalCost: 0 }),
    );

    await renderPage();

    // same $5 spent, but two workspaces' allowances ($40) behind it
    expect(screen.getByText("13% of AI credits used")).toBeInTheDocument();
    // ...and the idle workspace is not a table row
    expect(bodyRows()).toHaveLength(1);
  });

  it("lists one row per product that actually spent something, costliest first", async () => {
    h.listBusinesses.mockResolvedValue([business(), business({ id: "biz-2", name: "Initech" })]);
    h.listProducts.mockImplementation(async (businessId: string) =>
      businessId === "biz-1"
        ? [product()]
        : [product({ id: "prod-2", business_id: "biz-2", name: "Invoice Radar" })],
    );
    h.getWorkspaceForProduct.mockImplementation(async (productId: string) =>
      workspace({ id: `ws-${productId}`, product_id: productId }),
    );
    h.getWorkspaceUsage.mockImplementation(async (workspaceId: string) =>
      workspaceId === "ws-prod-1"
        ? usage({ workspaceId, totalRuns: 2, totalCost: 1 })
        : usage({ workspaceId, totalRuns: 9, totalCost: 8 }),
    );

    await renderPage();

    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Initech");
    expect(rows[0]).toHaveTextContent("Invoice Radar");
    expect(rows[0]).toHaveTextContent("9");
    expect(rows[1]).toHaveTextContent("Returns Autopilot");
    expect(screen.getByText("11 runs")).toBeInTheDocument();
  });

  it("drops a product whose workspace hasn't been created yet", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await renderPage();

    expect(h.getWorkspaceUsage).not.toHaveBeenCalled();
    expect(screen.getByText("No AI usage yet this month.")).toBeInTheDocument();
  });

  it("says so plainly when nothing has been spent this month", async () => {
    h.getWorkspaceUsage.mockResolvedValue(usage());

    await renderPage();

    expect(screen.getByText("No AI usage yet this month.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("0% of AI credits used")).toBeInTheDocument();
    expect(screen.getByText("0 runs")).toBeInTheDocument();
  });

  it("labels the period from the usage window it reported on", async () => {
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

  it("falls back to the current month when there is no usage to date", async () => {
    h.getWorkspaceUsage.mockResolvedValue(usage());

    await renderPage();

    expect(
      screen.getByText(
        new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      ),
    ).toBeInTheDocument();
  });

  it("never reports more than the whole allowance as spent", async () => {
    h.getWorkspaceUsage.mockResolvedValue(usage({ totalRuns: 900, totalCost: 500 }));

    await renderPage();

    expect(screen.getByText("100% of AI credits used")).toBeInTheDocument();
  });
});
