import { z } from "zod";
import { generateObject } from "ai";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { hashInput } from "@cofounderai/core/ai/hash";
import { recordAiRun } from "@cofounderai/core/ai-usage/mutations";
import { resolveBusinessAiModel, toAiProviderError } from "@cofounderai/core/ai/business-router";
import { createClient } from "../../db/server";
import { getBusiness } from "../tenancy/queries";
import { getCustomer360 } from "../customer-360/queries";

export type ResponseQualityFlagType = "unanswered_question" | "unsupported_claim" | "missing_price_or_availability" | "overly_long" | "risky_or_uncertain" | "wrong_customer_or_context";

export type ResponseQualityFlag = { type: ResponseQualityFlagType; detail: string };

const OPERATION = "check_response_quality";
const RESPONSE_QUALITY_PROMPT_VERSION = "v1";

// A WhatsApp reply this long reads as a wall of text on a phone screen -- roughly four
// short SMS-length sentences, the same rough ceiling module-discovery's own outreach
// message prompts aim under.
const OVERLY_LONG_THRESHOLD = 480;

const QualityCheckSchema = z.object({
  unansweredQuestion: z.string().nullable(),
  unsupportedClaim: z.string().nullable(),
  missingPriceOrAvailability: z.string().nullable(),
  riskyOrUncertain: z.string().nullable(),
  wrongCustomerOrContext: z.string().nullable(),
});

/** The one deterministic check (CLAUDE.md principle 4) -- a plain length threshold,
 * never routed through the model. */
export function checkOverlyLong(draft: string): ResponseQualityFlag | null {
  if (draft.length <= OVERLY_LONG_THRESHOLD) return null;
  return { type: "overly_long", detail: `This reply is ${draft.length} characters -- consider trimming it to the essentials.` };
}

export function responseQualityPrompt(input: { businessName: string; customerName: string | null; lastInboundMessage: string | null; knownProductNames: string[]; draft: string }): string {
  return [
    `You are reviewing a draft WhatsApp reply from "${input.businessName}" before it is sent to a customer -- flag real problems only, do not invent issues that aren't there.`,
    `Customer: ${input.customerName ?? "unknown -- no matched contact"}`,
    `Products this business actually offers (not exhaustive): ${input.knownProductNames.length > 0 ? input.knownProductNames.join(", ") : "(none on file)"}`,
    `The customer's most recent message: ${input.lastInboundMessage ?? "(no prior inbound message in this conversation)"}`,
    `Draft reply: ${input.draft}`,
    "",
    "For each of the five checks below, return null if there is no real problem, or a short (one sentence) explanation if there is:",
    "- unansweredQuestion: the customer's message asked something specific and the draft doesn't address it at all.",
    "- unsupportedClaim: the draft states something as fact about a product, policy, or outcome that isn't grounded in the products/context given here.",
    "- missingPriceOrAvailability: the customer asked about price or availability/stock and the draft doesn't mention either, even approximately.",
    "- riskyOrUncertain: the draft makes a firm promise, guarantee, deadline, or commitment that sounds risky to commit to without checking first.",
    "- wrongCustomerOrContext: the draft addresses the customer by a different name, or refers to a product/order/context that doesn't match who this conversation is actually with.",
  ].join("\n");
}

/**
 * CRM-09.7's "Response Quality Check": "before send, optionally flag" six kinds of
 * issue -- "optionally" and "no autonomous send" both hold by construction, since this
 * function only ever returns flags for the caller's own UI to display; it never blocks,
 * edits, or sends anything itself. `overly_long` is deterministic (a plain length
 * threshold, CLAUDE.md principle 4: "do not use an LLM for deterministic operations")
 * and never routed through the model; the other five are genuinely semantic judgment
 * calls, checked via `@cofounderai/core/ai/business-router`'s business_id-scoped model
 * resolution (the same real-LLM path CRM-08.6 established as this module's first).
 *
 * Grounding is deliberately light: the customer's real name and product interests come
 * from `getCustomer360()` (CRM-02.1's already-built aggregation, reused rather than
 * re-fetched piecemeal) -- no live inventory stock/price lookup, since that would need
 * a cross-module call to a possibly-unlicensed module (ADR-10) for a check whose own
 * acceptance criteria only ask whether the draft addresses price/availability at all,
 * not whether a quoted figure is factually correct.
 */
export async function checkResponseQuality(businessId: string, conversationId: string, draftText: string): Promise<{ flags: ResponseQualityFlag[] }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm_messages.send");

  const draft = draftText.trim();
  if (!draft) return { flags: [] };

  const flags: ResponseQualityFlag[] = [];
  const overlyLong = checkOverlyLong(draft);
  if (overlyLong) flags.push(overlyLong);

  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase.from("conversation").select("party_id").eq("id", conversationId).eq("business_id", businessId).single();
  if (conversationError) throw conversationError;

  const { data: lastInbound, error: inboundError } = await supabase
    .from("interaction")
    .select("content_excerpt")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inboundError) throw inboundError;

  const [business, customer360] = await Promise.all([getBusiness(businessId), conversation.party_id ? getCustomer360(businessId, conversation.party_id) : Promise.resolve(null)]);

  const prompt = responseQualityPrompt({
    businessName: business?.name ?? "our team",
    customerName: customer360?.name ?? null,
    lastInboundMessage: lastInbound?.content_excerpt ?? null,
    knownProductNames: customer360?.productsOfInterest.map((p) => p.itemName) ?? [],
    draft,
  });
  const inputHash = hashInput({ prompt, version: RESPONSE_QUALITY_PROMPT_VERSION });

  const { businessId: resolvedBusinessId, provider, modelId, model } = await resolveBusinessAiModel(businessId, OPERATION);
  const startedAt = Date.now();
  try {
    const response = await generateObject({ model, schema: QualityCheckSchema, prompt });

    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: RESPONSE_QUALITY_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      durationMs: Date.now() - startedAt,
    });

    const result = response.object;
    if (result.unansweredQuestion) flags.push({ type: "unanswered_question", detail: result.unansweredQuestion });
    if (result.unsupportedClaim) flags.push({ type: "unsupported_claim", detail: result.unsupportedClaim });
    if (result.missingPriceOrAvailability) flags.push({ type: "missing_price_or_availability", detail: result.missingPriceOrAvailability });
    if (result.riskyOrUncertain) flags.push({ type: "risky_or_uncertain", detail: result.riskyOrUncertain });
    if (result.wrongCustomerOrContext) flags.push({ type: "wrong_customer_or_context", detail: result.wrongCustomerOrContext });

    return { flags };
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: RESPONSE_QUALITY_PROMPT_VERSION,
      inputHash,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
