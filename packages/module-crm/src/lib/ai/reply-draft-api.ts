import { createAdminClient } from "@cofounderai/core/db/admin";
import { listOfferingKnowledgeForBusinessService } from "@cofounderai/module-discovery/contract/index";
import { buildReplyFacts } from "./reply-draft-core";
import { runReplyDraft, type StoredReplyDraft } from "./reply-draft";

/**
 * PLATFORM-P1-12.7 -- the MCP server's `draft_whatsapp_reply`: the same AI reply draft as
 * CRM → Conversations' "Draft with AI", for an agent connected with a business API key.
 *
 * There is no signed-in session on an MCP call, so this file does what RLS would otherwise
 * do: every read and write is pinned to the API key's own business, the CRM licence is checked
 * explicitly (as the public API's routers do), and the key must carry `crm.view`. Orders and
 * jobs are read through the public API with the caller's own key (`readList`), so Inventory
  * and FSM keep checking their own licences. Offering knowledge comes from Discovery's
 * no-session contract read, pinned to the same business (empty when Discovery isn't
 * licensed). Draft only -- nothing is sent.
 */

export class ReplyDraftRefused extends Error {}

export type ReadList = (resource: "sales-orders" | "jobs") => Promise<Record<string, unknown>[] | null>;

export type ApiReplyDraft = StoredReplyDraft & { conversationId: string; interactionId: string; customerMessage: string };

export async function generateReplyDraftForApiKey(input: {
  businessId: string;
  permissions: string[];
  conversationId: string;
  readList: ReadList;
}): Promise<ApiReplyDraft> {
  const { businessId, conversationId } = input;
  const core = createAdminClient({ schema: "core" });
  const crm = createAdminClient({ schema: "crm" });

  const { data: licensed, error: licenseError } = await core.rpc("has_module", { p_business_id: businessId, p_key: "crm" });
  if (licenseError) throw new Error("Could not verify the CRM licence.");
  if (!licensed) throw new ReplyDraftRefused("MODULE_NOT_LICENSED: this business doesn't have an active CRM licence.");
  if (!input.permissions.includes("crm.view")) {
    throw new ReplyDraftRefused("This API key doesn't have the 'crm.view' permission. Reissue it from a role that has it.");
  }

  const { data: interaction, error } = await crm
    .from("interaction")
    .select("id, party_id, channel, content_excerpt")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not read the conversation.");
  if (!interaction) throw new ReplyDraftRefused("No customer message found in that conversation for this business.");
  if (interaction.channel !== "whatsapp") throw new ReplyDraftRefused("That conversation isn't on WhatsApp.");
  const message = (interaction.content_excerpt ?? "").trim();
  if (!message) throw new ReplyDraftRefused("The latest customer message has no text to answer.");

    const [business, settings, items, orders, jobs, knowledge] = await Promise.all([
    core.from("businesses").select("name, description, website, contact_phone, contact_email, address, opening_hours").eq("id", businessId).single(),
    core.from("business_settings").select("currency").eq("business_id", businessId).maybeSingle(),
    core.from("items").select("id, name, description, unit, selling_price, status").eq("business_id", businessId).eq("status", "active").limit(100),
    interaction.party_id ? input.readList("sales-orders") : Promise.resolve(null),
        interaction.party_id ? input.readList("jobs") : Promise.resolve(null),
    listOfferingKnowledgeForBusinessService(businessId),
  ]);
  if (business.error || !business.data) throw new Error("Could not read the business.");

  const partyId = interaction.party_id as string | null;
  const facts = buildReplyFacts({
    business: business.data,
    currency: (settings.data as { currency?: string } | null)?.currency ?? null,
    items: items.data ?? [],
        knowledge: knowledge.ok ? knowledge.data : [],
    orders: (orders ?? [])
      .filter((o) => partyId && o.customer_id === partyId)
      .map((o) => ({ id: String(o.id), number: String(o.so_number ?? ""), status: String(o.status ?? ""), orderDate: String(o.order_date ?? o.created_at ?? "") })),
    jobs: (jobs ?? [])
      .filter((j) => partyId && j.party_id === partyId)
      .map((j) => ({ id: String(j.id), number: (j.number as string | null) ?? null, status: String(j.status ?? ""), scheduledAt: (j.started_at as string | null) ?? null })),
  });

  const draft = await runReplyDraft({
    db: crm as unknown as Parameters<typeof runReplyDraft>[0]["db"],
    aiClient: core,
    businessId,
    interactionId: interaction.id as string,
    message,
    businessName: business.data.name,
    facts,
    createdBy: null,
  });
  return { ...draft, conversationId, interactionId: interaction.id as string, customerMessage: message };
}
