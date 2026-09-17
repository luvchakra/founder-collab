// @vitest-environment jsdom
/**
 * A business's product list doubles as a progress board: each card says whether the
 * product has a profile, an ICP and any prospects, which is derived per product from
 * three different places (the product row itself, the ICP query, the prospect counts) and
 * has to survive a product whose workspace doesn't exist yet without failing the page.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { business, product, productProfile, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  listProducts: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  getProspectCounts: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  listProducts: h.listProducts,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("@cofounderai/module-discovery/lib/prospects/queries", () => ({
  getProspectCounts: h.getProspectCounts,
}));
vi.mock("@/app/(dashboard)/dashboard/actions", () => ({ createProductAction: vi.fn() }));
vi.mock("./actions", () => ({
  renameBusinessAction: vi.fn(),
  updateBusinessDescriptionAction: vi.fn(),
}));

const { default: BusinessPage } = await import("./page");

const renderPage = () =>
  BusinessPage({ params: Promise.resolve({ businessId: "biz-1" }) }).then(render);

const productCard = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusiness.mockResolvedValue(business());
  h.listProducts.mockResolvedValue([product()]);
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.getIcpProfile.mockResolvedValue(null);
  h.getProspectCounts.mockResolvedValue({ total: 0, new: 0, qualified: 0, disqualified: 0 });
});

afterEach(cleanup);

describe("BusinessPage", () => {
  it("404s on a business the viewer cannot see", async () => {
    h.getBusiness.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.listProducts).not.toHaveBeenCalled();
  });

  it("invites a first product when the business has none", async () => {
    h.listProducts.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText("Create a product to get its own GTM workspace.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("links each product card at its own route", async () => {
    await renderPage();

    expect(within(productCard("Returns Autopilot")).getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1/products/prod-1",
    );
  });

  it("shows a fresh product as having nothing done yet", async () => {
    await renderPage();

    const card = productCard("Returns Autopilot");
    expect(within(card).getByText("No profile")).toBeInTheDocument();
    expect(within(card).getByText("No ICP")).toBeInTheDocument();
    expect(within(card).getByText("0 prospects")).toBeInTheDocument();
  });

  it("marks off each step the product has completed", async () => {
    h.listProducts.mockResolvedValue([product({ product_profile: productProfile() })]);
    h.getIcpProfile.mockResolvedValue({ id: "icp-1" });
    h.getProspectCounts.mockResolvedValue({ total: 1, new: 1, qualified: 0, disqualified: 0 });

    await renderPage();

    const card = productCard("Returns Autopilot");
    expect(within(card).getByText("Profile ready")).toBeInTheDocument();
    expect(within(card).getByText("ICP defined")).toBeInTheDocument();
    expect(within(card).getByText("1 prospect")).toBeInTheDocument();
  });

  it("still renders a product whose workspace hasn't been created yet", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await renderPage();

    expect(h.getIcpProfile).not.toHaveBeenCalled();
    expect(h.getProspectCounts).not.toHaveBeenCalled();
    const card = productCard("Returns Autopilot");
    expect(within(card).getByText("No ICP")).toBeInTheDocument();
    expect(within(card).getByText("0 prospects")).toBeInTheDocument();
  });

  it("shows a product description only when there is one", async () => {
    h.listProducts.mockResolvedValue([
      product({ description: "Automates return approvals" }),
      product({ id: "prod-2", name: "Invoice Radar" }),
    ]);

    await renderPage();

    expect(within(productCard("Returns Autopilot")).getByText("Automates return approvals")).toBeInTheDocument();
    expect(within(productCard("Invoice Radar")).queryByText(/Automates/)).not.toBeInTheDocument();
  });

  it("breadcrumbs back to the dashboard", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
  });

  it("offers a create-product form asking only for a name and website", async () => {
    await renderPage();

    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Website")).not.toBeRequired();
    expect(screen.getByRole("button", { name: "Create product" })).toBeInTheDocument();
  });
});
