// @vitest-environment jsdom
/**
 * The product overview is the AI pipeline's entry point: nothing can be generated until
 * there is at least one knowledge source, so the Generate button stays disabled until
 * then, and once a profile exists the same form regenerates it — carrying the `force`
 * flag that tells the action to overwrite rather than reuse the cached run. The profile's
 * optional list fields are each omitted when empty rather than rendered as a blank row.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { product, productProfile, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProductKnowledge: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/knowledge/queries", () => ({
  listProductKnowledge: h.listProductKnowledge,
}));
vi.mock("./actions", () => ({
  addFileSourceAction: vi.fn(),
  deleteSourceAction: vi.fn(),
  generateProductProfileAction: vi.fn(),
  updateProductDescriptionAction: vi.fn(),
  updateProductWebsiteAction: vi.fn(),
  updateSourceAction: vi.fn(),
}));

const { default: ProductPage } = await import("./page");

const renderPage = () =>
  ProductPage({ params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }) }).then(render);

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: "src-1",
    workspace_id: "ws-1",
    source_name: "Landing page",
    source_type: "url",
    content: "We automate returns.",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product());
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.listProductKnowledge.mockResolvedValue([]);
});

afterEach(cleanup);

describe("ProductPage — tenancy", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other" }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.listProductKnowledge).not.toHaveBeenCalled();
  });
});

describe("ProductPage — profile generation", () => {
  it("refuses to generate before there is a source to read", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: "Generate profile" })).toBeDisabled();
    expect(screen.getByText("Add a knowledge source below first.")).toBeInTheDocument();
  });

  it("enables generation once a source exists", async () => {
    h.listProductKnowledge.mockResolvedValue([source()]);

    await renderPage();

    expect(screen.getByRole("button", { name: "Generate profile" })).toBeEnabled();
    expect(
      screen.getByText(/Not generated yet\./),
    ).toBeInTheDocument();
  });

  it("switches to Regenerate and forces a fresh run once a profile exists", async () => {
    h.getProduct.mockResolvedValue(product({ product_profile: productProfile() }));
    h.listProductKnowledge.mockResolvedValue([source()]);

    const { container } = await renderPage();

    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(container.querySelector('input[name="force"]')).toHaveValue("true");
  });

  it("does not force a run when there is nothing to overwrite", async () => {
    h.listProductKnowledge.mockResolvedValue([source()]);

    const { container } = await renderPage();

    expect(container.querySelector('input[name="force"]')).toBeNull();
  });
});

describe("ProductPage — profile display", () => {
  beforeEach(() => {
    h.listProductKnowledge.mockResolvedValue([source()]);
  });

  it("renders every field the AI returned", async () => {
    h.getProduct.mockResolvedValue(product({ product_profile: productProfile() }));

    await renderPage();

    expect(screen.getByText("B2B SaaS - returns automation")).toBeInTheDocument();
    expect(screen.getByText("Shops approve every return by hand")).toBeInTheDocument();
    expect(screen.getByText("policy rules")).toBeInTheDocument();
    expect(screen.getByText("E-commerce")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("says so when the sources never mentioned pricing", async () => {
    h.getProduct.mockResolvedValue(product({ product_profile: productProfile() }));

    await renderPage();

    expect(screen.getByText("Not mentioned in sources")).toBeInTheDocument();
  });

  it("shows the pricing summary when there is one", async () => {
    h.getProduct.mockResolvedValue(
      product({ product_profile: productProfile({ pricing_summary: "$49/month" }) }),
    );

    await renderPage();

    expect(screen.getByText("$49/month")).toBeInTheDocument();
  });

  it("omits the optional list sections that came back empty", async () => {
    h.getProduct.mockResolvedValue(
      product({
        product_profile: productProfile({
          features: [],
          differentiators: [],
          target_industries: [],
          target_roles: [],
          use_cases: [],
        }),
      }),
    );

    await renderPage();

    for (const label of ["Features", "Differentiators", "Target industries", "Target roles", "Use cases"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // the always-present fields stay
    expect(screen.getByText("Category")).toBeInTheDocument();
  });
});

describe("ProductPage — knowledge sources", () => {
  it("says there are none yet", async () => {
    await renderPage();

    expect(screen.getByText("No sources yet.")).toBeInTheDocument();
  });

  it("lists each source it has", async () => {
    h.listProductKnowledge.mockResolvedValue([
      source(),
      source({ id: "src-2", source_name: "Pitch deck", source_type: "file" }),
    ]);

    await renderPage();

    expect(screen.getByText("Landing page")).toBeInTheDocument();
    expect(screen.getByText("Pitch deck")).toBeInTheDocument();
  });

  it("offers a file upload limited to readable document types", async () => {
    const { container } = await renderPage();

    // the upload form is collapsed until asked for
    expect(container.querySelector('input[type="file"]')).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add a file" }));

    const file = container.querySelector('input[type="file"]')!;
    expect(file).toHaveAttribute("accept", ".pdf,.doc,.docx,.txt,.md,image/*");
    expect(file).toBeRequired();
  });
});
