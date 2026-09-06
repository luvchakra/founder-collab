import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { Contact } from "../../lib/contacts/types";
import type { MessageChannel, MessageClassification } from "../../lib/messages/types";

export const GENERATE_REPLY_PROMPT_VERSION = "generate_reply_v2";

const CHANNEL_GUIDANCE: Record<MessageChannel, string> = {
  email:
    "A short, professional email reply. Include a subject line (prefix with 'Re: ' if " +
    "natural; subject only -- never repeat it in the body). Write the body as 2-4 short " +
    "paragraphs separated by a blank line, not one block of text. Wrap the single phrase " +
    "or sentence the prospect will care about most in **double asterisks** to emphasize " +
    "it -- exactly one such phrase, not every sentence.",
  linkedin: "A short LinkedIn DM reply. Under 80 words. No subject line.",
  whatsapp: "A very short, casual WhatsApp reply. Under 40 words. No subject line.",
};

export function generateReplyPrompt(input: {
  productName: string;
  productProfile: ProductProfile;
  prospect: Prospect;
  contact: Contact | null;
  channel: MessageChannel;
  replyContent: string;
  classification: MessageClassification;
  recommendedAction: string;
}): string {
  const contactLine = input.contact
    ? `Replying to: ${[input.contact.first_name, input.contact.last_name].filter(Boolean).join(" ") || "them"}${input.contact.job_title ? `, ${input.contact.job_title}` : ""}.`
    : "No specific contact name -- address them generically.";

  return `Write a ${input.channel} follow-up reply to "${input.prospect.company_name}" from "${input.productName}", responding to what they just said.

${CHANNEL_GUIDANCE[input.channel]}

${contactLine}

Their reply (classified as "${input.classification}"):
"""
${input.replyContent}
"""

Recommended next step: ${input.recommendedAction}

Only reference product facts from this profile -- do not invent customers, statistics, integrations, features, or case studies that aren't stated here:
${JSON.stringify(input.productProfile, null, 2)}

Write in a natural, human tone that directly acknowledges what they said -- not a generic template. No placeholder brackets like [Name].`;
}
