import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getConversation } from "../conversations/queries";
import type { Contact } from "../contacts/types";
import type { Message } from "../messages/types";
import {
  generateReplyPrompt,
  GENERATE_REPLY_PROMPT_VERSION,
} from "../../prompts/outreach/generate_reply_v1";
import { hashInput } from "./hash";
import { OutreachMessageSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "generate_reply";

/**
 * Drafts a follow-up outbound message responding to the latest inbound reply in a
 * conversation. Requires that reply to already be classified (Epic 9 Story 3's
 * classifyReply(), run automatically on ingest) so the draft follows a concrete
 * recommended_action instead of guessing. Always created as status "draft" -- same
 * human-approval gate as generateOutreachMessage() (blueprint §20).
 */
export async function generateReply(conversationId: string): Promise<Message> {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found.");

  const supabase = await createClient();
  const { data: latestInbound, error: inboundError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inboundError) throw inboundError;
  if (!latestInbound) throw new Error("No inbound reply to respond to yet.");
  if (!latestInbound.classification) {
    throw new Error("Classify the latest reply before generating a response.");
  }

  const prospect = await getProspect(conversation.prospect_id);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(conversation.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product?.product_profile) throw new Error("Product profile not found.");

  await assertWithinUsageLimit(workspace.id);

  let contact: Contact | null = null;
  if (conversation.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", conversation.contact_id)
      .maybeSingle();
    contact = data;
  }

  const prompt = generateReplyPrompt({
    productName: product.name,
    productProfile: product.product_profile,
    prospect,
    contact,
    channel: conversation.channel,
    replyContent: latestInbound.content,
    classification: latestInbound.classification,
    recommendedAction: latestInbound.recommended_action ?? "Respond appropriately.",
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({ prompt, version: GENERATE_REPLY_PROMPT_VERSION, model: modelId });

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: OutreachMessageSchema,
      prompt,
    });
    const draft = response.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: GENERATE_REPLY_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: workspace.id,
        prospect_id: prospect.id,
        contact_id: conversation.contact_id,
        conversation_id: conversation.id,
        channel: conversation.channel,
        direction: "outbound",
        subject: draft.subject,
        content: draft.body,
        status: "draft",
      })
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
      promptVersion: GENERATE_REPLY_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
