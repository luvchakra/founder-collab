import { generateObject } from "ai";
import { createAdminClient } from "../../db/admin";
import type { Message } from "../messages/types";
import {
  classifyReplyPrompt,
  CLASSIFY_REPLY_PROMPT_VERSION,
} from "../../prompts/outreach/classify_reply_v1";
import { hashInput } from "./hash";
import { ReplyClassificationSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "classify_reply";

/**
 * Classifies an inbound reply and stores the classification + a recommended next step
 * directly on the message row. Runs on the admin client -- its only caller is the
 * inbound-email webhook (lib/conversations/ingest-inbound-email.ts), which has no user
 * session for RLS to key off of -- so the admin client is threaded into every lookup,
 * including the AI router's own account/credential resolution (resolveAiModel's `client`
 * param). Uses the "fast" quality tier (lib/ai/operation-registry.ts) since
 * classification is a small, low-stakes task.
 */
export async function classifyReply(messageId: string): Promise<Message> {
  const admin = createAdminClient();

  const { data: message, error: messageError } = await admin
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (messageError) throw messageError;
  if (message.direction !== "inbound") {
    throw new Error("Only inbound messages can be classified.");
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("*")
    .eq("id", message.workspace_id)
    .single();
  if (workspaceError) throw workspaceError;

  const { data: product, error: productError } = await admin
    .from("products")
    .select("name")
    .eq("id", workspace.product_id)
    .single();
  if (productError) throw productError;

  await assertWithinUsageLimit(workspace.id, admin);

  const prompt = classifyReplyPrompt({ productName: product.name, replyContent: message.content });

  const { accountId, provider, modelId, model } = await resolveAiModel(
    workspace.id,
    OPERATION,
    admin,
  );
  const inputHash = hashInput({ prompt, version: CLASSIFY_REPLY_PROMPT_VERSION, model: modelId });

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: ReplyClassificationSchema,
      prompt,
    });
    const draft = response.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: CLASSIFY_REPLY_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      client: admin,
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const { data, error } = await admin
      .from("messages")
      .update({
        classification: draft.classification,
        recommended_action: draft.recommended_action,
      })
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: CLASSIFY_REPLY_PROMPT_VERSION,
      inputHash,
      status: "failed",
      client: admin,
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
