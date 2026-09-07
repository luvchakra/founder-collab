import { z } from "zod";
import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getOutreachStrategy } from "../outreach/queries";
import type { Contact } from "../contacts/types";
import type { Message } from "../messages/types";
import { getResendTemplate } from "../messages/resend-templates";
import { formatTemplateContent } from "../messages/template-content";
import {
  generateMessagePrompt,
  GENERATE_MESSAGE_PROMPT_VERSION,
} from "../../prompts/outreach/generate_message_v1";
import {
  generateTemplateMessagePrompt,
  GENERATE_TEMPLATE_MESSAGE_PROMPT_VERSION,
} from "../../prompts/outreach/generate_template_message_v1";
import { hashInput } from "./hash";
import { OutreachMessageSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "generate_outreach_message";

/** Builds a Zod object schema on the fly from a Resend template's own variable
 * definitions -- there's no static shape to declare ahead of time since it depends on
 * which template the founder picked. */
function templateVariablesSchema(variables: { key: string; type: "string" | "number" }[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const v of variables) {
    shape[v.key] = v.type === "number" ? z.number() : z.string();
  }
  return z.object(shape);
}

/**
 * Only works from an *approved* strategy (blueprint §18: "Prospect -> Research -> Score
 * -> Strategy -> Founder Review -> Message"). Every message is created with status
 * "draft" -- generation never sends anything, matching blueprint §20's human-approval
 * gate on all outbound communication.
 *
 * `resendTemplateId`, when given, switches from writing free-form subject+body to
 * filling in that Resend template's own variables (see generate_template_message_v1's
 * docstring) -- lib/messages/send.ts sends via Resend's template API for these,
 * verbatim html/text for everything else.
 */
export async function generateOutreachMessage(
  strategyId: string,
  resendTemplateId?: string,
): Promise<Message> {
  const strategy = await getOutreachStrategy(strategyId);
  if (!strategy) throw new Error("Strategy not found.");
  if (strategy.status !== "approved") {
    throw new Error("Approve the strategy before generating a message.");
  }
  if (resendTemplateId && strategy.channel !== "email") {
    throw new Error("Templates are only available for the email channel.");
  }

  const prospect = await getProspect(strategy.prospect_id);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product?.product_profile) throw new Error("Product profile not found.");

  await assertWithinUsageLimit(workspace.id);

  const supabase = await createClient();
  let contact: Contact | null = null;
  if (strategy.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", strategy.contact_id)
      .maybeSingle();
    contact = data;
  }

  const template = resendTemplateId ? await getResendTemplate(resendTemplateId) : null;
  if (resendTemplateId && !template) {
    throw new Error("That template no longer exists in Resend -- pick another one.");
  }

  const prompt = template
    ? generateTemplateMessagePrompt({
        productName: product.name,
        productProfile: product.product_profile,
        prospect,
        contact,
        strategy,
        templateName: template.name,
        variables: template.variables,
      })
    : generateMessagePrompt({
        productName: product.name,
        productProfile: product.product_profile,
        prospect,
        contact,
        strategy,
      });
  const promptVersion = template
    ? GENERATE_TEMPLATE_MESSAGE_PROMPT_VERSION
    : GENERATE_MESSAGE_PROMPT_VERSION;

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({ prompt, version: promptVersion, model: modelId });

  const startedAt = Date.now();
  try {
    const response = template
      ? await generateObject({ model, schema: templateVariablesSchema(template.variables), prompt })
      : await generateObject({ model, schema: OutreachMessageSchema, prompt });

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const insertPayload = template
      ? {
          subject: null,
          content: formatTemplateContent(response.object as Record<string, string | number>),
          resend_template_id: template.id,
          resend_template_name: template.name,
          template_variables: response.object as Record<string, string | number>,
        }
      : {
          subject: (response.object as { subject: string | null; body: string }).subject,
          content: (response.object as { subject: string | null; body: string }).body,
          resend_template_id: null,
          resend_template_name: null,
          template_variables: null,
        };

    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: workspace.id,
        prospect_id: prospect.id,
        contact_id: strategy.contact_id,
        channel: strategy.channel,
        direction: "outbound",
        status: "draft",
        ...insertPayload,
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
      promptVersion,
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
