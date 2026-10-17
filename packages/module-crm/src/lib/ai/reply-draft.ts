import { generateObject } from "ai";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { hashInput } from "@cofounderai/core/ai/hash";
import { recordAiRun } from "@cofounderai/core/ai-usage/mutations";
import { resolveBusinessAiModel, toAiProviderError } from "@cofounderai/core/ai/business-router";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { listItemsForBusiness } from "@cofounderai/core/items/queries";
import { listRecentOrdersForParty } from "@cofounderai/module-inventory/contract/index";
import { listRecentJobsForParty } from "@cofounderai/module-fsm/contract/index";
import { listOfferingKnowledgeForBusiness } from "@cofounderai/module-discovery/contract/index";
import { createClient } from "../../db/server";
import { getBusiness } from "../tenancy/queries";
import {
  REPLY_DRAFT_PROMPT_VERSION,
  ReplyDraftOutputSchema,
  buildReplyFacts,
  decideReplyDraft,
  replyDraftPrompt,
  type ReplyTopic,
} from "./reply-draft-core";

/**
 * PLATFORM-P1-12.1/12.4 -- an AI draft answer to one inbound message, written only from the
 * business's own facts (reply-draft-core.ts). Draft only: it is stored for a person to edit
 * and send; nothing here sends. Generated on demand ("Draft a reply"), never on page load, and
 * cached per message by input hash so reopening never pays for an identical second call.
 *
 * Every read runs with the signed-in person's session, so RLS and each module's licence
 * decide what the model may see; an unlicensed module contributes no facts (ADR-10).
 */

const OPERATION = "draft_customer_reply" as const;

/** PLATFORM-P1-12.5/12.6: an automatic reply runs the same pipeline under its own operation,
 * so Platform -> AI can switch automatic sending off while drafts keep working. */
export type ReplyDraftOperation = typeof OPERATION | "auto_send_customer_reply";

export type StoredReplyDraft =
  | { status: "answered"; answer: string; topic: ReplyTopic; factsUsed: { id: string; label: string }[]; createdAt: string }
  | {
      status: "not_answerable";
      topic: ReplyTopic;
      createdAt: string;
      /** Why, when this call made the decision (a cached draft doesn't store it). */
      reason?: "cannot_answer" | "low_confidence" | "needs_person" | "invalid_output";
    };

type DraftRow = { status: "answered" | "not_answerable"; answer: string | null; topic: ReplyTopic; facts_used: { id: string; label: string }[]; created_at: string; input_hash: string };

function toStored(row: DraftRow): StoredReplyDraft {
  return row.status === "answered" && row.answer
    ? { status: "answered", answer: row.answer, topic: row.topic, factsUsed: row.facts_used ?? [], createdAt: row.created_at }
    : { status: "not_answerable", topic: row.topic, createdAt: row.created_at };
}

/** The stored draft for a message, without generating one (the page's own render). */
export async function getReplyDraft(businessId: string, interactionId: string): Promise<StoredReplyDraft | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reply_drafts")
    .select("status, answer, topic, facts_used, created_at, input_hash")
    .eq("business_id", businessId)
    .eq("interaction_id", interactionId)
    .maybeSingle();
  if (error) throw error;
  return data ? toStored(data as DraftRow) : null;
}

async function gatherFacts(businessId: string, partyId: string | null) {
  const core = await createCoreClient({ schema: "core" });
  const [business, settings, items, knowledge, orders, jobs] = await Promise.all([
    getBusiness(businessId),
    core.from("business_settings").select("currency").eq("business_id", businessId).maybeSingle(),
    listItemsForBusiness(businessId),
    listOfferingKnowledgeForBusiness(businessId),
    partyId ? listRecentOrdersForParty(businessId, partyId) : Promise.resolve({ ok: true as const, data: [] }),
    partyId ? listRecentJobsForParty(businessId, partyId) : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  if (!business) throw new Error("Business not found.");
  return {
    businessName: business.name,
    facts: buildReplyFacts({
      business,
      currency: (settings.data as { currency?: string } | null)?.currency ?? null,
      items,
      knowledge: knowledge.ok ? knowledge.data : [],
      orders: orders.ok ? orders.data.filter((o) => o.kind === "sales_order") : [],
      jobs: jobs.ok ? jobs.data : [],
    }),
  };
}

type CrmDb = Awaited<ReturnType<typeof createClient>>;

/**
 * The shared half of every reply draft, whoever asks: prompt, cache check, one AI call
 * (recorded in ai_runs), the code-side decision, and the stored draft. `db` is the crm client
 * the caller already authorized with -- the signed-in person's session, or (MCP) the service
 * role pinned to the API key's business; `aiClient` is passed through for the same reason.
 */
export async function runReplyDraft(input: {
  db: CrmDb;
  aiClient?: Parameters<typeof resolveBusinessAiModel>[2];
  businessId: string;
  interactionId: string;
  message: string;
  businessName: string;
  facts: ReturnType<typeof buildReplyFacts>;
  createdBy: string | null;
  operation?: ReplyDraftOperation;
}): Promise<StoredReplyDraft> {
  const { db, businessId, interactionId, facts } = input;
  const operation = input.operation ?? OPERATION;
  const prompt = replyDraftPrompt(input.businessName, facts, input.message);
  const inputHash = hashInput({ prompt, version: REPLY_DRAFT_PROMPT_VERSION });

  const { data: existing, error: existingError } = await db
    .from("reply_drafts")
    .select("status, answer, topic, facts_used, created_at, input_hash")
    .eq("business_id", businessId)
    .eq("interaction_id", interactionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && (existing as DraftRow).input_hash === inputHash) return toStored(existing as DraftRow);

  const { businessId: resolvedBusinessId, provider, modelId, model } = await resolveBusinessAiModel(businessId, operation, input.aiClient);
  const startedAt = Date.now();
  let output;
  try {
    const response = await generateObject({ model, schema: ReplyDraftOutputSchema, prompt });
    output = response.object;
    await recordAiRun({
      businessId: resolvedBusinessId,
      operation,
      model: modelId,
      provider,
      promptVersion: REPLY_DRAFT_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      durationMs: Date.now() - startedAt,
      client: input.aiClient,
    });
  } catch (err) {
    const aiError = toAiProviderError(err, provider);
    await recordAiRun({
      businessId: resolvedBusinessId,
      operation,
      model: modelId,
      provider,
      promptVersion: REPLY_DRAFT_PROMPT_VERSION,
      inputHash,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
      client: input.aiClient,
    });
    throw aiError;
  }

  const decision = decideReplyDraft(output, facts);
  const { data: saved, error: saveError } = await db
    .from("reply_drafts")
    .upsert(
      {
        business_id: businessId,
        interaction_id: interactionId,
        status: decision.status,
        answer: decision.status === "answered" ? decision.answer : null,
        topic: decision.topic,
        facts_used: decision.status === "answered" ? decision.factsUsed : [],
        input_hash: inputHash,
        prompt_version: REPLY_DRAFT_PROMPT_VERSION,
        created_by: input.createdBy,
        created_at: new Date().toISOString(),
      },
      { onConflict: "interaction_id" },
    )
    .select("status, answer, topic, facts_used, created_at, input_hash")
    .single();
  if (saveError) throw saveError;
  const stored = toStored(saved as DraftRow);
  return stored.status === "not_answerable" && decision.status === "not_answerable" ? { ...stored, reason: decision.reason } : stored;
}

/** Writes (or returns the cached) AI draft for one inbound message, for the signed-in person.
 * Throws AiProviderError when AI is unavailable (switched off, no key, provider down). */
export async function generateReplyDraft(businessId: string, interactionId: string): Promise<StoredReplyDraft> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm.view");

  const supabase = await createClient();
  const { data: interaction, error } = await supabase
    .from("interaction")
    .select("party_id, direction, content_excerpt")
    .eq("id", interactionId)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  const message = (interaction.content_excerpt ?? "").trim();
  if (interaction.direction !== "inbound" || !message) throw new Error("There's no customer message to reply to.");

  const { businessName, facts } = await gatherFacts(businessId, interaction.party_id);
  const { data: user } = await supabase.auth.getUser();
  return runReplyDraft({ db: supabase, businessId, interactionId, message, businessName, facts, createdBy: user.user?.id ?? null });
}
