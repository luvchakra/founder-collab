/**
 * DISC-AI-APPROVAL-01: whether Discovery's AI flows ("Let AI Auto-Populate Info" and
 * "Run AI Discovery") approve their own proposals ("auto") or leave every proposal for a
 * person to approve ("review"). Stored per business on
 * `core.business_settings.discovery_ai_approval_mode`; read on the server only, never
 * taken from the client.
 */
export type AiApprovalMode = "review" | "auto";

export const AI_APPROVAL_MODES: AiApprovalMode[] = ["review", "auto"];

/** "Review each step" is the default for every business (CLAUDE.md AI rule 3). */
export const DEFAULT_AI_APPROVAL_MODE: AiApprovalMode = "review";

/** The option labels in the business's settings. */
export const AI_APPROVAL_MODE_LABEL: Record<AiApprovalMode, string> = {
  review: "Review each step",
  auto: "Approve automatically",
};

/** The one line shown where these AI flows start. */
export const AI_APPROVAL_MODE_STATUS: Record<AiApprovalMode, string> = {
  review: "AI suggestions wait for your review",
  auto: "AI approves steps automatically",
};

/** The permission that may change the mode -- the same key `core.business_settings`'
 * update policy checks, so the app and the database agree. */
export const AI_APPROVAL_MODE_PERMISSION = "business.settings.manage";

export function isAiApprovalMode(value: unknown): value is AiApprovalMode {
  return value === "review" || value === "auto";
}
