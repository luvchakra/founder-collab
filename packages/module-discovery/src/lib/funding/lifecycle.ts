import type { DiligenceStatus, OutreachStatus, PipelineStage, RoundStatus } from "./types";

/**
 * FND-06/09/11/13 — the Funding state machines, as data. The UI offers exactly the moves
 * listed here and the mutation layer refuses anything else, so a crafted request cannot
 * skip an approval or reopen a closed record.
 */

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Investor pipeline (§25)
// ---------------------------------------------------------------------------

/** The forward order of the pipeline; `passed` is the terminal side branch. */
export const PIPELINE_ORDER: readonly PipelineStage[] = [
  "identified",
  "researched",
  "target",
  "contacted",
  "meeting",
  "partner_review",
  "due_diligence",
  "term_discussion",
  "committed",
  "invested",
];

/**
 * Legal next stages. Forward moves may skip stages (a warm intro can go straight to a
 * meeting); a backward move is one step only, to correct a mistake, not to rewrite the
 * history. Any open record can be marked Passed, and a pass can be reopened at Target.
 * Invested is final.
 */
export function allowedStageMoves(from: PipelineStage): PipelineStage[] {
  if (from === "invested") return [];
  if (from === "passed") return ["target"];
  const i = PIPELINE_ORDER.indexOf(from);
  const forward = PIPELINE_ORDER.slice(i + 1);
  const back = i > 0 ? [PIPELINE_ORDER[i - 1]!] : [];
  return [...forward, ...back, "passed"];
}

/**
 * Whether a move is legal, and what it needs. A commitment and an investment are
 * amounts somebody stated, so reaching those stages needs the figure (§20.3: a
 * commitment is not cash received, and neither figure is ever inferred).
 */
export function checkStageMove(
  from: PipelineStage,
  to: PipelineStage,
  record: { committedAmount: number | null; investedAmount: number | null; currency: string | null },
): TransitionCheck {
  if (from === to) return { ok: false, reason: "The investor is already at that stage." };
  if (!allowedStageMoves(from).includes(to)) {
    return { ok: false, reason: `An investor at ${from.replace(/_/g, " ")} cannot be moved to ${to.replace(/_/g, " ")}.` };
  }
  if (to === "committed" && (record.committedAmount === null || !record.currency)) {
    return { ok: false, reason: "Enter the committed amount and its currency." };
  }
  if (to === "invested" && (record.investedAmount === null || !record.currency)) {
    return { ok: false, reason: "Enter the amount actually received and its currency." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rounds (§23)
// ---------------------------------------------------------------------------

const ROUND_TRANSITIONS: Record<RoundStatus, readonly RoundStatus[]> = {
  planning: ["open", "cancelled"],
  open: ["paused", "closed", "cancelled"],
  paused: ["open", "closed", "cancelled"],
  closed: [],
  cancelled: [],
};

export function allowedRoundMoves(from: RoundStatus): readonly RoundStatus[] {
  return ROUND_TRANSITIONS[from];
}

export function checkRoundMove(
  from: RoundStatus,
  to: RoundStatus,
  round: { targetAmount: number | null; currency: string | null },
): TransitionCheck {
  if (!ROUND_TRANSITIONS[from].includes(to)) return { ok: false, reason: `A ${from} round cannot be moved to ${to}.` };
  if (to === "open" && (round.targetAmount === null || !round.currency)) {
    return { ok: false, reason: "Set the round's target amount and currency before opening it." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Investor outreach (§27)
// ---------------------------------------------------------------------------

const OUTREACH_TRANSITIONS: Record<OutreachStatus, readonly OutreachStatus[]> = {
  draft: ["awaiting_approval", "closed"],
  awaiting_approval: ["approved", "draft", "closed"],
  // Sending is its own operation (sendApprovedOutreach), never a status write.
  approved: ["draft", "closed"],
  // Held only while a send is in flight. If a send was interrupted, a person decides:
  // closing it is safe; re-sending could deliver twice, so it is not offered.
  sending: ["closed"],
  sent: ["replied", "closed"],
  failed: ["draft", "closed"],
  replied: ["closed"],
  closed: [],
};

export function allowedOutreachMoves(from: OutreachStatus): readonly OutreachStatus[] {
  return OUTREACH_TRANSITIONS[from];
}

/** Approving is reserved for `funding.approve` — a founder's explicit sign-off (§27.4). */
export function checkOutreachMove(from: OutreachStatus, to: OutreachStatus): TransitionCheck & { requiresApproval?: boolean } {
  if (!OUTREACH_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `An outreach ${from.replace(/_/g, " ")} cannot be moved to ${to.replace(/_/g, " ")}.` };
  }
  return { ok: true, requiresApproval: to === "approved" };
}

/** Only an approved draft (or one whose previous send failed, once re-approved) goes out. */
export function canSend(status: OutreachStatus, approvedAt: string | null): TransitionCheck {
  if (status !== "approved" || !approvedAt) return { ok: false, reason: "Only approved outreach can be sent." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Due diligence (§30)
// ---------------------------------------------------------------------------

const DILIGENCE_TRANSITIONS: Record<DiligenceStatus, readonly DiligenceStatus[]> = {
  open: ["in_progress", "submitted", "closed"],
  in_progress: ["submitted", "open", "closed"],
  submitted: ["accepted", "needs_clarification", "in_progress"],
  needs_clarification: ["in_progress", "submitted", "closed"],
  accepted: ["closed"],
  closed: [],
};

export function allowedDiligenceMoves(from: DiligenceStatus): readonly DiligenceStatus[] {
  return DILIGENCE_TRANSITIONS[from];
}

/** Accepting and closing are human decisions and need `funding.approve` (§30.3). */
export function checkDiligenceMove(
  from: DiligenceStatus,
  to: DiligenceStatus,
  item: { response: string | null },
): TransitionCheck & { requiresApproval?: boolean } {
  if (!DILIGENCE_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `A ${from.replace(/_/g, " ")} request cannot be moved to ${to.replace(/_/g, " ")}.` };
  }
  if (to === "submitted" && !item.response?.trim()) {
    return { ok: false, reason: "Write the response before marking it submitted." };
  }
  return { ok: true, requiresApproval: to === "accepted" || to === "closed" };
}
