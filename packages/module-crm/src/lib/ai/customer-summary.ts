import { z } from "zod";
import { generateObject } from "ai";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { hashInput } from "@cofounderai/core/ai/hash";
import { recordAiRun } from "@cofounderai/core/ai-usage/mutations";
import { resolveBusinessAiModel, toAiProviderError } from "@cofounderai/core/ai/business-router";
import { formatDate } from "@cofounderai/core/lib/format";
import { createClient } from "../../db/server";
import { getCustomer360 } from "../customer-360/queries";
import type { Customer360 } from "../customer-360/types";

const SUMMARIZE_CUSTOMER_PROMPT_VERSION = "v1";
const OPERATION = "summarize_customer";
const CustomerSummarySchema = z.object({ summary: z.string().min(1) });

/**
 * Compact, line-per-fact rendering of `getCustomer360()`'s own result -- the same
 * cross-module data the Customer 360 page already displays, just as plain text instead
 * of cards. Deliberately reuses that one call rather than gathering its own copy of the
 * same leads/opportunities/orders/jobs queries (CLAUDE.md principle 9, "never send
 * unnecessary context" -- and principle 13, don't refactor/duplicate what already
 * exists). Notes/products are capped to keep the prompt bounded on a customer with a
 * long history, same reasoning `check_response_quality`'s own conversation-window cap
 * uses elsewhere in this module.
 */
function customerSummaryPrompt(businessName: string, data: Customer360): string {
  const lines: string[] = [
    `You are summarizing a customer relationship for a small business ("${businessName}") using its CRM.`,
    `Customer: ${data.name}${data.contactMethods.email ? ` <${data.contactMethods.email}>` : ""}${data.contactMethods.phone ? ` (${data.contactMethods.phone})` : ""}`,
  ];
  if (data.lifecycleStatus) lines.push(`Lifecycle status: ${data.lifecycleStatus}${data.source ? ` (source: ${data.source})` : ""}`);
  if (data.prospect) lines.push(`Discovery: ${data.prospect.productName} -- ${data.prospect.status}/${data.prospect.outcome}, signals: ${data.prospect.buyingSignals.join("; ") || "none recorded"}`);
  if (data.productsOfInterest.length > 0) {
    lines.push(`Products of interest: ${data.productsOfInterest.slice(0, 10).map((p) => `${p.itemName}${p.quantity ? ` (qty ${p.quantity})` : ""}`).join(", ")}`);
  }
  if (data.openLeads.length > 0) lines.push(`Open leads: ${data.openLeads.map((l) => l.status).join(", ")}`);
  if (data.openOpportunities.length > 0) {
    lines.push(`Open opportunities: ${data.openOpportunities.map((o) => `opened ${formatDate(o.createdAt)}`).join("; ")}`);
  }
  if (data.openFollowUps.length > 0) {
    lines.push(`Open follow-ups: ${data.openFollowUps.map((f) => `due ${formatDate(f.due_at)} (${f.priority})`).join("; ")}`);
  }
  if (data.recentConversations.length > 0) {
    lines.push(`Recent conversations: ${data.recentConversations.map((c) => `${c.primaryChannel} -- ${c.status}${c.lastInteractionAt ? `, last ${formatDate(c.lastInteractionAt)}` : ""}`).join("; ")}`);
  }
  if (data.recentOrders.length > 0) {
    lines.push(`Inventory orders/invoices: ${data.recentOrders.slice(0, 10).map((o) => `${o.number} -- ${o.status}`).join("; ")}`);
  }
  if (data.recentJobs.length > 0) {
    lines.push(`Service jobs: ${data.recentJobs.slice(0, 10).map((j) => `${j.number ?? "job"} -- ${j.status}`).join("; ")}`);
  }
  if (data.notes.length > 0) {
    lines.push(`Recent notes: ${data.notes.slice(0, 5).map((n) => n.body).join(" | ")}`);
  }
  lines.push(
    "",
    "Write a concise summary (4-6 sentences) covering: who they are, what they want, what has happened so far, any open issue or opportunity, and a recommended next action.",
    "Only use the facts given above -- do not invent details, dates, or amounts not present here.",
  );
  return lines.join("\n");
}

/** Reads the cached summary without generating a new one -- the Customer 360 page's own
 * initial render, so opening the page never triggers a paid AI call by itself. */
export async function getCustomerSummary(businessId: string, partyId: string): Promise<{ summary: string; generatedAt: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_summary")
    .select("summary, generated_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw error;
  return data ? { summary: data.summary, generatedAt: data.generated_at } : null;
}

/**
 * CRM-12.1's "Customer Summary" -- generated on demand (the "Generate summary" button on
 * the Customer 360 page), not on every page load, keeping this an explicit AI call
 * rather than an automatic background cost. Caches on `crm.customer_summary` keyed by
 * `input_hash` (same discipline `draftReviewResponse()` established for CRM-08.6): if
 * nothing about this customer has changed since the last generation, the button's next
 * click returns the stored summary without a second model call.
 */
export async function generateCustomerSummary(businessId: string, partyId: string): Promise<{ summary: string }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm.view");

  const data = await getCustomer360(businessId, partyId);
  const prompt = customerSummaryPrompt(data.name, data);
  const inputHash = hashInput({ prompt, version: SUMMARIZE_CUSTOMER_PROMPT_VERSION });

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("customer_summary")
    .select("summary, input_hash")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.input_hash === inputHash) {
    return { summary: existing.summary };
  }

  const { businessId: resolvedBusinessId, provider, modelId, model } = await resolveBusinessAiModel(businessId, OPERATION);
  const startedAt = Date.now();
  try {
    const response = await generateObject({ model, schema: CustomerSummarySchema, prompt });

    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: SUMMARIZE_CUSTOMER_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      durationMs: Date.now() - startedAt,
    });

    const summary = response.object.summary;
    const { error: upsertError } = await supabase
      .from("customer_summary")
      .upsert(
        { business_id: businessId, party_id: partyId, summary, input_hash: inputHash, generated_at: new Date().toISOString() },
        { onConflict: "business_id,party_id" },
      );
    if (upsertError) throw upsertError;

    return { summary };
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: SUMMARIZE_CUSTOMER_PROMPT_VERSION,
      inputHash,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
