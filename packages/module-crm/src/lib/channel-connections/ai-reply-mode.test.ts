import { beforeEach, describe, expect, it, vi } from "vitest";

// PLATFORM-P1-12.5/12.6: changing how WhatsApp AI replies go out needs the CRM licence and
// channel_connections.manage (checked here, and again by the database), and is audited.

const state = vi.hoisted(() => ({ current: "draft" as string | null, updates: [] as Record<string, unknown>[] }));

vi.mock("../../db/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => {
      const b: Record<string, unknown> = {};
      const self = () => b;
      b.select = self;
      b.eq = self;
      b.maybeSingle = async () => ({ data: state.current === null ? null : { ai_reply_mode: state.current }, error: null });
      b.update = (row: Record<string, unknown>) => {
        state.updates.push(row);
        b.select = async () => ({ data: [{ id: "cc-1" }], error: null });
        return b;
      };
      return b;
    },
  }),
}));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn(async () => undefined) }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn(async () => undefined) }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: vi.fn(async () => "audit-1") }));
vi.mock("@cofounderai/core/crypto/api-key", () => ({ encryptApiKey: (v: string) => v }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("../whatsapp/cloud-api-adapter", () => ({ whatsAppCloudApiAdapter: {} }));

import { setWhatsAppAiReplyMode } from "./mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";

beforeEach(() => {
  state.current = "draft";
  state.updates = [];
  vi.mocked(writeAuditLog).mockClear();
});

describe("setWhatsAppAiReplyMode", () => {
  it("is refused without the CRM licence", async () => {
    vi.mocked(requireModule).mockRejectedValueOnce(new Error("MODULE_NOT_LICENSED"));
    await expect(setWhatsAppAiReplyMode("biz-1", "cc-1", "auto")).rejects.toThrow("MODULE_NOT_LICENSED");
    expect(state.updates).toHaveLength(0);
  });

  it("is refused without channel_connections.manage", async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error("You don't have permission to do this (channel_connections.manage)."));
    await expect(setWhatsAppAiReplyMode("biz-1", "cc-1", "auto")).rejects.toThrow("channel_connections.manage");
    expect(requirePermission).toHaveBeenLastCalledWith("biz-1", "channel_connections.manage");
    expect(state.updates).toHaveLength(0);
  });

  it("only accepts the two modes", async () => {
    expect(await setWhatsAppAiReplyMode("biz-1", "cc-1", "always")).toEqual({ ok: false, error: "Choose Draft for review or Send automatically." });
    expect(state.updates).toHaveLength(0);
  });

  it("turns on Send automatically and audits the change", async () => {
    expect(await setWhatsAppAiReplyMode("biz-1", "cc-1", "auto")).toEqual({ ok: true });
    expect(state.updates).toEqual([{ ai_reply_mode: "auto" }]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz-1", actorId: "user-1", action: "crm_channel_connection.ai_reply_mode_changed", before: { ai_reply_mode: "draft" }, after: { ai_reply_mode: "auto" } }),
    );
  });

  it("doesn't write or audit when nothing changes, and reports a missing connection", async () => {
    expect(await setWhatsAppAiReplyMode("biz-1", "cc-1", "draft")).toEqual({ ok: true });
    expect(writeAuditLog).not.toHaveBeenCalled();
    state.current = null;
    expect(await setWhatsAppAiReplyMode("biz-1", "cc-other", "auto")).toEqual({ ok: false, error: "This WhatsApp connection wasn't found." });
  });
});
