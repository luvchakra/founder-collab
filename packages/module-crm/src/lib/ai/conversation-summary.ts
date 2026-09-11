import { generateObject } from "ai";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { hashInput } from "@cofounderai/core/ai/hash";
import { recordAiRun } from "@cofounderai/core/ai-usage/mutations";
import { resolveBusinessAiModel, toAiProviderError } from "@cofounderai/core/ai/business-router";
import { createClient } from "../../db/server";
import { getBusiness } from "../tenancy/queries";
import { getConversationById } from "../interactions/queries";
import type { ConversationDetail } from "../conversations/types";
import { ConversationSummarySchema, NEXT_BEST_ACTIONS } from "./conversation-summary-types";
import type { ConversationSummaryResult } from "./conversation-summary-types";

export { NEXT_BEST_ACTIONS, NEXT_BEST_ACTION_LABEL, type ConversationSummaryResult } from "./conversation-summary-types";

const SUMMARIZE_CONVERSATION_PROMPT_VERSION = "v2";
const OPERATION = "summarize_conversation";
const RECENT_INTERACTIONS_LIMIT = 30;

/** Capped to the most recent `RECENT_INTERACTIONS_LIMIT` messages -- a bounded prompt
 * even for a conversation with a long back-and-forth history, same reasoning
 * `customer-summary.ts`'s own notes/orders caps use. */
function conversationSummaryPrompt(businessName: string, conversation: ConversationDetail): string {
  const recent = conversation.interactions.slice(-RECENT_INTERACTIONS_LIMIT);
  const lines: string[] = [
    `You are summarizing a customer conversation for a small business ("${businessName}") using its CRM. Channel: ${conversation.primary_channel}.`,
    "Messages, oldest first:",
    ...recent.map((i) => `${i.direction === "inbound" ? "Customer" : businessName}: ${i.content_excerpt ?? "(no text)"}`),
    "",
    "Analyze this conversation and provide:",
    "- summary: 2-3 sentences covering what this conversation is about and where it stands.",
    "- unresolvedQuestions: questions the customer asked that haven't been answered yet (empty array if none).",
    "- promisedActions: anything the business said it would do (empty array if none).",
    "- sentiment: the customer's overall tone -- positive, neutral, or negative.",
    `- nextBestAction: exactly one of ${NEXT_BEST_ACTIONS.join(", ")} -- the single most useful next step for the business to take.`,
    "- nextBestActionRationale: one sentence explaining why that action, referencing what's actually in the conversation.",
    "Only use what's in the messages above -- do not invent facts. You are recommending an action, not performing one.",
  ];
  return lines.join("\n");
}

/** Reads the cached summary without generating a new one. */
export async function getConversationSummary(businessId: string, conversationId: string): Promise<{ data: ConversationSummaryResult; generatedAt: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversation_summary")
    .select("data, generated_at")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ? { data: data.data as ConversationSummaryResult, generatedAt: data.generated_at } : null;
}

/**
 * CRM-12.2's "Conversation Summary" -- same on-demand, cache-by-input-hash discipline as
 * CRM-12.1's `generateCustomerSummary()`, just scoped to one conversation's own message
 * history instead of the customer's full cross-module footprint.
 *
 * CRM-12.4's "Next Best Action" is folded into this same call/result (`nextBestAction`/
 * `nextBestActionRationale` above) rather than a second AI request over the same
 * conversation -- the two stories analyze the identical context (one conversation's
 * message history) for closely related purposes, so one call serves both.
 */
export async function generateConversationSummary(businessId: string, conversationId: string): Promise<ConversationSummaryResult> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm.view");

  const [conversation, business] = await Promise.all([getConversationById(businessId, conversationId), getBusiness(businessId)]);
  if (!conversation) throw new Error("This conversation could not be found.");
  if (!business) throw new Error("Business not found.");
  if (conversation.interactions.length === 0) throw new Error("This conversation has no messages yet.");

  const prompt = conversationSummaryPrompt(business.name, conversation);
  const inputHash = hashInput({ prompt, version: SUMMARIZE_CONVERSATION_PROMPT_VERSION });

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("conversation_summary")
    .select("data, input_hash")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.input_hash === inputHash) {
    return existing.data as ConversationSummaryResult;
  }

  const { businessId: resolvedBusinessId, provider, modelId, model } = await resolveBusinessAiModel(businessId, OPERATION);
  const startedAt = Date.now();
  try {
    const response = await generateObject({ model, schema: ConversationSummarySchema, prompt });

    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: SUMMARIZE_CONVERSATION_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      durationMs: Date.now() - startedAt,
    });

    const result = response.object;
    const { error: upsertError } = await supabase
      .from("conversation_summary")
      .upsert(
        { business_id: businessId, conversation_id: conversationId, data: result, input_hash: inputHash, generated_at: new Date().toISOString() },
        { onConflict: "business_id,conversation_id" },
      );
    if (upsertError) throw upsertError;

    return result;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: SUMMARIZE_CONVERSATION_PROMPT_VERSION,
      inputHash,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
