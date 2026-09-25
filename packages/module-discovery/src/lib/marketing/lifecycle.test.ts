/**
 * MKT-05/MKT-08. The state machines the mutation layer enforces server-side. The
 * properties that matter most: a campaign is not "active" just because it exists, content
 * cannot be published without an approved version, and published content is never
 * silently rewritten.
 */
import { describe, expect, it } from "vitest";
import {
  allowedCampaignTransitions,
  allowedContentTransitions,
  checkCampaignTransition,
  checkContentTransition,
  statusAfterEdit,
} from "./lifecycle";
import { CAMPAIGN_STATUSES, CONTENT_STATUSES } from "./types";

const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const past = new Date(Date.now() - 30 * 86_400_000).toISOString();

describe("campaign transitions", () => {
  it("activates a campaign that has a start date", () => {
    expect(checkCampaignTransition("draft", "active", { startAt: past, endAt: future })).toEqual({ ok: true });
  });

  // §52 rule 1: "Campaign cannot be Active without valid start date".
  it("refuses to activate a campaign with no start date", () => {
    const result = checkCampaignTransition("draft", "active", { startAt: null, endAt: null });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/start date/);
  });

  it("refuses to activate a campaign whose end date has passed", () => {
    const result = checkCampaignTransition("planned", "active", { startAt: past, endAt: past });
    expect(result.ok).toBe(false);
  });

  it("refuses a move the graph does not allow", () => {
    const result = checkCampaignTransition("completed", "active", { startAt: past, endAt: future });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/cannot be moved/);
  });

  it("refuses a no-op move", () => {
    expect(checkCampaignTransition("active", "active", { startAt: past, endAt: null }).ok).toBe(false);
  });

  it("treats archived as terminal", () => {
    expect(allowedCampaignTransitions("archived")).toEqual([]);
  });

  it("gives every status an entry, so no status can get stuck by omission", () => {
    for (const status of CAMPAIGN_STATUSES) {
      expect(Array.isArray(allowedCampaignTransitions(status))).toBe(true);
    }
  });
});

describe("content transitions", () => {
  it("marks approving as an approver-only move", () => {
    const result = checkContentTransition("review", "approved", { scheduledAt: null, hasApprovedVersion: false });
    expect(result).toEqual({ ok: true, requiresApproval: true });
  });

  it("marks publishing as an approver-only move", () => {
    const result = checkContentTransition("approved", "published", { scheduledAt: null, hasApprovedVersion: true });
    expect(result.ok && result.requiresApproval).toBe(true);
  });

  it("does not require the approver to send content for review", () => {
    const result = checkContentTransition("draft", "review", { scheduledAt: null, hasApprovedVersion: false });
    expect(result).toEqual({ ok: true, requiresApproval: false });
  });

  // §52 rule 5: "Published content must have an approved version."
  it("refuses to publish without an approved version", () => {
    const result = checkContentTransition("approved", "published", { scheduledAt: null, hasApprovedVersion: false });
    expect(result.ok).toBe(false);
  });

  it("refuses to schedule without a date", () => {
    const result = checkContentTransition("approved", "scheduled", { scheduledAt: null, hasApprovedVersion: true });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/date/);
  });

  // Draft content cannot jump straight to published, skipping review and approval.
  it("does not let a draft skip review and approval", () => {
    expect(allowedContentTransitions("draft")).not.toContain("published");
    expect(allowedContentTransitions("draft")).not.toContain("approved");
  });

  it("only lets published content be archived", () => {
    expect(allowedContentTransitions("published")).toEqual(["archived"]);
  });

  it("gives every status an entry", () => {
    for (const status of CONTENT_STATUSES) {
      expect(Array.isArray(allowedContentTransitions(status))).toBe(true);
    }
  });
});

describe("statusAfterEdit", () => {
  // What was approved is not what is there any more.
  it.each([
    ["approved", "draft"],
    ["scheduled", "draft"],
    ["idea", "draft"],
  ] as const)("sends %s content back to %s when its text changes", (from, to) => {
    expect(statusAfterEdit(from)).toEqual({ ok: true, status: to });
  });

  it.each(["draft", "review", "archived"] as const)("leaves %s content where it is", (status) => {
    expect(statusAfterEdit(status)).toEqual({ ok: true, status });
  });

  it("refuses to edit published content in place", () => {
    const result = statusAfterEdit("published");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/Duplicate/);
  });
});
