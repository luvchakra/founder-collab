import { beforeEach, describe, expect, it, vi } from "vitest";

/** PRIV-2: the download is the signed-in user's own data, and only theirs. */

const h = vi.hoisted(() => ({ getUser: vi.fn(), build: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("@cofounderai/core/privacy/export", () => ({ buildPersonalDataExport: h.build }));

const { GET } = await import("./route");

beforeEach(() => vi.clearAllMocks());

describe("GET /dashboard/settings/profile/export", () => {
  it("refuses without a session", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(h.build).not.toHaveBeenCalled();
  });

  it("exports the session user's data as an uncached JSON download", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    h.build.mockResolvedValue({ account: { id: "user-1" } });

    const response = await GET();

    expect(h.build).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(await response.text())).toEqual({ account: { id: "user-1" } });
  });
});
