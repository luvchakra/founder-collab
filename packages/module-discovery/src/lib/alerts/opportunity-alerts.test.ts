import { describe, expect, it } from "vitest";
import { formatOpportunityAlertMessage, groupOpportunityAlerts, type RecentSignal } from "./opportunity-alerts";

// DISC-OFFER-P1-01.4 "Grouped Opportunity Alerts"
const NOW = new Date("2026-09-26T12:00:00Z");
const names = new Map([
  ["acme", "Acme"],
  ["globex", "Globex"],
  ["initech", "Initech"],
]);

function signal(id: string, prospect: string, description: string, observedAt: string, workspace = "ws-iam"): RecentSignal {
  return { id, workspace_id: workspace, prospect_id: prospect, description, observed_at: observedAt };
}

describe("groupOpportunityAlerts", () => {
  it("turns an account's recent signals into one alert, not one per signal", () => {
    const groups = groupOpportunityAlerts({
      signals: [
        signal("s1", "acme", "New CTO", "2026-09-20T00:00:00Z"),
        signal("s2", "acme", "Hiring IAM engineers", "2026-09-22T00:00:00Z"),
        signal("s3", "acme", "Cloud migration", "2026-09-24T00:00:00Z"),
      ],
      companyNameByProspectId: names,
      settledProspectIds: new Set(),
      now: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "opportunity-heating-acme-s3", prospectId: "acme", companyName: "Acme", latestAt: "2026-09-24T00:00:00Z" });
    expect(groups[0]!.signals.map((s) => s.description)).toEqual(["Cloud migration", "Hiring IAM engineers", "New CTO"]);
  });

  it("needs two distinct recent signals; a lone signal or a re-synced duplicate is not a trend", () => {
    const groups = groupOpportunityAlerts({
      signals: [
        signal("g1", "globex", "Raised Series B", "2026-09-25T00:00:00Z"),
        signal("i1", "initech", "Hiring", "2026-09-25T00:00:00Z"),
        signal("i2", "initech", " hiring ", "2026-09-24T00:00:00Z"),
      ],
      companyNameByProspectId: names,
      settledProspectIds: new Set(),
      now: NOW,
    });
    expect(groups).toEqual([]);
  });

  it("ignores signals older than the window", () => {
    const groups = groupOpportunityAlerts({
      signals: [signal("s1", "acme", "New CTO", "2026-08-01T00:00:00Z"), signal("s2", "acme", "Hiring", "2026-09-25T00:00:00Z")],
      companyNameByProspectId: names,
      settledProspectIds: new Set(),
      now: NOW,
    });
    expect(groups).toEqual([]);
  });

  it("keeps each offering's alert separate for the same account", () => {
    const groups = groupOpportunityAlerts({
      signals: [
        signal("a1", "acme", "New CTO", "2026-09-20T00:00:00Z", "ws-iam"),
        signal("a2", "acme", "Hiring", "2026-09-21T00:00:00Z", "ws-iam"),
        signal("b1", "acme", "New CTO", "2026-09-22T00:00:00Z", "ws-training"),
        signal("b2", "acme", "L&D budget", "2026-09-23T00:00:00Z", "ws-training"),
      ],
      companyNameByProspectId: names,
      settledProspectIds: new Set(),
      now: NOW,
    });
    expect(groups.map((g) => g.workspaceId)).toEqual(["ws-training", "ws-iam"]);
  });

  it("stays quiet for accounts already sent to CRM or dismissed", () => {
    const groups = groupOpportunityAlerts({
      signals: [signal("s1", "acme", "New CTO", "2026-09-20T00:00:00Z"), signal("s2", "acme", "Hiring", "2026-09-22T00:00:00Z")],
      companyNameByProspectId: names,
      settledProspectIds: new Set(["acme"]),
      now: NOW,
    });
    expect(groups).toEqual([]);
  });

  it("gives a group a new id when a newer signal joins it", () => {
    const base = [signal("s1", "acme", "New CTO", "2026-09-20T00:00:00Z"), signal("s2", "acme", "Hiring", "2026-09-22T00:00:00Z")];
    const before = groupOpportunityAlerts({ signals: base, companyNameByProspectId: names, settledProspectIds: new Set(), now: NOW });
    const after = groupOpportunityAlerts({
      signals: [...base, signal("s3", "acme", "Cloud migration", "2026-09-25T00:00:00Z")],
      companyNameByProspectId: names,
      settledProspectIds: new Set(),
      now: NOW,
    });
    expect(before[0]!.id).not.toBe(after[0]!.id);
  });
});

describe("formatOpportunityAlertMessage", () => {
  it("names the account, the offering and the signals in one line", () => {
    const [group] = groupOpportunityAlerts({
      signals: [
        signal("s1", "acme", "New CTO", "2026-09-20T00:00:00Z"),
        signal("s2", "acme", "Hiring IAM engineers", "2026-09-22T00:00:00Z"),
        signal("s3", "acme", "Cloud migration", "2026-09-24T00:00:00Z"),
        signal("s4", "acme", "Opened a Berlin office", "2026-09-19T00:00:00Z"),
      ],
      companyNameByProspectId: names,
      settledProspectIds: new Set(),
      now: NOW,
    });
    expect(formatOpportunityAlertMessage(group!, "Managed IAM")).toBe(
      "Acme is heating up for Managed IAM: Cloud migration + Hiring IAM engineers + New CTO (+1 more)",
    );
    expect(formatOpportunityAlertMessage(group!, null)).toMatch(/^Acme is heating up: /);
  });
});
