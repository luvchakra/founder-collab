import { describe, expect, it } from "vitest";
import type { AccountWorkspaceEntry } from "../dashboard/queries";
import { buildGroupedSignalAlerts, type CorrelationForAlert } from "./grouped-signals";

const NOW = Date.parse("2026-10-10T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();

const entry = {
  workspace: { id: "ws-1" },
  product: { id: "prod-1", name: "IAM Suite" },
  business: { id: "biz-1", slug: "acme-co" },
} as unknown as AccountWorkspaceEntry;

function correlation(overrides: Partial<CorrelationForAlert> = {}): CorrelationForAlert {
  return {
    id: "c1",
    workspace_id: "ws-1",
    prospect_id: "p1",
    signal_ids: ["s1", "s2", "s3"],
    rationale: "New CTO + Hiring IAM engineers + Cloud migration",
    confidence: "high",
    latest_signal_at: daysAgo(2),
    ...overrides,
  };
}

const names = new Map([
  ["p1", "Acme"],
  ["p2", "Globex"],
]);

describe("buildGroupedSignalAlerts (DISC-OFFER-P1-01.4)", () => {
  it("raises one alert per account, combining its signals", () => {
    expect(buildGroupedSignalAlerts([correlation()], names, [entry], NOW)).toEqual([
      {
        id: "signals-c1",
        severity: "warning",
        message: "Acme is heating up (IAM Suite): New CTO + Hiring IAM engineers + Cloud migration",
        href: "/acme-co/discovery/offerings/prod-1/prospects/p1",
        businessId: "biz-1",
      },
    ]);
  });

  it("never alerts on a single raw signal", () => {
    expect(buildGroupedSignalAlerts([correlation({ signal_ids: ["s1"] })], names, [entry], NOW)).toEqual([]);
  });

  it("keeps only the latest group per account", () => {
    const alerts = buildGroupedSignalAlerts(
      [correlation({ id: "old", latest_signal_at: daysAgo(10) }), correlation({ id: "new", latest_signal_at: daysAgo(1) })],
      names,
      [entry],
      NOW,
    );
    expect(alerts.map((a) => a.id)).toEqual(["signals-new"]);
  });

  it("drops groups outside the 14-day window, and info-levels lower confidence", () => {
    expect(buildGroupedSignalAlerts([correlation({ latest_signal_at: daysAgo(15) })], names, [entry], NOW)).toEqual([]);
    expect(buildGroupedSignalAlerts([correlation({ confidence: "medium", signal_ids: ["a", "b"] })], names, [entry], NOW)[0]?.severity).toBe("info");
  });

  it("skips groups whose workspace or account the user can't see", () => {
    expect(buildGroupedSignalAlerts([correlation({ workspace_id: "other" })], names, [entry], NOW)).toEqual([]);
    expect(buildGroupedSignalAlerts([correlation({ prospect_id: "unknown" })], names, [entry], NOW)).toEqual([]);
  });
});
