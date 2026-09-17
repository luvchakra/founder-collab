// @vitest-environment jsdom
/**
 * The account overview is the one page that aggregates across every workspace, so the
 * arithmetic is the subject: KPI totals are summed from the per-workspace maps, while the
 * funnel is computed from a *slice* of the account's prospects chosen by the
 * business/product filter — product narrowing beats business narrowing, and a filter that
 * matches nothing must show an empty funnel rather than the account-wide one.
 *
 * Both queries are cache()-wrapped and shared with the dashboard layout; the test asserts
 * each is called once per render, which is what makes that sharing observable here.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prospectWithPipeline, workspaceEntry } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  getAccountWorkspaceEntries: vi.fn(),
  getAccountUsageAndProspects: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getCurrentAccount: h.getCurrentAccount,
}));
vi.mock("@cofounderai/module-discovery/lib/dashboard/queries", () => ({
  getAccountWorkspaceEntries: h.getAccountWorkspaceEntries,
  getAccountUsageAndProspects: h.getAccountUsageAndProspects,
}));

const { default: DashboardPage } = await import("./page");

const ENTRY_A = workspaceEntry();
const ENTRY_B = workspaceEntry({
  business: { id: "biz-2", name: "Initech" },
  product: { id: "prod-2", name: "Invoice Radar" },
  workspace: { id: "ws-2" },
});

function renderPage(searchParams: { business?: string; product?: string } = {}) {
  return DashboardPage({ searchParams: Promise.resolve(searchParams) }).then(render);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1", name: "Ada" });
  h.getAccountWorkspaceEntries.mockResolvedValue({
    businesses: [ENTRY_A.business, ENTRY_B.business],
    allProducts: [ENTRY_A.product, ENTRY_B.product],
    entries: [ENTRY_A, ENTRY_B],
  });
  h.getAccountUsageAndProspects.mockResolvedValue({
    usageByWorkspace: {
      "ws-1": { totalRuns: 3, totalCost: 0.5 },
      "ws-2": { totalRuns: 2, totalCost: 0.25 },
    },
    countsByWorkspace: {
      "ws-1": { total: 4, new: 1, qualified: 2, disqualified: 1 },
      "ws-2": { total: 2, new: 2, qualified: 0, disqualified: 0 },
    },
    prospects: [
      prospectWithPipeline({ id: "p1", workspace_id: "ws-1", stage: "sent" }),
      prospectWithPipeline({ id: "p2", workspace_id: "ws-1", stage: "replied", outcome: "won" }),
      prospectWithPipeline({ id: "p3", workspace_id: "ws-2", stage: "new" }),
    ],
  });
});

afterEach(cleanup);

describe("DashboardPage — access", () => {
  it("sends a signed-out visitor to login before querying anything", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(h.redirect).toHaveBeenCalledWith("/login");
    expect(h.getAccountWorkspaceEntries).not.toHaveBeenCalled();
  });
});

describe("DashboardPage — KPIs", () => {
  it("sums counts and usage across every workspace on the account", async () => {
    await renderPage();

    expect(screen.getByText("Businesses").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Products").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Prospects").nextElementSibling).toHaveTextContent("6");
    expect(screen.getByText("2 qualified · 3 new")).toBeInTheDocument();
    expect(screen.getByText("5 runs used")).toBeInTheDocument();
  });

  it("omits the prospect breakdown when the account has none yet", async () => {
    h.getAccountUsageAndProspects.mockResolvedValue({
      usageByWorkspace: { "ws-1": { totalRuns: 1, totalCost: 0 } },
      countsByWorkspace: { "ws-1": { total: 0, new: 0, qualified: 0, disqualified: 0 } },
      prospects: [],
    });

    await renderPage();

    expect(screen.getByText("Prospects").nextElementSibling).toHaveTextContent("0");
    expect(screen.queryByText(/qualified ·/)).not.toBeInTheDocument();
    expect(screen.getByText("1 run used")).toBeInTheDocument();
  });

  it("scales the free-tier credit allowance by the number of workspaces", async () => {
    await renderPage();

    // 0.75 spent against 2 workspaces' worth of the free monthly cap
    const credits = screen.getByText("AI credits (month)").nextElementSibling!;
    expect(credits.textContent).toMatch(/^\d+%$/);
  });

  it("reuses the two cache()-wrapped account queries once each", async () => {
    await renderPage();

    expect(h.getAccountWorkspaceEntries).toHaveBeenCalledExactlyOnceWith("acct-1");
    expect(h.getAccountUsageAndProspects).toHaveBeenCalledExactlyOnceWith("acct-1");
  });
});

describe("DashboardPage — conversion slice", () => {
  it("funnels every prospect on the account when unfiltered", async () => {
    await renderPage();

    expect(screen.getByText("Total prospects").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Customers (won)").nextElementSibling).toHaveTextContent("1");
    expect(screen.queryByRole("link", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("narrows to one business and offers a way back", async () => {
    await renderPage({ business: "biz-1" });

    expect(screen.getByText("Total prospects").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByLabelText("Business")).toHaveValue("biz-1");
  });

  it("narrows to one product", async () => {
    await renderPage({ product: "prod-2" });

    expect(screen.getByText("Total prospects").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByLabelText("Product")).toHaveValue("prod-2");
  });

  it("lets a product filter win over a business filter that disagrees with it", async () => {
    // Only reachable from a hand-edited URL -- the form itself can't offer a product
    // outside the chosen business -- but the slice has to pick one, and the more
    // specific filter is the one that wins.
    await renderPage({ business: "biz-1", product: "prod-2" });

    expect(screen.getByText("Total prospects").nextElementSibling).toHaveTextContent("1");
  });

  it("limits the product options to the chosen business", async () => {
    await renderPage({ business: "biz-2" });

    const options = [...(screen.getByLabelText("Product") as HTMLSelectElement).options].map(
      (o) => o.textContent,
    );
    expect(options).toEqual(["All products", "Invoice Radar"]);
  });

  it("offers every product when no business is chosen", async () => {
    await renderPage();

    const options = [...(screen.getByLabelText("Product") as HTMLSelectElement).options].map(
      (o) => o.textContent,
    );
    expect(options).toEqual(["All products", "Returns Autopilot", "Invoice Radar"]);
  });

  it("points a brand-new account at the business switcher instead of an empty funnel", async () => {
    h.getAccountWorkspaceEntries.mockResolvedValue({
      businesses: [],
      allProducts: [],
      entries: [],
    });
    h.getAccountUsageAndProspects.mockResolvedValue({
      usageByWorkspace: {},
      countsByWorkspace: {},
      prospects: [],
    });

    await renderPage();

    expect(screen.getByText(/Use the business switcher in the sidebar/)).toBeInTheDocument();
    expect(screen.queryByText("Total prospects")).not.toBeInTheDocument();
  });
});
