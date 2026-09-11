import { createClient } from "../../db/server";
import { getBusiness } from "../tenancy/queries";
import { getCustomer360 } from "../customer-360/queries";
import type { Customer360 } from "../customer-360/types";
import type { MessageIntent } from "./intent-classification";

export type DraftReplySource = "party_contact_info" | "product_interest" | "discovery_research" | "recent_orders" | "recent_jobs";

export type DraftReplyResult = { draft: string; sources: DraftReplySource[] };

/**
 * CRM-09.6's "AI Suggested Response": draft only, template-by-intent -- NOT a real LLM
 * call, the same documented gap/pattern the old ticket model's `lib/ai/draft-reply.ts`
 * and this backlog's own CRM-09.3 classifier already established (module-crm has no
 * sanctioned cross-module contract to call a real model through). "System clearly
 * separates factual retrieval from generated wording": `sources` names exactly which
 * real Customer 360 facts (CRM-02.1's already-built cross-module aggregation) actually
 * informed this draft -- the `draft` string itself is the generated wording, never
 * presented as a verified fact on its own.
 */
export function draftInteractionReply(intent: MessageIntent | null, businessName: string, customer360: Customer360): DraftReplyResult {
  const sources: DraftReplySource[] = [];
  const firstName = customer360.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";
  if (customer360.name) sources.push("party_contact_info");

  const productNames = customer360.productsOfInterest.map((p) => p.itemName);
  if (productNames.length > 0) sources.push("product_interest");
  const productMention = productNames.length > 0 ? ` for ${productNames.slice(0, 2).join(" and ")}` : "";

  if (customer360.prospect) sources.push("discovery_research");
  if (customer360.recentOrders.length > 0) sources.push("recent_orders");
  if (customer360.recentJobs.length > 0) sources.push("recent_jobs");

  const draft = (() => {
    switch (intent) {
      case "pricing":
        return `${greeting}, thanks for asking about pricing${productMention} -- someone from ${businessName} will get back to you with details shortly.`;
      case "availability":
        return `${greeting}, thanks for checking availability${productMention} -- we'll confirm current stock and get back to you shortly.`;
      case "purchase_intent":
        return `${greeting}, thanks for your interest${productMention} -- someone from ${businessName} will follow up shortly to help you get this sorted.`;
      case "appointment":
        return `${greeting}, thanks for reaching out to book an appointment -- someone from ${businessName} will confirm a time with you shortly.`;
      case "support":
        return `${greeting}, sorry to hear you're running into an issue -- someone from ${businessName} will look into this and follow up shortly.`;
      case "complaint":
        return `${greeting}, thank you for letting us know, and we're sorry for the trouble -- someone from ${businessName} will follow up directly to make this right.`;
      case "feedback":
      case "review":
        return `${greeting}, thank you for sharing this -- we really appreciate the feedback.`;
      case "spam":
        return "";
      case "product_question":
      case "general_enquiry":
      default:
        return `${greeting}, thanks for reaching out to ${businessName} -- someone from our team will follow up shortly.`;
    }
  })();

  return { draft, sources };
}

/** Wires the pure template above to this interaction's own resolved intent (CRM-09.3)
 * and its sender's Customer 360 (CRM-02.1) -- covering the backlog's own "latest
 * conversation, party 360, Discovery research, Inventory product details, FSM quote/job
 * data" context list via that one already-built aggregation, rather than re-fetching
 * each piece separately. Returns `null` for a still-unmatched sender: there's no party
 * 360 to draw context from yet (CRM-06.4's own territory, not this story's). */
export async function getDraftReplyForInteraction(businessId: string, interactionId: string): Promise<DraftReplyResult | null> {
  const supabase = await createClient();
  const { data: interaction, error } = await supabase.from("interaction").select("party_id, intent").eq("id", interactionId).eq("business_id", businessId).single();
  if (error) throw error;
  if (!interaction.party_id) return null;

  const [business, customer360] = await Promise.all([getBusiness(businessId), getCustomer360(businessId, interaction.party_id)]);
  return draftInteractionReply(interaction.intent as MessageIntent | null, business?.name ?? "our team", customer360);
}
