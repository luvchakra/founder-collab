// @vitest-environment jsdom
/**
 * The licences screen is the human-facing half of ADR-9: cancelling never deletes, it
 * starts a 30-day read-only grace window, and reactivating before that window closes
 * restores everything. So the page has to distinguish four licence states plus "never
 * licensed" (the button says Activate the first time and Reactivate afterwards), and the
 * grace badge has to count down in whole days remaining rather than showing a date.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { License, LicenseStatus } from "@cofounderai/core/licensing/types";
import { moduleRegistry } from "@cofounderai/module-registry";
import { business } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  listBusinesses: vi.fn(),
  listLicensesForBusiness: vi.fn(),
  activateModuleAction: vi.fn(),
  deactivateModuleAction: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getCurrentAccount: h.getCurrentAccount,
  listBusinesses: h.listBusinesses,
}));
vi.mock("@cofounderai/core/licensing/queries", () => ({
  listLicensesForBusiness: h.listLicensesForBusiness,
}));
vi.mock("./actions", () => ({
  activateModuleAction: h.activateModuleAction,
  deactivateModuleAction: h.deactivateModuleAction,
}));

const { default: LicensesSettingsPage } = await import("./page");

const NOW = new Date("2026-03-01T00:00:00Z");

function license(overrides: Partial<License> & { status: LicenseStatus }): License {
  return {
    id: "lic-1",
    account_id: "acct-1",
    business_id: "biz-1",
    module_key: "discovery",
    activated_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    grace_ends_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const renderPage = () => LicensesSettingsPage().then(render);

/** The card for one module, found by its name in the registry. */
const moduleCard = (name: string) =>
  screen.getByText(name).closest("div.rounded-md") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1", name: "Ada" });
  h.listBusinesses.mockResolvedValue([business()]);
  h.listLicensesForBusiness.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("LicensesSettingsPage", () => {
  it("sends a signed-out visitor to login", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(h.listBusinesses).not.toHaveBeenCalled();
  });

  it("explains the 30-day grace window up front", async () => {
    await renderPage();

    expect(
      screen.getByText(/keeps your data for 30 days \(read-only\) before it fully expires/),
    ).toBeInTheDocument();
  });

  it("asks for a business before there is anything to license", async () => {
    h.listBusinesses.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText("Create a business first to manage its module licenses.")).toBeInTheDocument();
    expect(h.listLicensesForBusiness).not.toHaveBeenCalled();
  });

  it("lists every registered module for every business on the account", async () => {
    h.listBusinesses.mockResolvedValue([business(), business({ id: "biz-2", name: "Initech" })]);

    await renderPage();

    expect(h.listLicensesForBusiness).toHaveBeenCalledTimes(2);
    expect(h.listLicensesForBusiness).toHaveBeenCalledWith("biz-1");
    expect(h.listLicensesForBusiness).toHaveBeenCalledWith("biz-2");
    expect(screen.getByRole("heading", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Initech" })).toBeInTheDocument();
    for (const module of moduleRegistry) {
      expect(screen.getAllByText(module.name)).toHaveLength(2);
    }
  });

  it("offers Activate for a module that has never been licensed", async () => {
    await renderPage();

    const card = moduleCard("Discovery");
    expect(within(card).getByText("Not licensed")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(h.activateModuleAction.bind).toBeDefined();
  });

  it("offers Cancel for an active licence", async () => {
    h.listLicensesForBusiness.mockResolvedValue([license({ status: "active" })]);

    await renderPage();

    const card = moduleCard("Discovery");
    expect(within(card).getByText("Active")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("still offers Cancel during grace, counting the days left", async () => {
    h.listLicensesForBusiness.mockResolvedValue([
      license({ status: "grace", grace_ends_at: "2026-03-08T12:00:00Z" }),
    ]);

    await renderPage();

    const card = moduleCard("Discovery");
    expect(within(card).getByText("Grace period · 8d left")).toBeInTheDocument();
    // grace is still a licence (read-only), so the action available is cancel, not activate
    expect(within(card).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("never counts the grace window below zero once it has elapsed", async () => {
    h.listLicensesForBusiness.mockResolvedValue([
      license({ status: "grace", grace_ends_at: "2026-02-01T00:00:00Z" }),
    ]);

    await renderPage();

    expect(within(moduleCard("Discovery")).getByText("Grace period · 0d left")).toBeInTheDocument();
  });

  it("shows no days left for a grace licence with no end date recorded", async () => {
    h.listLicensesForBusiness.mockResolvedValue([license({ status: "grace" })]);

    await renderPage();

    expect(within(moduleCard("Discovery")).getByText("Grace period · 0d left")).toBeInTheDocument();
  });

  it("offers Reactivate — not Activate — once a licence has expired", async () => {
    h.listLicensesForBusiness.mockResolvedValue([license({ status: "expired" })]);

    await renderPage();

    const card = moduleCard("Discovery");
    expect(within(card).getByText("Expired")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("offers Reactivate for a cancelled licence", async () => {
    h.listLicensesForBusiness.mockResolvedValue([license({ status: "cancelled" })]);

    await renderPage();

    const card = moduleCard("Discovery");
    expect(within(card).getByText("Cancelled")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("keeps each module's state to itself", async () => {
    h.listLicensesForBusiness.mockResolvedValue([
      license({ status: "active", module_key: "discovery" }),
      license({ id: "lic-2", status: "cancelled", module_key: "inventory" }),
    ]);

    await renderPage();

    expect(within(moduleCard("Discovery")).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      within(moduleCard("Inventory")).getByRole("button", { name: "Reactivate" }),
    ).toBeInTheDocument();
    expect(within(moduleCard("Service")).getByRole("button", { name: "Activate" })).toBeInTheDocument();
  });
});
