// @vitest-environment jsdom
/**
 * The conversions tab computes its funnel from the prospect list the pipeline already
 * derives — no extra query — and separates "closed" (a conversation ended) from "won"
 * (the deal landed). Only the won ones are customers, and each links back to its prospect.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { product, prospectWithPipeline, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProspects: vi.fn(),
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
}));

const { default: ConversionsPage } = await import("./page");

const renderPage = () =>
  ConversionsPage({ params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }) }).then(render);

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.listProspects.mockResolvedValue([]);
});

afterEach(cleanup);

describe("ConversionsPage", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.listProspects).not.toHaveBeenCalled();
  });

  it("shows an empty funnel and no customers for a fresh workspace", async () => {
    await renderPage();

    expect(screen.getByText("Add prospects to see your conversion funnel.")).toBeInTheDocument();
    expect(screen.getByText(/No won deals yet/)).toBeInTheDocument();
  });

  it("counts only won deals as customers, not merely closed conversations", async () => {
    h.listProspects.mockResolvedValue([
      prospectWithPipeline({ id: "p1", company_name: "Globex", stage: "closed", outcome: "won" }),
      prospectWithPipeline({ id: "p2", company_name: "Initech", stage: "closed", outcome: "lost" }),
      prospectWithPipeline({ id: "p3", company_name: "Hooli", stage: "sent" }),
    ]);

    await renderPage();

    expect(screen.getByText("Customers (won)").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Total prospects").nextElementSibling).toHaveTextContent("3");
    const customers = screen.getByRole("list");
    expect(within(customers).getAllByRole("listitem")).toHaveLength(1);
    expect(within(customers).getByText("Globex")).toBeInTheDocument();
  });

  it("links each customer back to its prospect", async () => {
    h.listProspects.mockResolvedValue([
      prospectWithPipeline({ id: "p1", company_name: "Globex", stage: "closed", outcome: "won" }),
    ]);

    await renderPage();

    expect(screen.getByRole("link", { name: /Globex/ })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1/products/prod-1/prospects/p1",
    );
  });

  it("dates each customer from its last activity", async () => {
    h.listProspects.mockResolvedValue([
      prospectWithPipeline({
        id: "p1",
        company_name: "Globex",
        stage: "closed",
        outcome: "won",
        lastActivityAt: "2026-02-14T10:00:00Z",
      }),
    ]);

    await renderPage();

    expect(
      screen.getByText(`Closed ${new Date("2026-02-14T10:00:00Z").toLocaleDateString()}`),
    ).toBeInTheDocument();
  });
});
