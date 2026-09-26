import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderExport } from "@cofounderai/core/exports/render";
import type { PlatformExportContext } from "@cofounderai/core/exports/platform";

// EXP-ADMIN-01..07: platform-administration exports -- summary fields only, never the
// before/after snapshots or anything credential-shaped.

const SECRET = "sk_live_super_secret_value";

const mocks = vi.hoisted(() => ({
  searchPlatformAuditLog: vi.fn(),
  listAiUsage: vi.fn(),
  listIntegrationRegistry: vi.fn(),
  listConfigResourceInstances: vi.fn(),
  listConfigVersions: vi.fn(),
  getNotificationPolicies: vi.fn(),
}));

vi.mock("@cofounderai/core/admin/platform-audit-log", () => ({ searchPlatformAuditLog: mocks.searchPlatformAuditLog }));
vi.mock("@cofounderai/core/admin/platform-ai-usage", () => ({ listAiUsage: mocks.listAiUsage }));
vi.mock("@cofounderai/core/admin/platform-integrations", () => ({ listIntegrationRegistry: mocks.listIntegrationRegistry }));
vi.mock("@cofounderai/core/admin/platform-notification-policies", () => ({ getNotificationPolicies: mocks.getNotificationPolicies }));
vi.mock("@cofounderai/core/admin/config-history", () => ({
  CONFIG_RESOURCE_TYPES: [
    { key: "ai_provider", label: "AI Provider", singleton: false, restorable: false },
    { key: "plan", label: "Plan", singleton: false, restorable: true },
  ],
  listConfigResourceInstances: mocks.listConfigResourceInstances,
  listConfigVersions: mocks.listConfigVersions,
}));

import { platformAuditExport } from "./audit";
import { platformAiUsageExport } from "./ai-usage";
import { platformIntegrationsExport } from "./integrations";
import { platformConfigHistoryExport } from "./config-history";
import { platformNotificationPoliciesExport } from "./settings";
import { PLATFORM_EXPORTS } from "./index";

const context = (scope: "view" | "all" = "view"): PlatformExportContext => ({
  userId: "admin-1",
  userEmail: "admin@example.com",
  timeZone: "Asia/Kolkata",
  format: "csv",
  scope,
});

async function csvOf(workbook: Parameters<typeof renderExport>[0]) {
  const file = await renderExport(workbook, "csv", { timeZone: "UTC", generatedAt: new Date("2026-09-26T00:00:00Z") });
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(file.body);
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
});

describe("platform.audit (EXP-ADMIN-01)", () => {
  const entry = {
    id: "e1",
    resourceType: "ai_provider",
    resourceLabel: "OpenAI",
    resourceId: "p1",
    action: "updated",
    severity: "high",
    reason: "Rotated key",
    performedBy: "u1",
    performedByLabel: "Kunal",
    performedAt: "2026-09-25T05:00:00Z",
    before: { api_key: SECRET },
    after: { api_key: SECRET },
  };

  it("passes the page's filters through, widening bare dates and dropping unknown values", () => {
    const filters = platformAuditExport.parseFilters!(
      new URLSearchParams("dateFrom=2026-09-01&dateTo=2026-09-25T23:59:59.999Z&resourceType=nope&severity=high&action=updated"),
    );
    expect(filters).toEqual({
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-25T23:59:59.999Z",
      actorId: undefined,
      resourceType: undefined,
      action: "updated",
      severity: "high",
    });
  });

  it("exports summary columns only -- never the before/after snapshot", async () => {
    mocks.searchPlatformAuditLog.mockResolvedValue([entry]);
    const workbook = await platformAuditExport.load(context(), {});
    const csv = await csvOf(workbook);
    expect(csv.split("\r\n")[0]).toBe("﻿Performed at,Performed by,Action,Resource type,Resource,Resource ID,Risk level,Reason");
    expect(csv).toContain("Kunal,Updated,AI Provider,OpenAI,p1,High,Rotated key");
    expect(csv).not.toContain(SECRET);
  });

  it("widens the limit for all matching records and says so when the cap is hit", async () => {
    mocks.searchPlatformAuditLog.mockResolvedValue([]);
    await platformAuditExport.load(context("view"), {});
    expect(mocks.searchPlatformAuditLog).toHaveBeenLastCalledWith({}, 100);
    mocks.searchPlatformAuditLog.mockResolvedValue(Array.from({ length: 10_000 }, () => entry));
    const all = await platformAuditExport.load(context("all"), {});
    expect(mocks.searchPlatformAuditLog).toHaveBeenLastCalledWith({}, 10_000);
    expect(all.metadata?.Note).toMatch(/Limited to the newest/);
  });
});

describe("platform.ai-usage (EXP-ADMIN-02)", () => {
  it("exports runs and a provider/model/operation summary, blank tokens staying blank", async () => {
    mocks.listAiUsage.mockResolvedValue([
      { id: "r1", source: "core", provider: "anthropic", model: "m1", operation: "draft", module: "crm", businessId: "b", businessName: "Acme", inputTokens: 10, outputTokens: 5, estimatedCost: 0.01, status: "succeeded", createdAt: "2026-09-25T05:00:00Z" },
      { id: "r2", source: "core", provider: "anthropic", model: "m1", operation: "draft", module: "crm", businessId: "b", businessName: "Acme", inputTokens: null, outputTokens: null, estimatedCost: null, status: "failed", createdAt: "2026-09-25T06:00:00Z" },
    ]);
    const workbook = await platformAiUsageExport.load(context(), {});
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["Runs", "Summary"]);
    const summary = workbook.sheets[1]!.rows[0] as Record<string, unknown>;
    expect(summary).toMatchObject({ requests: 2, failed: 1, inputTokens: 10, cost: 0.01 });
    expect((await csvOf(workbook)).split("\r\n")[2]).toContain(",,,Failed");
  });
});

describe("platform.integrations (EXP-ADMIN-03)", () => {
  it("exports registry metadata with human labels and no notes", async () => {
    mocks.listIntegrationRegistry.mockResolvedValue([
      { integrationKey: "payments", displayName: "Payments", credentialOwnership: "platform_owned", status: "needs_reauthorization", enabled: true, notes: `key=${SECRET}`, updatedAt: "2026-09-25T05:00:00Z", updatedBy: null },
    ]);
    const csv = await csvOf(await platformIntegrationsExport.load(context(), {}));
    expect(csv).toContain("Payments,payments,Platform-owned,Needs reauthorization,Yes,Needs reauthorization");
    expect(csv).not.toContain(SECRET);
  });
});

describe("platform.config-history (EXP-ADMIN-06)", () => {
  it("exports version metadata for every configuration, never the values", async () => {
    mocks.listConfigResourceInstances.mockResolvedValue([{ id: "i1", label: "OpenAI" }]);
    mocks.listConfigVersions.mockResolvedValue([
      { version: 1, eventId: "e", action: "updated", reason: "rotate", performedBy: "Kunal", performedAt: "2026-09-25T05:00:00Z", before: { key: SECRET }, after: { key: SECRET }, isCurrent: true, instanceId: "i1" },
    ]);
    const workbook = await platformConfigHistoryExport.load(context(), { type: null });
    expect(mocks.listConfigVersions).toHaveBeenCalledTimes(2);
    const csv = await csvOf(workbook);
    expect(csv).toContain("AI Provider,OpenAI,1,Updated,Yes,No");
    expect(csv).toContain("Plan,OpenAI,1,Updated,Yes,Yes");
    expect(csv).not.toContain(SECRET);
  });

  it("narrows to the configuration type the page selected, ignoring an unknown one", () => {
    expect(platformConfigHistoryExport.parseFilters!(new URLSearchParams("type=plan"))).toEqual({ type: "plan" });
    expect(platformConfigHistoryExport.parseFilters!(new URLSearchParams("type=secrets"))).toEqual({ type: null });
  });
});

describe("platform.notification-policies (EXP-ADMIN-07)", () => {
  it("exports one row per channel", async () => {
    mocks.getNotificationPolicies.mockResolvedValue({ emailEnabled: true, inAppEnabled: false, pushEnabled: false, updatedAt: "2026-09-25T05:00:00Z", updatedBy: null });
    const csv = await csvOf(await platformNotificationPoliciesExport.load(context(), {}));
    expect(csv.split("\r\n").slice(1, 4)).toEqual([
      "Email,Yes,2026-09-25T05:00:00+00:00",
      "In-app,No,2026-09-25T05:00:00+00:00",
      "Push,No,2026-09-25T05:00:00+00:00",
    ]);
  });
});

describe("PLATFORM_EXPORTS", () => {
  it("covers every platform-administration story with platform.* ids", () => {
    const ids = PLATFORM_EXPORTS.map((adapter) => adapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^platform\.[a-z-]+$/.test(id))).toBe(true);
    expect(ids).toEqual(
      expect.arrayContaining([
        "platform.audit",
        "platform.ai-usage",
        "platform.integrations",
        "platform.plans",
        "platform.compliance",
        "platform.config-history",
        "platform.announcements",
        "platform.feature-flags",
        "platform.notification-policies",
      ]),
    );
  });
});
