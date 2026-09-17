/**
 * Discovery's clients are thin wrappers that bake in the schema, which is the whole
 * point: 00-MASTER-PLAN.md §4 gives each module its own Postgres schema, and a wrapper
 * that forgot it would silently query `public` instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCoreClient } = vi.hoisted(() => ({ createCoreClient: vi.fn(() => ({ marker: "server" })) }));
const { createCoreBrowserClient } = vi.hoisted(() => ({
  createCoreBrowserClient: vi.fn(() => ({ marker: "browser" })),
}));
const { createCoreAdminClient } = vi.hoisted(() => ({
  createCoreAdminClient: vi.fn(() => ({ marker: "admin" })),
}));

vi.mock("@cofounderai/core/db/server", () => ({ createClient: createCoreClient }));
vi.mock("@cofounderai/core/db/client", () => ({ createClient: createCoreBrowserClient }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: createCoreAdminClient }));

const { createClient: createServer } = await import("./server");
const { createClient: createBrowser } = await import("./client");
const { createAdminClient } = await import("./admin");

beforeEach(() => vi.clearAllMocks());

describe("discovery db clients", () => {
  it("scopes the server client to the discovery schema", async () => {
    await expect(createServer()).resolves.toEqual({ marker: "server" });
    expect(createCoreClient).toHaveBeenCalledWith({ schema: "discovery" });
  });

  it("scopes the browser client to the discovery schema", () => {
    expect(createBrowser()).toEqual({ marker: "browser" });
    expect(createCoreBrowserClient).toHaveBeenCalledWith({ schema: "discovery" });
  });

  it("scopes the admin client to the discovery schema", () => {
    expect(createAdminClient()).toEqual({ marker: "admin" });
    expect(createCoreAdminClient).toHaveBeenCalledWith({ schema: "discovery" });
  });
});
