// @vitest-environment jsdom
/**
 * The product shell is the tenancy boundary for everything under it: a product id that
 * belongs to a *different* business must 404 rather than render, which is the check that
 * stops /businesses/A/products/<B's product> from being a working URL. It also computes
 * the nav's completion ticks, which have to tolerate a workspace that doesn't exist yet.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { business, product, productProfile, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  getProspectCounts: vi.fn(),
  productNav: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("@cofounderai/module-discovery/lib/prospects/queries", () => ({
  getProspectCounts: h.getProspectCounts,
}));
vi.mock("@cofounderai/module-discovery/components/tenancy/product-nav", () => ({
  ProductNav: (props: Record<string, unknown>) => {
    h.productNav(props);
    return <nav data-testid="product-nav" />;
  },
}));
vi.mock("./actions", () => ({ renameProductAction: vi.fn() }));

const { default: ProductLayout } = await import("./layout");

const renderLayout = () =>
  ProductLayout({
    children: <p>tab body</p>,
    params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }),
  }).then(render);

const navProps = () => h.productNav.mock.calls.at(-1)![0] as { basePath: string; completed: Record<string, boolean> };

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusiness.mockResolvedValue(business());
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.getIcpProfile.mockResolvedValue(null);
  h.getProspectCounts.mockResolvedValue({ total: 0, new: 0, qualified: 0, disqualified: 0 });
});

afterEach(cleanup);

describe("ProductLayout — tenancy", () => {
  it("404s a product that belongs to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderLayout()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a product that does not exist", async () => {
    h.getProduct.mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the business itself is out of reach", async () => {
    h.getBusiness.mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("ProductLayout — shell", () => {
  it("renders the tab body inside the product chrome", async () => {
    await renderLayout();

    expect(screen.getByText("tab body")).toBeInTheDocument();
    expect(screen.getByTestId("product-nav")).toBeInTheDocument();
  });

  it("breadcrumbs dashboard → business → product", async () => {
    await renderLayout();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1",
    );
  });

  it("links the usage shortcut next to the product name", async () => {
    await renderLayout();

    expect(screen.getByRole("link", { name: "AI usage" })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1/products/prod-1/usage",
    );
  });

  it("shows the description only when the product has one", async () => {
    await renderLayout();
    expect(screen.queryByText("Automates return approvals")).not.toBeInTheDocument();

    cleanup();
    h.getProduct.mockResolvedValue(product({ description: "Automates return approvals" }));
    await renderLayout();
    expect(screen.getByText("Automates return approvals")).toBeInTheDocument();
  });
});

describe("ProductLayout — nav completion", () => {
  it("reports nothing done for a brand-new product", async () => {
    await renderLayout();

    expect(navProps()).toEqual({
      basePath: "/dashboard/businesses/biz-1/products/prod-1",
      completed: { overview: false, icp: false, prospects: false },
    });
  });

  it("ticks each step as it is completed", async () => {
    h.getProduct.mockResolvedValue(product({ product_profile: productProfile() }));
    h.getIcpProfile.mockResolvedValue({ id: "icp-1" });
    h.getProspectCounts.mockResolvedValue({ total: 3, new: 3, qualified: 0, disqualified: 0 });

    await renderLayout();

    expect(navProps().completed).toEqual({ overview: true, icp: true, prospects: true });
  });

  it("does not count an empty prospect list as progress", async () => {
    h.getProspectCounts.mockResolvedValue({ total: 0, new: 0, qualified: 0, disqualified: 0 });

    await renderLayout();

    expect(navProps().completed.prospects).toBe(false);
  });

  it("skips the workspace-scoped queries when there is no workspace yet", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await renderLayout();

    expect(h.getIcpProfile).not.toHaveBeenCalled();
    expect(h.getProspectCounts).not.toHaveBeenCalled();
    expect(navProps().completed).toEqual({ overview: false, icp: false, prospects: false });
  });
});
