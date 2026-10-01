import { Resend } from "resend";
import { createClient } from "../../db/server";
import { listContacts } from "../contacts/queries";
import { getProspect } from "../prospects/queries";
import { getBusiness, getProduct, getWorkspace } from "../tenancy/queries";
import { getOrCreateConversation, markConversationAwaitingReply } from "../conversations/mutations";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { emailHash, isEmailSuppressed } from "@cofounderai/core/privacy/suppression";
import { createUnsubscribeToken } from "@cofounderai/core/privacy/unsubscribe-token";
import { SITE_URL } from "@cofounderai/core/site";
import type { Message } from "./types";

/** Sends an approved outbound email via Resend and records the real outcome on the
 * message row (docs/prospects-pipeline-redesign-requirements.md R1/R2) -- status
 * becomes the provider's actual result ('sent' or 'failed' with a reason), never a
 * manual self-report. Only the email channel has a send integration; linkedin/whatsapp
 * messages are still marked sent by the founder by hand after delivering them. */
export async function sendMessage(messageId: string): Promise<Message> {
  const supabase = await createClient();
  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (fetchError) throw fetchError;

  if (message.channel !== "email") {
    throw new Error("Automatic sending is only available for the email channel.");
  }
  if (message.status !== "approved" && message.status !== "failed") {
    throw new Error("Approve the message before sending.");
  }

  const prospect = await getProspect(message.prospect_id);
  if (!prospect) throw new Error("Prospect not found.");

  const contacts = await listContacts(message.prospect_id);
  const toEmail = message.contact_id
    ? (contacts.find((c) => c.id === message.contact_id)?.email ?? null)
    : (contacts.find((c) => c.email)?.email ?? null);
  if (!toEmail) {
    throw new Error("No contact email on file -- add a contact with an email before sending.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    throw new Error(
      "Email sending isn't configured yet -- set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }

  const workspace = await getWorkspace(message.workspace_id);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const business = product ? await getBusiness(product.business_id) : null;
  const brandName = product?.name ?? business?.name ?? prospect.company_name;
  const websiteUrl = product?.website ?? business?.website ?? null;

  // Never email someone who opted out, complained, hard-bounced or asked to be erased
  // (core.communication_suppressions -- GDPR Art. 21(3), DPDP s.6(4)).
  if (business && (await isEmailSuppressed(business.id, toEmail))) {
    throw new Error("This contact has opted out of email from this business -- it can't be sent.");
  }
  const unsubscribeUrl = business
    ? `${SITE_URL}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(business.id, emailHash(toEmail)))}`
    : null;

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: message.subject ?? `Quick note for ${prospect.company_name}`,
    text: renderEmailText(message.content, unsubscribeUrl),
    html: renderEmailHtml({
      brandName,
      body: message.content,
      websiteUrl,
      replyToEmail: fromAddress,
      unsubscribeUrl,
    }),
    // RFC 8058 one-click unsubscribe -- also required by Gmail/Yahoo for bulk senders.
    headers: unsubscribeUrl
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
  });

  if (result.error) {
    const { data, error } = await supabase
      .from("messages")
      .update({ status: "failed", failure_reason: result.error.message })
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const conversation = await getOrCreateConversation(
    message.workspace_id,
    message.prospect_id,
    message.contact_id,
    message.channel,
  );

  const { data, error } = await supabase
    .from("messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      conversation_id: conversation.id,
      provider_message_id: result.data?.id ?? null,
      failure_reason: null,
    })
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;

  await markConversationAwaitingReply(conversation.id);
  return data;
}
