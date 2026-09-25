import { UNTRUSTED_RULES, untrusted } from "../shared/untrusted";

export const STRATEGY_DRAFT_PROMPT_VERSION = "marketing_strategy_draft_v1";

/** MKT-04 — a first draft of the marketing strategy from what Discovery already knows
 * about the business, its offerings and their ICPs. A draft for the founder to edit and
 * activate; it states assumptions rather than inventing facts. */
export function strategyDraftPrompt(input: { context: string; existingStrategy: string | null; channels: readonly string[] }): string {
  return [
    "You are helping a founder draft a marketing strategy for their business.",
    UNTRUSTED_RULES,
    "Write positioning, a value proposition, differentiation, target markets, key messages and recommended channels.",
    `Choose channels only from: ${input.channels.join(", ")}.`,
    "Proof points must be things the material actually supports; if there is no proof yet, leave proof points empty and say what evidence to gather in assumptions.",
    "Do not invent customers, numbers, awards or competitors that are not in the material.",
    "",
    "What Discovery knows about the business:",
    untrusted("discovery_context", input.context),
    "",
    "The current strategy, if any (improve on it rather than starting over):",
    untrusted("current_strategy", input.existingStrategy),
  ].join("\n");
}
