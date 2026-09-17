// @vitest-environment jsdom
/**
 * The nav drawer is where licensing's fourth enforcement layer surfaces: CLAUDE.md's
 * architecture section says the UI is "built from module-registry filtered by
 * entitlements". The drawer itself renders whatever module list it is handed, so what is
 * pinned here is that contract — it lists exactly the modules given, never the full
 * catalogue on its own — plus the dismissal behaviour a drawer has to get right
 * (backdrop, Escape, navigating away) or it traps the founder.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/dashboard") }));
vi.mock("next/navigation", () => ({ usePathname }));

const { useSidebar } = vi.hoisted(() => ({ useSidebar: vi.fn() }));
vi.mock("./sidebar-context", () => ({ useSidebar }));

vi.mock("./sidebar-account-menu", () => ({
  SidebarAccountMenu: () => <div data-testid="account-menu" />,
}));

const { AppSidebar } = await import("./app-sidebar");

const MODULES = [
  { key: "discovery", name: "Discovery", icon: "Target", routePrefix: "/discovery" },
  { key: "inventory", name: "Inventory", icon: "Package", routePrefix: "/inventory" },
];
const BUSINESSES = [
  { id: "biz-1", name: "Acme Co" },
  { id: "biz-2", name: "Beta Co" },
];

let setOpen: ReturnType<typeof vi.fn>;

function renderSidebar(props: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
  return render(
    <AppSidebar
      modules={MODULES}
      businesses={BUSINESSES}
      activeBusinessId="biz-1"
      businessHref={(id) => `/dashboard/businesses/${id}`}
      user={{ name: "Ada", email: "ada@example.com" }}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setOpen = vi.fn();
  useSidebar.mockReturnValue({ open: true, setOpen });
  usePathname.mockReturnValue("/dashboard");
});

afterEach(cleanup);

describe("AppSidebar", () => {
  it("renders nothing at all while closed", () => {
    useSidebar.mockReturnValue({ open: false, setOpen });

    const { container } = renderSidebar();

    expect(container).toBeEmptyDOMElement();
  });

  it("lists exactly the modules it is handed, and links each to its route prefix", () => {
    renderSidebar();

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(screen.getByRole("link", { name: /Discovery/ })).toHaveAttribute("href", "/discovery");
    expect(screen.getByRole("link", { name: /Inventory/ })).toHaveAttribute("href", "/inventory");
    expect(nav).toBeInTheDocument();
  });

  it("shows no module a caller filtered out — the entitlement filter's contract", () => {
    renderSidebar({ modules: [MODULES[0]!] });

    expect(screen.getByRole("link", { name: /Discovery/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Inventory/ })).not.toBeInTheDocument();
  });

  it("renders no module links at all when handed an empty list", () => {
    renderSidebar({ modules: [] });

    for (const name of ["Discovery", "Inventory", "Service", "CRM", "GST"]) {
      expect(screen.queryByRole("link", { name: new RegExp(name) })).not.toBeInTheDocument();
    }
  });

  it("marks the module matching the current path as active", () => {
    usePathname.mockReturnValue("/inventory/products");
    renderSidebar();

    // classList, not a substring match: the base classes already carry
    // "hover:bg-sidebar-accent", which a substring check would mistake for the active state.
    expect(screen.getByRole("link", { name: /Inventory/ }).classList.contains("bg-sidebar-accent")).toBe(true);
    expect(screen.getByRole("link", { name: /Discovery/ }).classList.contains("bg-sidebar-accent")).toBe(false);
  });

  it("does not mark a module active on a path that merely shares its prefix as a substring", () => {
    usePathname.mockReturnValue("/inventoryzzz");
    renderSidebar();

    expect(screen.getByRole("link", { name: /Inventory/ }).classList.contains("bg-sidebar-accent")).toBe(false);
  });

  it("lists each business with the href the caller builds, marking the active one", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: /Acme Co/ })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1",
    );
    expect(screen.getByRole("link", { name: /Beta Co/ })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-2",
    );
    expect(screen.getByRole("link", { name: /Acme Co/ }).classList.contains("font-medium")).toBe(true);
    expect(screen.getByRole("link", { name: /Beta Co/ }).classList.contains("font-medium")).toBe(false);
  });

  it("shows an empty state rather than a bare list when there are no businesses", () => {
    renderSidebar({ businesses: [] });

    expect(screen.getByText("No businesses yet.")).toBeInTheDocument();
  });

  it("closes on the explicit close button", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("closes when the backdrop is clicked", () => {
    const { container } = renderSidebar();

    fireEvent.click(container.querySelector('[aria-hidden="true"]')!);

    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("closes on Escape", () => {
    renderSidebar();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("ignores other keys", () => {
    renderSidebar();

    fireEvent.keyDown(document, { key: "Enter" });

    expect(setOpen).not.toHaveBeenCalled();
  });

  it("stops listening for Escape once unmounted, so a closed drawer cannot swallow keys", () => {
    const { unmount } = renderSidebar();
    unmount();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(setOpen).not.toHaveBeenCalled();
  });

  it.each([
    ["a module link", /Discovery/],
    ["a business link", /Acme Co/],
  ])("closes after navigating via %s", (_label, name) => {
    renderSidebar();

    fireEvent.click(screen.getByRole("link", { name }));

    expect(setOpen).toHaveBeenCalledWith(false);
  });
});

/**
 * Licensing enforcement layer 4's rendering half: the drawer is handed entitlement
 * information by `buildNavModules` and must show an unlicensed module as an upsell --
 * "never as a broken link" (00-MASTER-PLAN.md) -- rather than hiding it or linking it
 * somewhere layer 2 would 404.
 */
describe("AppSidebar — unlicensed modules", () => {
  const LOCKED = [
    { key: "discovery", name: "Discovery", icon: "Target", routePrefix: "/discovery", licensed: true },
    {
      key: "inventory",
      name: "Inventory",
      icon: "Package",
      routePrefix: "/dashboard/settings/licenses",
      licensed: false,
    },
  ];

  it("still lists an unlicensed module rather than hiding it", () => {
    renderSidebar({ modules: LOCKED });

    expect(screen.getByRole("link", { name: /Inventory/ })).toBeInTheDocument();
  });

  it("sends an unlicensed module to the licences page, never to its own route", () => {
    renderSidebar({ modules: LOCKED });

    const link = screen.getByRole("link", { name: /Inventory/ });
    expect(link).toHaveAttribute("href", "/dashboard/settings/licenses");
    expect(link.getAttribute("href")).not.toContain("/inventory");
  });

  it("labels it as an upsell for assistive tech, not just visually", () => {
    renderSidebar({ modules: LOCKED });

    expect(
      screen.getByRole("link", { name: "Inventory — not licensed, view plans" }),
    ).toBeInTheDocument();
  });

  it("shows an Upgrade affordance on the locked entry only", () => {
    renderSidebar({ modules: LOCKED });

    expect(screen.getAllByText("Upgrade")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Inventory/ })).toHaveTextContent("Upgrade");
    expect(screen.getByRole("link", { name: /Discovery/ })).not.toHaveTextContent("Upgrade");
  });

  it("marks each entry's licence state in the DOM, so the state is assertable end to end", () => {
    renderSidebar({ modules: LOCKED });

    expect(screen.getByRole("link", { name: /Discovery/ })).toHaveAttribute("data-licensed", "true");
    expect(screen.getByRole("link", { name: /Inventory/ })).toHaveAttribute("data-licensed", "false");
  });

  it("never marks a locked entry active, even when the path matches its upsell href", () => {
    usePathname.mockReturnValue("/dashboard/settings/licenses");
    renderSidebar({ modules: LOCKED });

    expect(
      screen.getByRole("link", { name: /Inventory/ }).classList.contains("bg-sidebar-accent"),
    ).toBe(false);
  });

  it("treats an entry with no licensed flag as licensed, preserving the old behaviour", () => {
    renderSidebar({ modules: [{ key: "crm", name: "CRM", icon: "Inbox", routePrefix: "/crm" }] });

    const link = screen.getByRole("link", { name: /CRM/ });
    expect(link).toHaveAttribute("href", "/crm");
    expect(link).toHaveAttribute("data-licensed", "true");
    expect(link).not.toHaveTextContent("Upgrade");
  });
});
