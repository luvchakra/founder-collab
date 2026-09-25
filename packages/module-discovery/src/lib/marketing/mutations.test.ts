/**
 * MKT-01/05/08. The write layer's own guarantees, independent of the UI: licence and
 * permission are checked before anything is read or written; campaigns start as drafts;
 * a state change is refused server-side when the state machine forbids it; approving and
 * publishing need the approver's permission; published content pins the version that
 * went out; and a file whose extension and type disagree is refused before upload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow, type FakeSupabase, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLog: vi.fn(),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  requireUser: vi.fn(),
  order: [] as string[],
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("@cofounderai/core/attachments/mutations", () => ({
  uploadAttachment: h.uploadAttachment,
  deleteAttachment: h.deleteAttachment,
}));
vi.mock("../tenancy/queries", () => ({ requireUser: h.requireUser }));

const m = await import("./mutations");
const { campaignInputSchema, contentInputSchema } = await import("./schemas");

const BUSINESS = "11111111-1111-4111-8111-111111111111";
let fake: FakeSupabase;

function useFake(query: (call: RecordedQuery) => { data: unknown; error: unknown }) {
  fake = createFakeSupabase({
    query: (call) => {
      h.order.push(`query:${call.table}`);
      return query(call);
    },
  });
  h.createClient.mockResolvedValue(fake);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.requireModule.mockImplementation(async () => void h.order.push("requireModule"));
  h.requirePermission.mockImplementation(async (_b: string, key: string) => void h.order.push(`perm:${key}`));
  h.requireUser.mockResolvedValue({ id: "user-1" });
  h.writeAuditLog.mockResolvedValue("audit-1");
});

const campaign = campaignInputSchema.parse({ name: "Smart Home Awareness", objective: "awareness", channel: "linkedin" });

describe("createCampaign", () => {
  it("checks the Discovery licence, then the manage permission, before writing", async () => {
    useFake(() => ({ data: { id: "c1" }, error: null }));

    await m.createCampaign(BUSINESS, campaign);

    expect(h.order.slice(0, 3)).toEqual(["requireModule", "perm:marketing.manage", "query:marketing_campaigns"]);
    expect(h.requireModule).toHaveBeenCalledWith(BUSINESS, "discovery");
  });

  it("writes nothing when the licence check refuses", async () => {
    useFake(() => ({ data: { id: "c1" }, error: null }));
    h.requireModule.mockRejectedValueOnce(new Error("Discovery isn't licensed"));

    await expect(m.createCampaign(BUSINESS, campaign)).rejects.toThrow(/licensed/);
    expect(fake.calls).toHaveLength(0);
  });

  // "A campaign is not Active simply because it was created" (§9.3).
  it("always creates a draft, and scopes the row to the business", async () => {
    useFake(() => ({ data: { id: "c1" }, error: null }));

    await m.createCampaign(BUSINESS, campaign);

    const row = writtenRow(fake.queries("marketing_campaigns")[0]!);
    expect(row).toMatchObject({ status: "draft", business_id: BUSINESS, objective: "awareness" });
    expect(h.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "marketing.campaign.created" }));
  });
});

describe("transitionCampaign", () => {
  it("refuses activation without a start date, server-side, and writes nothing", async () => {
    useFake(() => ({ data: { status: "draft", start_at: null, end_at: null }, error: null }));

    await expect(m.transitionCampaign(BUSINESS, "c1", "active")).rejects.toMatchObject({
      code: "CAMPAIGN_INVALID_STATE",
    });
    // Only the read happened.
    expect(fake.queries("marketing_campaigns")).toHaveLength(1);
    expect(h.writeAuditLog).not.toHaveBeenCalled();
  });

  it("guards the update on the status it read, so a concurrent change is caught", async () => {
    let n = 0;
    useFake(() => {
      n += 1;
      if (n === 1) return { data: { status: "draft", start_at: "2026-09-01", end_at: null }, error: null };
      return { data: [], error: null };
    });

    await expect(m.transitionCampaign(BUSINESS, "c1", "active")).rejects.toThrow(/Someone else changed/);
    const update = fake.queries("marketing_campaigns")[1]!;
    expect(eqFilters(update)).toMatchObject({ business_id: BUSINESS, id: "c1", status: "draft" });
  });

  it("audits the before and after status", async () => {
    let n = 0;
    useFake(() => {
      n += 1;
      if (n === 1) return { data: { status: "draft", start_at: "2026-09-01", end_at: null }, error: null };
      return { data: [{ id: "c1" }], error: null };
    });

    await m.transitionCampaign(BUSINESS, "c1", "active");
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "marketing.campaign.active", before: { status: "draft" }, after: { status: "active" } }),
    );
  });

  it("reports a campaign from another business as not found", async () => {
    useFake(() => ({ data: null, error: null }));
    await expect(m.transitionCampaign(BUSINESS, "c-other", "planned")).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
  });
});

describe("transitionContent", () => {
  it("needs the approve permission to approve", async () => {
    let n = 0;
    useFake(() => {
      n += 1;
      if (n === 1) return { data: { status: "review", scheduled_at: null, approved_at: null }, error: null };
      return { data: [{ id: "x" }], error: null };
    });

    await m.transitionContent(BUSINESS, "x", "approved");
    expect(h.requirePermission).toHaveBeenCalledWith(BUSINESS, "marketing.approve");
    const update = writtenRow(fake.queries("marketing_content")[1]!);
    expect(update).toMatchObject({ status: "approved", approved_by: "user-1" });
  });

  it("only needs manage to send for review", async () => {
    let n = 0;
    useFake(() => {
      n += 1;
      if (n === 1) return { data: { status: "draft", scheduled_at: null, approved_at: null }, error: null };
      return { data: [{ id: "x" }], error: null };
    });

    await m.transitionContent(BUSINESS, "x", "review");
    expect(h.requirePermission).toHaveBeenCalledWith(BUSINESS, "marketing.manage");
    expect(h.requirePermission).not.toHaveBeenCalledWith(BUSINESS, "marketing.approve");
  });

  it("refuses to publish a draft — there is no approved version", async () => {
    useFake(() => ({ data: { status: "draft", scheduled_at: null, approved_at: null }, error: null }));
    await expect(m.transitionContent(BUSINESS, "x", "published")).rejects.toMatchObject({ code: "CONTENT_NOT_APPROVED" });
    expect(h.requirePermission).not.toHaveBeenCalled();
  });

  // §12.6: "Published state must reference a specific version."
  it("pins the latest version when publishing approved content", async () => {
    useFake((call) => {
      if (call.table === "marketing_content_versions") return { data: { id: "v3" }, error: null };
      if (call.ops.some((o) => o.method === "update")) return { data: [{ id: "x" }], error: null };
      return { data: { status: "approved", scheduled_at: null, approved_at: "2026-09-01" }, error: null };
    });

    await m.transitionContent(BUSINESS, "x", "published");
    const update = fake.queries("marketing_content").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "published", published_version_id: "v3" });
  });

  it("does not check a permission before confirming the move is legal at all", async () => {
    useFake(() => ({ data: { status: "published", scheduled_at: null, approved_at: null }, error: null }));
    await expect(m.transitionContent(BUSINESS, "x", "draft")).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(h.requirePermission).not.toHaveBeenCalled();
  });
});

describe("updateContent", () => {
  const content = contentInputSchema.parse({ title: "Top tips", contentType: "blog", body: "New words" });

  it("refuses to edit published content in place", async () => {
    useFake(() => ({ data: { status: "published" }, error: null }));
    await expect(m.updateContent(BUSINESS, "x", content)).rejects.toThrow(/Duplicate/);
    expect(fake.queries("marketing_content_versions")).toHaveLength(0);
  });

  it("saves the edit as a new version and resets approval on approved content", async () => {
    useFake((call) => {
      if (call.table === "marketing_content_versions" && call.ops.some((o) => o.method === "select")) {
        return { data: { version_number: 2 }, error: null };
      }
      if (call.table === "marketing_content" && !call.ops.some((o) => o.method === "update")) {
        return { data: { status: "approved" }, error: null };
      }
      return { data: null, error: null };
    });

    await m.updateContent(BUSINESS, "x", content);

    const inserted = fake.queries("marketing_content_versions").find((q) => q.ops.some((o) => o.method === "insert"))!;
    expect(writtenRow(inserted)).toMatchObject({ version_number: 3, body: "New words" });
    const update = fake.queries("marketing_content").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "draft", approved_by: null, approved_at: null });
    expect(h.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "marketing.content.approval_reset" }));
  });
});

describe("validateAssetFile", () => {
  it("accepts a file whose extension and type agree", () => {
    expect(m.validateAssetFile({ name: "logo.png", type: "image/png", size: 1000 })).toEqual({ ok: true, defaultType: "image" });
  });

  // §64: do not trust browser-provided metadata alone.
  it("refuses a file whose type contradicts its extension", () => {
    const result = m.validateAssetFile({ name: "brochure.pdf", type: "text/html", size: 1000 });
    expect(result.ok).toBe(false);
  });

  it("refuses an extension that is not on the list", () => {
    expect(m.validateAssetFile({ name: "run.exe", type: "application/x-msdownload", size: 10 }).ok).toBe(false);
    expect(m.validateAssetFile({ name: "page.html", type: "text/html", size: 10 }).ok).toBe(false);
  });

  it("refuses empty and oversized files", () => {
    expect(m.validateAssetFile({ name: "a.png", type: "image/png", size: 0 }).ok).toBe(false);
    expect(m.validateAssetFile({ name: "a.png", type: "image/png", size: m.MAX_ASSET_BYTES + 1 }).ok).toBe(false);
  });
});

describe("uploadMarketingAsset", () => {
  const meta = { name: "Logo", assetType: "logo" as const, altText: null, description: null, campaignId: null, offeringId: null };

  it("refuses an invalid file before uploading anything", async () => {
    useFake(() => ({ data: null, error: null }));
    const file = new File(["<html>"], "evil.pdf", { type: "text/html" });
    await expect(m.uploadMarketingAsset(BUSINESS, file, meta)).rejects.toMatchObject({ code: "ASSET_INVALID" });
    expect(h.uploadAttachment).not.toHaveBeenCalled();
  });

  it("removes the uploaded file if the asset row cannot be written", async () => {
    useFake(() => ({ data: null, error: { message: "insert failed" } }));
    h.uploadAttachment.mockResolvedValue({ id: "att-1" });
    h.deleteAttachment.mockResolvedValue(undefined);
    const file = new File(["png"], "logo.png", { type: "image/png" });

    await expect(m.uploadMarketingAsset(BUSINESS, file, meta)).rejects.toBeTruthy();
    expect(h.deleteAttachment).toHaveBeenCalledWith("att-1");
  });
});
