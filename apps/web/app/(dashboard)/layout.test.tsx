// @vitest-environment jsdom
/**
 * The dashboard shell is where licensing enforcement layer 4 is wired (00-MASTER-PLAN.md):
 * nav is built from module-registry filtered by the account's entitlements, loaded here
 * once for every business so switching business needs no round trip. Two things about
 * that query are load-bearing and easy to erode — it must be scoped to this account's
 * businesses, and it must count 'grace' as licensed, because ADR-9's grace window keeps
 * read access alive. The layout also guards the whole route group: no user, no render.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  opArgs,
  type FakeSupabase,
} from "@cofounderai/core/test-support/fake-supabase";
import { workspaceEntry } from "@/test-support/fixtures";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentAccount: vi.fn(),
  getAccountWorkspaceEntries: vi.fn(),
  getAccountUsageAndProspects: vi.fn(),
  deriveAccountAlerts: vi.fn(),
  createBusinessAction: vi.fn(),
  chrome: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getCurrentAccount: h.getCurrentAccount,
}));
vi.mock("@cofounderai/module-discovery/lib/dashboard/queries", () => ({
  getAccountWorkspaceEntries: h.getAccountWorkspaceEntries,
  getAccountUsageAndProspects: h.getAccountUsageAndProspects,
}));
vi.mock("@cofounderai/module-discovery/lib/alerts/derive", () => ({
  deriveAccountAlerts: h.deriveAccountAlerts,
}));
vi.mock("@cofounderai/module-registry", () => ({
  moduleRegistry: [{ key: "discovery", name: "Discovery", icon: "target", routePrefix: "/dashboard" }],
}));
vi.mock("@/app/(dashboard)/dashboard/actions", () => ({
  createBusinessAction: h.createBusinessAction,
}));
vi.mock("@/components/dashboard/dashboard-chrome", () => ({
  // Record the assembled props; the chrome itself has its own test.
  DashboardChrome: (props: Record<string, unknown>) => {
    h.chrome(props);
    return <div data-testid="chrome">{props.children as React.ReactNode}</div>;
  },
}));

const { default: DashboardLayout } = await import("./layout");

const ENTRY = workspaceEntry();
const USER = {
  id: "u1",
  email: "ada@example.com",
  user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://cdn.example/ada.png" },
};

let licenseClient: FakeSupabase;

function mockClients(licenses: { business_id: string; module_key: string }[] | null = []) {
  const authClient = Object.assign(createFakeSupabase({}), {
    auth: { getUser: async () => ({ data: { user: USER } }) },
  });
  licenseClient = createFakeSupabase({ query: () => ({ data: licenses, error: null }) });
  h.createClient.mockImplementation(async (options?: { schema?: string }) =>
    options?.schema === "core" ? licenseClient : authClient,
  );
  return { authClient, licenseClient };
}

const chromeProps = () => h.chrome.mock.calls.at(-1)![0] as Record<string, never>;

const renderLayout = () =>
  DashboardLayout({ children: <p>page body</p> }).then(render);

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1", name: "Ada" });
  h.getAccountWorkspaceEntries.mockResolvedValue({
    businesses: [ENTRY.business],
    entries: [ENTRY],
  });
  h.getAccountUsageAndProspects.mockResolvedValue({ usageByWorkspace: {}, prospects: [] });
  h.deriveAccountAlerts.mockReturnValue([{ id: "a1", message: "Credits running low" }]);
  mockClients();
});

afterEach(cleanup);

describe("DashboardLayout — access", () => {
  it("sends a signed-out visitor to login", async () => {
    h.createClient.mockResolvedValue(
      Object.assign(createFakeSupabase({}), {
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    );

    await expect(renderLayout()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("renders the page inside the shell for a signed-in user", async () => {
    const { getByTestId } = await renderLayout();

    expect(getByTestId("chrome")).toHaveTextContent("page body");
  });
});

describe("DashboardLayout — licensing layer 4", () => {
  it("loads licences for exactly this account's businesses, counting grace as licensed", async () => {
    await renderLayout();

    const call = licenseClient.queries("licenses")[0]!;
    const filters = call.ops.filter((op) => op.method === "in").map((op) => op.args);
    expect(filters).toEqual([
      ["business_id", [ENTRY.business.id]],
      ["status", ["active", "grace"]],
    ]);
    expect(opArgs(call, "select")![0]).toContain("module_key");
  });

  it("groups the licence rows by business for the nav", async () => {
    mockClients([
      { business_id: "biz-1", module_key: "discovery" },
      { business_id: "biz-1", module_key: "inventory" },
      { business_id: "biz-9", module_key: "fsm" },
    ]);

    await renderLayout();

    expect(chromeProps().licensedByBusiness).toEqual({
      "biz-1": ["discovery", "inventory"],
      "biz-9": ["fsm"],
    });
  });

  it("treats a business with no licence rows as owning nothing", async () => {
    await renderLayout();

    expect(chromeProps().licensedByBusiness).toEqual({});
  });

  it("survives a licence query that returns nothing at all", async () => {
    mockClients(null);

    await renderLayout();

    expect(chromeProps().licensedByBusiness).toEqual({});
  });

  it("skips the licence query entirely for an account with no businesses", async () => {
    h.getAccountWorkspaceEntries.mockResolvedValue({ businesses: [], entries: [] });

    await renderLayout();

    expect(licenseClient.queries("licenses")).toHaveLength(0);
    expect(chromeProps().licensedByBusiness).toEqual({});
  });

  it("passes the module registry through as the nav's source", async () => {
    await renderLayout();

    expect(chromeProps().modules).toEqual([
      { key: "discovery", name: "Discovery", icon: "target", routePrefix: "/dashboard" },
    ]);
  });
});

describe("DashboardLayout — account and identity", () => {
  it("skips the account queries for a user with no account row yet", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await renderLayout();

    expect(h.getAccountWorkspaceEntries).not.toHaveBeenCalled();
    expect(h.getAccountUsageAndProspects).not.toHaveBeenCalled();
    expect(chromeProps().accountId).toBe("");
    expect(chromeProps().businesses).toEqual([]);
  });

  it("prefers full_name for the display name", async () => {
    await renderLayout();

    expect(chromeProps().user).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://cdn.example/ada.png",
    });
  });

  it("falls back through name, then email, then 'Founder'", async () => {
    const cases: [Record<string, unknown> | undefined, string | undefined, string][] = [
      [{ name: "Ada" }, "ada@example.com", "Ada"],
      [{}, "ada@example.com", "ada@example.com"],
      [undefined, undefined, "Founder"],
    ];

    for (const [metadata, email, expected] of cases) {
      cleanup();
      h.createClient.mockImplementation(async (options?: { schema?: string }) =>
        options?.schema === "core"
          ? licenseClient
          : Object.assign(createFakeSupabase({}), {
              auth: {
                getUser: async () => ({
                  data: { user: { id: "u1", email, user_metadata: metadata } },
                }),
              },
            }),
      );

      await renderLayout();

      expect(chromeProps().user).toMatchObject({ name: expected, email: email ?? "" });
    }
  });

  it("uses the Google profile picture when there is no uploaded avatar", async () => {
    h.createClient.mockImplementation(async (options?: { schema?: string }) =>
      options?.schema === "core"
        ? licenseClient
        : Object.assign(createFakeSupabase({}), {
            auth: {
              getUser: async () => ({
                data: {
                  user: { id: "u1", email: "ada@example.com", user_metadata: { picture: "https://lh3/ada" } },
                },
              }),
            },
          }),
    );

    await renderLayout();

    expect(chromeProps().user).toMatchObject({ avatarUrl: "https://lh3/ada" });
  });

  it("derives the header alerts from the account's own entries and usage", async () => {
    await renderLayout();

    expect(h.deriveAccountAlerts).toHaveBeenCalledWith({
      entries: [ENTRY],
      usageByWorkspace: {},
      prospects: [],
    });
    expect(chromeProps().alerts).toEqual([{ id: "a1", message: "Credits running low" }]);
  });
});
