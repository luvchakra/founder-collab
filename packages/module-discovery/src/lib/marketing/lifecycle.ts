import type { CampaignStatus, ContentStatus } from "./types";

/**
 * MKT-05/MKT-08 — the campaign and content state machines.
 *
 * Kept as data rather than scattered `if`s so the rules are readable in one place, the UI
 * can offer exactly the actions that are legal, and the mutation layer refuses anything
 * else server-side (§9.3, §12.3: "transitions must be explicit").
 */

const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["planned", "active", "archived"],
  planned: ["draft", "active", "archived"],
  active: ["paused", "completed"],
  paused: ["active", "completed", "archived"],
  completed: ["archived"],
  // Archived is terminal: archival exists so history stays put (§35.5). Duplicate the
  // campaign to run it again.
  archived: [],
};

export function allowedCampaignTransitions(from: CampaignStatus): readonly CampaignStatus[] {
  return CAMPAIGN_TRANSITIONS[from];
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a campaign may move from one status to another. Beyond the graph, a campaign
 * cannot become Active without a start date (§52 rule 1) — "created" is not "running",
 * and a campaign with no start has nothing to measure against (§9.3).
 */
export function checkCampaignTransition(
  from: CampaignStatus,
  to: CampaignStatus,
  campaign: { startAt: string | null; endAt: string | null },
): TransitionCheck {
  if (from === to) return { ok: false, reason: "The campaign is already in that state." };
  if (!CAMPAIGN_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `A ${from} campaign cannot be moved to ${to}.` };
  }
  if (to === "active" && !campaign.startAt) {
    return { ok: false, reason: "Set a start date before activating the campaign." };
  }
  if (to === "active" && campaign.endAt && new Date(campaign.endAt).getTime() < Date.now()) {
    return { ok: false, reason: "This campaign's end date has passed. Update the dates, or mark it completed." };
  }
  return { ok: true };
}

const CONTENT_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  idea: ["draft", "archived"],
  draft: ["review", "archived"],
  // "Changes requested" is a move back to draft, not a separate status.
  review: ["approved", "draft", "archived"],
  approved: ["scheduled", "published", "draft", "archived"],
  // Unscheduling returns it to approved: the approval still stands.
  scheduled: ["published", "approved", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export function allowedContentTransitions(from: ContentStatus): readonly ContentStatus[] {
  return CONTENT_TRANSITIONS[from];
}

/**
 * Whether content may move between statuses, and whether the move needs the approver's
 * permission. Approving, and publishing (which puts words in front of customers under
 * the business's name), are the two moves reserved for `marketing.approve` (§12.3:
 * "only authorized users can approve"; "publishing must always be an explicit human
 * action").
 */
export function checkContentTransition(
  from: ContentStatus,
  to: ContentStatus,
  content: { scheduledAt: string | null; hasApprovedVersion: boolean },
): TransitionCheck & { requiresApproval?: boolean } {
  if (from === to) return { ok: false, reason: "The content is already in that state." };
  if (!CONTENT_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Content that is ${from} cannot be moved to ${to}.` };
  }
  if (to === "scheduled" && !content.scheduledAt) {
    return { ok: false, reason: "Pick a date and time to schedule it for." };
  }
  if (to === "published" && !content.hasApprovedVersion) {
    return { ok: false, reason: "Only approved content can be published." };
  }
  return { ok: true, requiresApproval: to === "approved" || to === "published" };
}

/**
 * Editing text resets the approval: what was approved is not what is there any more. The
 * edit is saved as a new version either way (§12.6), and approved or scheduled content
 * returns to draft so it goes through review again. Published content cannot be edited
 * in place — the published version is a record of what customers saw — so the caller
 * must refuse and offer a duplicate instead.
 */
export function statusAfterEdit(
  current: ContentStatus,
): { ok: true; status: ContentStatus } | { ok: false; reason: string } {
  if (current === "published") {
    return {
      ok: false,
      reason: "Published content is kept exactly as it went out. Duplicate it to write a new version.",
    };
  }
  if (current === "approved" || current === "scheduled") return { ok: true, status: "draft" };
  if (current === "idea") return { ok: true, status: "draft" };
  return { ok: true, status: current };
}
