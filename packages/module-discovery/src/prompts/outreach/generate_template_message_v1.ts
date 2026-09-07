import type { ProductProfile } from "../../lib/ai/schemas";
import type { Prospect } from "../../lib/prospects/types";
import type { Contact } from "../../lib/contacts/types";
import type { OutreachStrategy } from "../../lib/outreach/types";
import type { ResendTemplateVariable } from "../../lib/messages/resend-templates";

export const GENERATE_TEMPLATE_MESSAGE_PROMPT_VERSION = "generate_template_message_v1";

/**
 * Same context as generate_message_v1's free-form prompt, but asks the model to fill in
 * a Resend template's own named variables instead of writing a subject+body -- this is
 * the "seamless, minimum user effort" path: the founder only picks a template, the model
 * infers every variable's value from the prospect/contact/strategy/product context so
 * there's nothing left to hand-fill before review.
 */
export function generateTemplateMessagePrompt(input: {
  productName: string;
  productProfile: ProductProfile;
  prospect: Prospect;
  contact: Contact | null;
  strategy: OutreachStrategy;
  templateName: string;
  variables: ResendTemplateVariable[];
}): string {
  const contactLine = input.contact
    ? `Writing to: ${[input.contact.first_name, input.contact.last_name].filter(Boolean).join(" ") || "them"}${input.contact.job_title ? `, ${input.contact.job_title}` : ""}.`
    : "No specific contact name -- fill name-shaped variables generically (e.g. by role, or leave them as their fallback) if there is no real name to use.";

  const variablesList = input.variables
    .map(
      (v) =>
        `- ${v.key} (${v.type})${v.fallback_value != null ? `, fallback if nothing fits: ${v.fallback_value}` : ""}`,
    )
    .join("\n");

  return `Fill in the variables of the email template "${input.templateName}" for an outreach
message to "${input.prospect.company_name}" from "${input.productName}".

${contactLine}

Approved strategy to follow:
- Why we're reaching out: ${input.strategy.strategy}
- Key message/angle: ${input.strategy.key_message}
- Call to action: ${input.strategy.cta}

Only reference product facts from this profile -- do not invent customers, statistics, integrations, features, or case studies that aren't stated here:
${JSON.stringify(input.productProfile, null, 2)}

TEMPLATE VARIABLES TO FILL (fill every one; use a variable's fallback value only when
nothing in the context above genuinely fits it -- never invent a name, number, or fact
to avoid leaving a variable at its fallback):
${variablesList}

Write in a natural, human tone -- not generic sales copy. No placeholder brackets like [Name].`;
}
