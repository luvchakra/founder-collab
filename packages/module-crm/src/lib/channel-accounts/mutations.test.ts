import { beforeEach, describe, expect, it, vi } from "vitest";

// CRM-SEC-CHANNELS-01: connecting, disconnecting and configuring a channel account (and
// creating or toggling a channel) need `channel_connections.manage`, checked before any
// write -- not only CRM membership.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireModule: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/crypto/api-key", () => ({ encryptApiKey: (v: string) => `enc:${v}` }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("../../db/server", () => ({
  createClient: async () => ({ from: h.from, auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) } }),
}));

const { connectChannelAccount, disconnectChannelAccount, setInstantReplyMode } = await import("./mutations");
const { createChannel, setChannelActive } = await import("../channels/mutations");

function chain(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "eq", "select"]) b[m] = vi.fn(() => b);
  b.insert = vi.fn(async () => ({ error: null }));
  b.maybeSingle = vi.fn(async () => ({ data: { id: "acc-1", provider: "instagram", instant_reply_mode: "off" }, error: null }));
  b.then = (resolve: (v: unknown) => void) => resolve(result);
  return b;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue(undefined);
  h.from.mockImplementation(() => chain({ data: [{ id: "x" }], error: null }));
});

const refuse = () => h.requirePermission.mockRejectedValue(new Error("FORBIDDEN"));

describe("channel configuration needs channel_connections.manage", () => {
  const calls: [string, () => Promise<void>][] = [
    ["connect an account", () => connectChannelAccount("biz-1", { channelId: "c", provider: "instagram", externalAccountId: "ig", accessToken: "t" })],
    ["disconnect an account", () => disconnectChannelAccount("biz-1", "acc-1")],
    ["set instant reply", () => setInstantReplyMode("biz-1", "acc-1", "off" as never)],
    ["create a channel", () => createChannel("biz-1", "social" as never, "Support")],
    ["toggle a channel", () => setChannelActive("biz-1", "chan-1", false)],
  ];

  it.each(calls)("refuses to %s without it, before touching the database", async (_label, run) => {
    refuse();
    await expect(run()).rejects.toThrow("FORBIDDEN");
    expect(h.from).not.toHaveBeenCalled();
  });

  it.each(calls)("checks the permission on the business when it is held (%s)", async (_label, run) => {
    await run();
    expect(h.requirePermission).toHaveBeenCalledWith("biz-1", "channel_connections.manage");
  });

  it("scopes an update to the caller's business, not just the row id", async () => {
    const b = chain({ data: [{ id: "acc-1" }], error: null });
    h.from.mockReturnValue(b);
    await disconnectChannelAccount("biz-1", "acc-1");
    expect(b.eq).toHaveBeenCalledWith("business_id", "biz-1");
  });
});
