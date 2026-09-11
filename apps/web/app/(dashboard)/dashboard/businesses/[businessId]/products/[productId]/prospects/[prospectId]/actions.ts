"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  updateProspect,
  updateProspectStatus,
  setProspectOutcome,
} from "@cofounderai/module-discovery/lib/prospects/mutations";
import type { ProspectStatus } from "@cofounderai/module-discovery/lib/prospects/types";
import {
  createContact,
  updateContact,
  deleteContact,
} from "@cofounderai/module-discovery/lib/contacts/mutations";
import { researchProspect } from "@cofounderai/module-discovery/lib/ai/research-prospect";
import { generateResearchBrief } from "@cofounderai/module-discovery/lib/ai/generate-research-brief";
import { scoreProspect } from "@cofounderai/module-discovery/lib/scoring/score-prospect";
import { generateOutreachStrategy } from "@cofounderai/module-discovery/lib/ai/generate-strategy";
import { approveOutreachStrategy, updateOutreachStrategy } from "@cofounderai/module-discovery/lib/outreach/mutations";
import type { OutreachChannel } from "@cofounderai/module-discovery/lib/outreach/types";
import { generateOutreachMessage } from "@cofounderai/module-discovery/lib/ai/generate-message";
import { generateReply } from "@cofounderai/module-discovery/lib/ai/generate-reply";
import {
  updateMessageContent,
  updateMessageContact,
  approveMessage,
  markMessageSent,
  deleteMessage,
} from "@cofounderai/module-discovery/lib/messages/mutations";
import { sendMessage } from "@cofounderai/module-discovery/lib/messages/send";
import {
  closeConversation,
  logInboundReply,
} from "@cofounderai/module-discovery/lib/conversations/mutations";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { promoteProspectToCrm, recordInteraction } from "@cofounderai/module-crm/contract/index";
import type { RecordInteractionInput } from "@cofounderai/module-crm/lib/interactions/types";
import type { MessageChannel, MessageClassification } from "@cofounderai/module-discovery/lib/messages/types";

/** CRM-03.2: which classifications are meaningful enough to become a CRM interaction at
 * all (not spam/noise -- out_of_office and unsubscribe are signal-free for CRM purposes),
 * and which of those need `requires_response = true` (a definitive "not interested" is
 * still worth recording for the relationship timeline, but nobody needs to act on it). */
const CRM_INTERACTION_CLASSIFICATIONS: Partial<Record<MessageClassification, { requiresResponse: boolean }>> = {
  interested: { requiresResponse: true },
  question: { requiresResponse: true },
  objection: { requiresResponse: true },
  not_interested: { requiresResponse: false },
};

const DISCOVERY_TO_CRM_CHANNEL: Record<MessageChannel, RecordInteractionInput["channel"]> = {
  email: "email",
  whatsapp: "whatsapp",
  linkedin: "other",
};

function prospectPath(businessId: string, productId: string, prospectId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/prospects/${prospectId}`;
}

function conversionsPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/conversions`;
}

export async function updateProspectAction(
  businessId: string,
  productId: string,
  prospectId: string,
  formData: FormData,
) {
  await updateProspect(prospectId, {
    companyName: String(formData.get("companyName") ?? ""),
    website: String(formData.get("website") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    companySize: String(formData.get("companySize") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    twitterUrl: String(formData.get("twitterUrl") ?? ""),
    companyEmail: String(formData.get("companyEmail") ?? ""),
  });
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function updateProspectStatusAction(
  businessId: string,
  productId: string,
  prospectId: string,
  formData: FormData,
) {
  const status = String(formData.get("status") ?? "new") as ProspectStatus;
  await updateProspectStatus(prospectId, status);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function addContactAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  prospectId: string,
  formData: FormData,
) {
  await createContact(workspaceId, prospectId, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? ""),
    email: String(formData.get("email") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function updateContactAction(
  businessId: string,
  productId: string,
  prospectId: string,
  contactId: string,
  formData: FormData,
) {
  await updateContact(contactId, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? ""),
    email: String(formData.get("email") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function deleteContactAction(
  businessId: string,
  productId: string,
  prospectId: string,
  contactId: string,
) {
  await deleteContact(contactId);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function researchProspectAction(
  businessId: string,
  productId: string,
  prospectId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    await researchProspect(prospectId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

export async function generateResearchBriefAction(
  businessId: string,
  productId: string,
  prospectId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    await generateResearchBrief(prospectId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

export async function scoreProspectAction(
  businessId: string,
  productId: string,
  prospectId: string,
) {
  await scoreProspect(prospectId);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function generateStrategyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const contactId = String(formData.get("contactId") ?? "") || null;
    await generateOutreachStrategy(prospectId, contactId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

export async function approveStrategyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  strategyId: string,
) {
  await approveOutreachStrategy(strategyId);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

/** Item #5 of a UX pass: lets the founder edit an AI-generated strategy directly
 * (draft or already-approved) instead of only regenerating or approving as-is. */
export async function updateStrategyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  strategyId: string,
  formData: FormData,
) {
  await updateOutreachStrategy(strategyId, {
    strategy: String(formData.get("strategy") ?? ""),
    channel: String(formData.get("channel") ?? "email") as OutreachChannel,
    keyMessage: String(formData.get("keyMessage") ?? ""),
    cta: String(formData.get("cta") ?? ""),
  });
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function generateMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  strategyId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  const resendTemplateId = String(formData.get("resendTemplateId") ?? "").trim() || undefined;
  return runAiAction(async () => {
    await generateOutreachMessage(strategyId, resendTemplateId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

export async function updateMessageContentAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
  formData: FormData,
) {
  const subject = formData.has("subject") ? String(formData.get("subject")) : null;
  await updateMessageContent(messageId, String(formData.get("content") ?? ""), subject);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function approveMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
) {
  await approveMessage(messageId);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function markMessageSentAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
) {
  await markMessageSent(messageId);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

/** Email-channel "Approve" (docs/prospects-pipeline-redesign-requirements.md R1) --
 * approving an email message sends it immediately via lib/messages/send.ts instead of
 * waiting for a separate manual "Mark sent" click. A pre-flight failure (no contact
 * email, sending not configured) surfaces through AiActionState rather than throwing,
 * same as the AI actions above; a real provider-side send failure is recorded on the
 * message row itself (status 'failed') and read back on revalidate, not thrown here. */
export async function approveAndSendMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const contactId = String(formData.get("contactId") ?? "") || null;
    if (contactId) await updateMessageContact(messageId, contactId);
    await approveMessage(messageId);
    await sendMessage(messageId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

/** Retries sending an already-approved (or previously failed) email message -- R2's
 * "Retry" action. */
export async function sendMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const contactId = String(formData.get("contactId") ?? "") || null;
    if (contactId) await updateMessageContact(messageId, contactId);
    await sendMessage(messageId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

export async function deleteMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
) {
  await deleteMessage(messageId);
  revalidatePath(prospectPath(businessId, productId, prospectId));
}

export async function generateReplyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  conversationId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    await generateReply(conversationId);
    revalidatePath(prospectPath(businessId, productId, prospectId));
  });
}

/** Closing a thread is also the moment the founder records the deal outcome (docs:
 * Conversations redesign) -- the two submit buttons in the form share this one action,
 * each contributing its own `outcome` value. */
export async function closeConversationAction(
  businessId: string,
  productId: string,
  prospectId: string,
  conversationId: string,
  formData: FormData,
) {
  const outcome = String(formData.get("outcome") ?? "");
  await closeConversation(conversationId);
  if (outcome === "won" || outcome === "lost") {
    await setProspectOutcome(prospectId, outcome);
  }
  revalidatePath(prospectPath(businessId, productId, prospectId));

  // Item #7 of a UX pass: marking a prospect "Won" is the moment it becomes a
  // conversion, so land the founder on the Conversions page (scrolled to its own
  // Customers list, via the `#bottom` anchor that page's own JSX carries) instead of
  // leaving them on the prospect page they were just closing out.
  if (outcome === "won") {
    revalidatePath(conversionsPath(businessId, productId));
    redirect(`${conversionsPath(businessId, productId)}#bottom`);
  }
}

/**
 * Logs a prospect's reply typed in by hand (docs section: Conversations redesign) --
 * uses runAiAction/AiActionState like the other AI-invoking actions here because
 * logInboundReply best-effort-classifies the reply, an AI call that can fail on a usage
 * limit or provider error.
 *
 * CRM-03.2: a meaningful classification (see CRM_INTERACTION_CLASSIFICATIONS above)
 * also records a CRM interaction -- best-effort, same as classification itself, since a
 * CRM hiccup must never lose the reply that already saved successfully.
 * `recordInteraction()`'s own party+channel matching (CRM-01.3) reuses an existing open
 * conversation for this party/channel when one exists rather than always starting a new
 * one. `sourceModule`/`sourceReference` keep the original Discovery prospect traceable.
 * Nothing is recorded when the prospect has no linked `core.parties` row yet.
 */
export async function logInboundReplyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  partyId: string | null,
  conversationId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const content = String(formData.get("content") ?? "");
    const message = await logInboundReply(conversationId, content);
    revalidatePath(prospectPath(businessId, productId, prospectId));

    const rule = message.classification ? CRM_INTERACTION_CLASSIFICATIONS[message.classification] : undefined;
    if (rule && partyId) {
      try {
        await recordInteraction(businessId, {
          partyId,
          channel: DISCOVERY_TO_CRM_CHANNEL[message.channel],
          direction: "inbound",
          occurredAt: message.sent_at ?? undefined,
          contentExcerpt: message.content.slice(0, 500),
          requiresResponse: rule.requiresResponse,
          sourceModule: "discovery",
          sourceReference: prospectId,
          metadata: { discoveryMessageId: message.id, classification: message.classification },
        });
      } catch (err) {
        console.error("[crm] failed to record interaction for Discovery reply:", err);
      }
    }
  });
}

/**
 * CRM-03.1's "Promote to CRM" button. Carries the prospect forward *by reference*
 * (party + prospect id) rather than copying its ICP fit/buying signals/research into a
 * new CRM-side snapshot -- see module-crm's `promoteProspectToLead()` docstring. Returns
 * the contract's own result so the button can distinguish `MODULE_NOT_LICENSED` from a
 * genuine error, same ADR-10 pattern `createOpportunityAction` in the Conversions
 * route already follows.
 */
export async function promoteProspectToCrmAction(businessId: string, productId: string, prospectId: string, partyId: string) {
  const result = await promoteProspectToCrm(businessId, { partyId, prospectId });
  if (result.ok) revalidatePath(prospectPath(businessId, productId, prospectId));
  return result;
}
