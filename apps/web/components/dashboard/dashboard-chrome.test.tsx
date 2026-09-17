// @vitest-environment jsdom
/**
 * End-to-end wiring of licensing enforcement layer 4: the layout hands down every
 * business's entitlements, this component picks the active business out of the URL, and
 * the nav is built from that. The behaviour worth pinning is the switch — the same module
 * is a real link under a business that licensed it and an upsell under one that did not,
 * with no server round trip in between.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

vi.mock("@cofounderai/module-discovery/components/tenancy/create-business-modal", () => ({
  CreateBusinessModal: () => <div data-testid="create-business-modal" />,
}));
vi.mock("@cofounderai/module-discovery/components/chat/ai-chat-widget", () => ({
  AiChatWidget: () => <div data-testid="chat-widget" />,
}));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

const { DashboardChrome } = await import("./dashboard-chrome");

const MODULES = [
  { key: "discovery", name: "Discovery", icon: "Target", routePrefix: "/discovery" },
  { key: "inventory", name: "Inventory", icon: "Package", routePrefix: "/inventory" },
];
const BUSINESSES = [
  { id: "biz-1", name: "Acme Co" },
  { id: "biz-2", name: "Beta Co" },
];
const LICENSED = { "biz-1": ["discovery", "inventory"], "biz-2": ["discovery"] };

function renderChrome(props: Record<string, unknown> = {}) {
  return render(
    <DashboardChrome
      modules={MODULES}
      licensedByBusiness={LICENSED}
      businesses={BUSINESSES}
      accountId="acct-1"
      user={{ name: "Ada", email: "ada@example.com" }}
      createBusinessAction={vi.fn()}
      {...props}
    >
      <p>page body</p>
    </DashboardChrome>,
  );
}

/** The drawer only renders once open, so open it before inspecting the nav. */
function openDrawer() {
  act(() => screen.getByRole("button", { name: "Open sidebar" }).click());
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathname.mockReturnValue("/dashboard");
});

afterEach(cleanup);

describe("DashboardChrome", () => {
  it("renders the page body", () => {
    renderChrome();

    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("links every module normally on /dashboard, where no business is selected", () => {
    usePathname.mockReturnValue("/dashboard");
    renderChrome();
    openDrawer();

    for (const link of screen.getAllByRole("link", { name: /Discovery|Inventory/ })) {
      expect(link).toHaveAttribute("data-licensed", "true");
    }
  });

  it("upsells a module the active business has not licensed", () => {
    usePathname.mockReturnValue("/dashboard/businesses/biz-2/products/p1/prospects");
    renderChrome();
    openDrawer();

    expect(screen.getByRole("link", { name: /Discovery/ })).toHaveAttribute("data-licensed", "true");
    expect(screen.getByRole("link", { name: /Inventory/ })).toHaveAttribute("data-licensed", "false");
  });

  it("links the same module normally under a business that did license it", () => {
    usePathname.mockReturnValue("/dashboard/businesses/biz-1/products/p1/prospects");
    renderChrome();
    openDrawer();

    const link = screen.getByRole("link", { name: /Inventory/ });
    expect(link).toHaveAttribute("data-licensed", "true");
    expect(link).toHaveAttribute("href", "/inventory");
  });

  it("upsells everything for an active business with no entitlements at all", () => {
    usePathname.mockReturnValue("/dashboard/businesses/biz-3/overview");
    renderChrome();
    openDrawer();

    for (const link of screen.getAllByRole("link", { name: /Discovery|Inventory/ })) {
      expect(link).toHaveAttribute("data-licensed", "false");
    }
  });

  it("defaults to no entitlement information rather than crashing when none is passed", () => {
    usePathname.mockReturnValue("/dashboard/businesses/biz-1/overview");
    renderChrome({ licensedByBusiness: undefined });
    openDrawer();

    // No map means the active business has licensed nothing that we know of.
    expect(screen.getByRole("link", { name: /Inventory/ })).toHaveAttribute("data-licensed", "false");
  });

  it("marks the active business in the drawer", () => {
    usePathname.mockReturnValue("/dashboard/businesses/biz-2/overview");
    renderChrome();
    openDrawer();

    expect(
      screen.getByRole("link", { name: /Beta Co/ }).classList.contains("font-medium"),
    ).toBe(true);
  });

  it("tolerates a null pathname", () => {
    usePathname.mockReturnValue(null);

    expect(() => renderChrome()).not.toThrow();
  });
});
