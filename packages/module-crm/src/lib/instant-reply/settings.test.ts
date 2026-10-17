import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CRM-INSTANT-ACK-01 — the gates on the instant-reply settings: licence and
 * `channel_connections.manage` first, then only the offered modes, and the acknowledgement
 * only where it can be sent.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  account: null as Row | null,
  updates: [] as { table: string; values: Row }[],
  upserts: [] as Row[],
}));
const requireModule = vi.hoisted(() => vi.fn(async () => {}));
const requirePermission = vi.hoisted(() => vi.fn(async () => {}));
const writeAuditLog = vi.hoisted(() => vi.fn(async () => "audit-1"));

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from(table: string) {
      let values: Row | null = null;
      const api = {
        select: () => api,
        eq: () => api,
        update: (v: Row) => ((values = v), api),
        upsert: async (row: Row) => {
          state.upserts.push(row);
          return { error: null };
        },
        maybeSingle: async () => ({ data: state.account, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
          if (values) state.updates.push({ table, values });
          return resolve({ data: [{ id: "row-1" }], error: null });
        },
      };
      return api;
    },
  };
}

vi.mock("../../db/server", () => ({ createClient: async () => makeClient() }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog }));
vi.mock("@cofounderai/core/crypto/api-key", () => ({ encryptApiKey: (v: string) => v, decryptApiKey: (v: string) => v }));

const { setInstantReplyMode, disconnectChannelAccount } = await import("../channel-accounts/mutations");
const { setWhatsAppInstantReplyMode } = await import("../channel-connections/mutations");
const { saveInstantAckText } = await import("./settings");

beforeEach(() => {
  vi.clearAllMocks();
  state.account = { id: "acct-1", provider: "instagram", instant_reply_mode: "off" };
  state.updates = [];
  state.upserts = [];
});

describe("instant-reply settings", () => {
  it("requires the CRM licence and channel_connections.manage before changing a mode", async () => {
    requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (channel_connections.manage)."));
    await expect(setInstantReplyMode("biz-1", "acct-1", "instant_ack_then_human")).rejects.toThrow(/permission/);
    expect(requireModule).toHaveBeenCalledWith("biz-1", "crm");
    expect(requirePermission).toHaveBeenCalledWith("biz-1", "channel_connections.manage");
    expect(state.updates).toHaveLength(0);
  });

  it("turns the acknowledgement on for Instagram and audits the change", async () => {
    await setInstantReplyMode("biz-1", "acct-1", "instant_ack_then_human");
    expect(state.updates).toEqual([{ table: "channel_accounts", values: { instant_reply_mode: "instant_ack_then_human" } }]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "crm_channel_account.instant_reply_mode_changed", after: { instant_reply_mode: "instant_ack_then_human" } }),
    );
  });

  it("refuses the retired AI-drafts option and an unsupported provider", async () => {
    await expect(setInstantReplyMode("biz-1", "acct-1", "draft_approve")).rejects.toThrow(/isn't available/);
    state.account = { id: "acct-1", provider: "google_business_messages", instant_reply_mode: "off" };
    await expect(setInstantReplyMode("biz-1", "acct-1", "instant_ack_then_human")).rejects.toThrow(/isn't supported/);
    expect(state.updates).toHaveLength(0);
    // Turning it off is always allowed.
    await setInstantReplyMode("biz-1", "acct-1", "off");
    expect(state.updates).toHaveLength(1);
  });

  it("gates WhatsApp's mode and disconnecting the same way", async () => {
    await expect(setWhatsAppInstantReplyMode("biz-1", "conn-1", "draft_approve")).rejects.toThrow(/isn't available/);
    await setWhatsAppInstantReplyMode("biz-1", "conn-1", "instant_ack_then_human");
    expect(state.updates.at(-1)).toEqual({ table: "channel_connection", values: { instant_reply_mode: "instant_ack_then_human" } });
    await disconnectChannelAccount("biz-1", "acct-1");
    expect(requirePermission).toHaveBeenCalledTimes(3);
  });

  it("validates and saves the acknowledgement text", async () => {
    expect(await saveInstantAckText("biz-1", "   ")).toEqual({ ok: false, error: "Write the message to send." });
    expect(await saveInstantAckText("biz-1", "x".repeat(501))).toEqual({ ok: false, error: "Keep the message under 500 characters." });
    expect(state.upserts).toHaveLength(0);

    expect(await saveInstantAckText("biz-1", "  Thanks! We'll reply soon.  ")).toEqual({ ok: true });
    expect(state.upserts).toEqual([{ business_id: "biz-1", ack_text: "Thanks! We'll reply soon.", updated_by: "user-1" }]);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "crm_instant_reply.ack_text_changed" }));
  });
});
