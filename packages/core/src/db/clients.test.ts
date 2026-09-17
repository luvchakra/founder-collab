/**
 * The three Supabase client factories. What matters here is not that they construct
 * *something* but which credential each one uses: `admin.ts` takes the service-role key
 * and bypasses RLS entirely, so a regression that pointed it at the publishable key (or,
 * far worse, pointed a browser/server client at the service-role key) is the difference
 * between tenant isolation holding and not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Args typed explicitly: an inferred zero-arg mock gives `mock.calls` an empty tuple
// type, and every assertion below reads the url, key and options each factory was given.
type ClientOptions = {
  db?: { schema: string };
  auth?: { autoRefreshToken: boolean; persistSession: boolean };
  cookies?: {
    getAll: () => unknown;
    setAll: (cookies: { name: string; value: string; options?: unknown }[]) => void;
  };
};

const { createServerClient, createBrowserClient } = vi.hoisted(() => ({
  createServerClient: vi.fn((_url: string, _key: string, _options: ClientOptions) => ({
    marker: "server",
  })),
  createBrowserClient: vi.fn((_url: string, _key: string, _options: ClientOptions) => ({
    marker: "browser",
  })),
}));
const { createSupabaseClient } = vi.hoisted(() => ({
  createSupabaseClient: vi.fn((_url: string, _key: string, _options: ClientOptions) => ({
    marker: "admin",
  })),
}));
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient, createBrowserClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createSupabaseClient }));
vi.mock("next/headers", () => ({ cookies }));

const { createClient: createServer } = await import("./server");
const { createClient: createBrowser } = await import("./client");
const { createAdminClient } = await import("./admin");

const URL = "https://project.supabase.co";
const PUBLISHABLE = "publishable-key";
const SERVICE_ROLE = "service-role-key";

/** Stand-in for Next's cookie store. */
function cookieStore() {
  const store = { getAll: vi.fn(() => [{ name: "sb", value: "v" }]), set: vi.fn() };
  cookies.mockResolvedValue(store);
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE);
});

afterEach(() => vi.unstubAllEnvs());

describe("db/server createClient", () => {
  it("uses the publishable key, so RLS applies", async () => {
    cookieStore();

    await createServer();

    expect(createServerClient.mock.calls[0]!.slice(0, 2)).toEqual([URL, PUBLISHABLE]);
  });

  it("never uses the service-role key", async () => {
    cookieStore();

    await createServer();

    expect(JSON.stringify(createServerClient.mock.calls[0]!.slice(0, 2))).not.toContain(SERVICE_ROLE);
  });

  it("targets a module schema when one is given, and public by default", async () => {
    cookieStore();
    await createServer({ schema: "discovery" });
    expect(createServerClient.mock.calls[0]![2].db).toEqual({ schema: "discovery" });

    createServerClient.mockClear();
    cookieStore();
    await createServer();
    expect(createServerClient.mock.calls[0]![2].db).toBeUndefined();
  });

  it("reads cookies from Next's request-scoped store", async () => {
    const store = cookieStore();
    await createServer();

    const options = createServerClient.mock.calls[0]![2];
    expect(options.cookies!.getAll()).toEqual([{ name: "sb", value: "v" }]);
    expect(store.getAll).toHaveBeenCalled();
  });

  it("writes refreshed cookies back to that store", async () => {
    const store = cookieStore();
    await createServer();

    const options = createServerClient.mock.calls[0]![2];
    options.cookies!.setAll([{ name: "sb", value: "new", options: { path: "/" } }]);

    expect(store.set).toHaveBeenCalledWith("sb", "new", { path: "/" });
  });

  it("swallows a cookie write from a Server Component, where setting is not allowed", async () => {
    const store = cookieStore();
    store.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    await createServer();

    const options = createServerClient.mock.calls[0]![2];

    expect(() => options.cookies!.setAll([{ name: "sb", value: "v", options: {} }])).not.toThrow();
  });

  it("returns the constructed client", async () => {
    cookieStore();
    await expect(createServer()).resolves.toEqual({ marker: "server" });
  });
});

describe("db/client createClient", () => {
  it("uses the publishable key, never the service-role one", () => {
    createBrowser();

    expect(createBrowserClient.mock.calls[0]!.slice(0, 2)).toEqual([URL, PUBLISHABLE]);
  });

  it("targets a module schema when given, and public by default", () => {
    createBrowser({ schema: "inventory" });
    expect(createBrowserClient.mock.calls[0]![2].db).toEqual({ schema: "inventory" });

    createBrowserClient.mockClear();
    createBrowser();
    expect(createBrowserClient.mock.calls[0]![2].db).toBeUndefined();
  });

  it("returns the constructed client", () => {
    expect(createBrowser()).toEqual({ marker: "browser" });
  });
});

describe("db/admin createAdminClient", () => {
  it("uses the service-role key — this is the one client that bypasses RLS", () => {
    createAdminClient();

    expect(createSupabaseClient.mock.calls[0]!.slice(0, 2)).toEqual([URL, SERVICE_ROLE]);
  });

  it("disables session persistence and refresh, since it runs outside any user session", () => {
    createAdminClient();

    expect(createSupabaseClient.mock.calls[0]![2].auth).toEqual({
      autoRefreshToken: false,
      persistSession: false,
    });
  });

  it("targets a module schema when given, and public by default", () => {
    createAdminClient({ schema: "core" });
    expect(createSupabaseClient.mock.calls[0]![2].db).toEqual({ schema: "core" });

    createSupabaseClient.mockClear();
    createAdminClient();
    expect(createSupabaseClient.mock.calls[0]![2].db).toBeUndefined();
  });

  it("returns the constructed client", () => {
    expect(createAdminClient()).toEqual({ marker: "admin" });
  });
});
