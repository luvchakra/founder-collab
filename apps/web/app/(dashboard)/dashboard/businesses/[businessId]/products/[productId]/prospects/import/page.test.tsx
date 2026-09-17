// @vitest-environment jsdom
/**
 * CSV import is a paste box, not an upload, so the page's whole job is telling the
 * founder which column is required before they paste — the action rejects rows without
 * it, and this is the only place that contract is stated.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { product, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("./actions", () => ({ importProspectsAction: vi.fn() }));

const { default: ImportProspectsPage } = await import("./page");

const renderPage = () =>
  ImportProspectsPage({
    params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }),
  }).then(render);

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
});

afterEach(cleanup);

describe("ImportProspectsPage", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("names the one required column and the optional ones", async () => {
    await renderPage();

    expect(screen.getByText("company_name")).toBeInTheDocument();
    expect(
      screen.getByText("website, industry, company_size, location, description"),
    ).toBeInTheDocument();
  });

  it("requires something to be pasted, and shows the shape expected", async () => {
    await renderPage();

    const csv = screen.getByLabelText("CSV");
    expect(csv).toBeRequired();
    expect(csv).toHaveAttribute("name", "csv");
    expect(csv).toHaveAttribute(
      "placeholder",
      "company_name,website,industry\nAcme Inc,https://acme.com,Banking",
    );
  });

  it("links back to the prospect list", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "← Back to prospects" })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1/products/prod-1/prospects",
    );
  });
});
