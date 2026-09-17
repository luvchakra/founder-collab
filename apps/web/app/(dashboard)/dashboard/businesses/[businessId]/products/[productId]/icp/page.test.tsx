// @vitest-environment jsdom
/**
 * The ICP tab is a pipeline gate: it refuses to offer generation before the product
 * profile it would be generated *from* exists, and once an ICP exists it becomes an
 * editable form whose list fields are newline-delimited textareas (the action splits them
 * back apart). Approve only appears while the ICP is still a draft.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IcpProfile } from "@cofounderai/module-discovery/lib/icp/types";
import { product, productProfile, workspace } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("@cofounderai/module-discovery/lib/icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("./actions", () => ({
  generateIcpAction: vi.fn(),
  updateIcpAction: vi.fn(),
  approveIcpAction: vi.fn(),
}));

const { default: IcpPage } = await import("./page");

function icp(overrides: Partial<IcpProfile> = {}): IcpProfile {
  return {
    id: "icp-1",
    workspace_id: "ws-1",
    name: "DTC returns teams",
    description: "Small online stores drowning in returns",
    industries: ["E-commerce", "Retail"],
    company_sizes: ["10-50 employees"],
    geographies: ["US"],
    roles: ["Ops Manager"],
    pain_points: ["manual triage"],
    buying_signals: ["hiring support staff"],
    exclusions: ["enterprise"],
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const renderPage = () =>
  IcpPage({ params: Promise.resolve({ businessId: "biz-1", productId: "prod-1" }) }).then(render);

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(product({ product_profile: productProfile() }));
  h.getWorkspaceForProduct.mockResolvedValue(workspace());
  h.getIcpProfile.mockResolvedValue(icp());
});

afterEach(cleanup);

describe("IcpPage — prerequisites", () => {
  it("404s a product belonging to another business", async () => {
    h.getProduct.mockResolvedValue(product({ business_id: "biz-other", product_profile: productProfile() }));

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the product has no workspace", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends you to the Overview tab before there is a product profile", async () => {
    h.getProduct.mockResolvedValue(product());

    await renderPage();

    expect(
      screen.getByText("Generate a product profile on the Overview tab before defining an ICP."),
    ).toBeInTheDocument();
    expect(h.getIcpProfile).not.toHaveBeenCalled();
  });

  it("offers generation once the profile exists but no ICP does", async () => {
    h.getIcpProfile.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByRole("button", { name: "Generate ICP" })).toBeEnabled();
    expect(screen.queryByLabelText("Industries")).not.toBeInTheDocument();
  });
});

describe("IcpPage — editing an existing ICP", () => {
  it("pre-fills each list field one item per line", async () => {
    await renderPage();

    expect(screen.getByLabelText("Name")).toHaveValue("DTC returns teams");
    expect(screen.getByLabelText("Industries")).toHaveValue("E-commerce\nRetail");
    expect(screen.getByLabelText("Exclusions")).toHaveValue("enterprise");
    expect(screen.getByText("One item per line.")).toBeInTheDocument();
  });

  it("copes with an ICP that has no description", async () => {
    h.getIcpProfile.mockResolvedValue(icp({ description: null }));

    await renderPage();

    expect(screen.getByLabelText("Description")).toHaveValue("");
  });

  it("always offers a forced regeneration", async () => {
    const { container } = await renderPage();

    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(container.querySelector('input[name="force"]')).toHaveValue("true");
  });

  it("offers Approve while the ICP is a draft", async () => {
    await renderPage();

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("drops Approve once the ICP is approved", async () => {
    h.getIcpProfile.mockResolvedValue(icp({ status: "approved" }));

    await renderPage();

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});
