import { researchState } from "./metrics";
import type { Recommendation } from "../intelligence/types";
import type { DataRoomItem, DiligenceItem, FundingProfile, FundingRound, Investor, OutreachDraft, PipelineRecord, ReadinessItem } from "./types";

/**
 * FND-03/FND-16 — the Funding dashboard's attention panel (§20.6, §20.7). Deterministic
 * rules over the business's own records, each carrying its reason, the data behind it and
 * where it came from; nothing here is generated text, and nothing claims readiness.
 */

/** INT-03: the shared Recommendation shape, always rule-based here. */
export type FundingAttentionItem = Recommendation;

export function fundingAttention(input: {
  profile: FundingProfile | null;
  round: FundingRound | null;
  investors: Investor[];
  pipeline: PipelineRecord[];
  outreach: OutreachDraft[];
  readiness: ReadinessItem[];
  dataRoom: DataRoomItem[];
  diligence: DiligenceItem[];
  financeAvailable: boolean;
  now?: Date;
}): FundingAttentionItem[] {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const items: FundingAttentionItem[] = [];

  const profileSections = input.profile
    ? [input.profile.company.summary, input.profile.product.problem, input.profile.market.targetMarket, input.profile.businessModel.revenueModel]
    : [];
  const filled = profileSections.filter((s) => s && s.trim()).length;
  if (!input.profile || filled < 3 || input.profile.traction.length === 0) {
    items.push({
      key: "profile",
      severity: "medium",
      title: "Funding profile is incomplete",
      reason: "Investors read the company, product, market and traction story first.",
      data: input.profile ? `${filled} of 4 core sections written, ${input.profile.traction.length} traction figures.` : "No profile yet.",
      action: "Complete the funding profile.",
      href: "profile",
      source: "Funding profile",
    });
  }

  if (!input.round) {
    items.push({
      key: "no-round",
      severity: "medium",
      title: "No round is set up",
      reason: "Targets, pipeline and progress are all measured against a round.",
      data: "No planning, open or paused round.",
      action: "Create the round you are raising.",
      href: "rounds",
      source: "Funding rounds",
    });
  } else if (input.round.targetAmount === null) {
    items.push({
      key: "round-target",
      severity: "high",
      title: `${input.round.name} has no target`,
      reason: "Without a target there is no progress or remaining amount to show.",
      data: "Target amount is empty.",
      action: "Set the round's target and currency.",
      href: `rounds/${input.round.id}`,
      source: "Funding round",
    });
  }

  const missingReadiness = input.readiness.filter((r) => r.status === "missing" || r.status === "needs_attention");
  if (input.readiness.length === 0) {
    items.push({
      key: "readiness-empty",
      severity: "low",
      title: "Readiness checklist not started",
      reason: "The checklist is how gaps investors will ask about are found early.",
      data: "0 readiness items.",
      action: "Add the standard checklist.",
      href: "readiness",
      source: "Investor readiness",
    });
  } else if (missingReadiness.length > 0) {
    items.push({
      key: "readiness-gaps",
      severity: "medium",
      title: `${missingReadiness.length} readiness item${missingReadiness.length === 1 ? "" : "s"} still open`,
      reason: "Items marked Missing or Needs attention.",
      data: missingReadiness
        .slice(0, 3)
        .map((r) => r.title)
        .join(", "),
      action: "Work through the open items.",
      href: "readiness",
      source: "Investor readiness",
    });
  }

  const unresearched = input.investors.filter((i) => {
    const state = researchState(i, now);
    return state === "not_researched" || state === "stale";
  });
  const targeted = new Set(input.pipeline.filter((p) => p.stage !== "passed").map((p) => p.investorId));
  const unresearchedTargets = unresearched.filter((i) => targeted.has(i.id));
  if (unresearchedTargets.length > 0) {
    items.push({
      key: "research",
      severity: "low",
      title: `${unresearchedTargets.length} investor${unresearchedTargets.length === 1 ? "" : "s"} in the pipeline without current research`,
      reason: "Outreach lands better when it reflects the investor's thesis, and research older than 90 days is marked stale.",
      data: unresearchedTargets
        .slice(0, 3)
        .map((i) => i.name)
        .join(", "),
      action: "Add research before reaching out.",
      href: "investors",
      source: "Investor research",
    });
  }

  const awaiting = input.outreach.filter((o) => o.status === "awaiting_approval");
  if (awaiting.length > 0) {
    items.push({
      key: "outreach-approval",
      severity: "medium",
      title: `${awaiting.length} outreach draft${awaiting.length === 1 ? "" : "s"} awaiting approval`,
      reason: "Nothing is sent to an investor until someone approves it.",
      data: awaiting
        .slice(0, 3)
        .map((o) => o.investorName ?? o.subject)
        .join(", "),
      action: "Review and approve, or send back.",
      href: "outreach?status=awaiting_approval",
      source: "Investor outreach",
    });
  }

  const failed = input.outreach.filter((o) => o.status === "failed");
  if (failed.length > 0) {
    items.push({
      key: "outreach-failed",
      severity: "high",
      title: `${failed.length} outreach email${failed.length === 1 ? "" : "s"} failed to send`,
      reason: "The email provider refused them.",
      data: failed[0]!.failureReason ?? "No reason given.",
      action: "Fix the recipient or configuration and re-approve.",
      href: "outreach?status=failed",
      source: "Email provider response",
    });
  }

  const overdueActions = input.pipeline.filter((p) => p.stage !== "passed" && p.stage !== "invested" && p.nextActionDue && p.nextActionDue < today);
  if (overdueActions.length > 0) {
    items.push({
      key: "next-actions",
      severity: "medium",
      title: `${overdueActions.length} investor follow-up${overdueActions.length === 1 ? "" : "s"} overdue`,
      reason: "A next action's due date has passed.",
      data: overdueActions
        .slice(0, 3)
        .map((p) => `${p.investorName}: ${p.nextAction ?? "follow up"}`)
        .join("; "),
      action: "Follow up, or reset the date.",
      href: "investors",
      source: "Investor pipeline",
    });
  }

  const overdueDiligence = input.diligence.filter((d) => d.status !== "accepted" && d.status !== "closed" && d.dueAt && d.dueAt < today);
  if (overdueDiligence.length > 0) {
    items.push({
      key: "diligence-overdue",
      severity: "high",
      title: `${overdueDiligence.length} diligence request${overdueDiligence.length === 1 ? "" : "s"} overdue`,
      reason: "An investor's request is past its due date.",
      data: overdueDiligence
        .slice(0, 3)
        .map((d) => d.request.slice(0, 60))
        .join("; "),
      action: "Respond, or agree a new date with the investor.",
      href: "due-diligence",
      source: "Due diligence",
    });
  }

  const missingDocs = input.dataRoom.filter((d) => d.isCurrent && d.status === "missing");
  if (missingDocs.length > 0) {
    items.push({
      key: "data-room-missing",
      severity: "low",
      title: `${missingDocs.length} data-room document${missingDocs.length === 1 ? "" : "s"} missing`,
      reason: "Placeholders in the data room with no file yet.",
      data: missingDocs
        .slice(0, 3)
        .map((d) => d.name)
        .join(", "),
      action: "Upload them.",
      href: "data-room",
      source: "Data room",
    });
  }

  if (!input.financeAvailable) {
    items.push({
      key: "finance",
      severity: "low",
      title: "Finance metrics unavailable",
      reason: "Cash, burn and runway come from Finance, which is not licensed or not set up for this business.",
      data: "No Finance read.",
      action: "Enter traction figures on the profile with their sources, or activate Finance.",
      href: "profile",
      source: "Finance contract",
    });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return items.map((i) => ({ ...i, origin: "rule" as const })).sort((a, b) => order[a.severity] - order[b.severity]);
}
