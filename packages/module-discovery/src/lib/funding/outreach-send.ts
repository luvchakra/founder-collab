import { Resend } from "resend";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";

/**
 * FND-11 — the investor-outreach delivery adapter (§27.3). Uses the same provider and
 * email rendering as Discovery's prospect outreach (lib/messages/send.ts) without
 * reshaping that stable code around investors. It reports only what the provider said:
 * success carries the provider's message id, anything else is a failure with its reason.
 */
export type DeliveryResult = { ok: true; provider: string; messageId: string } | { ok: false; provider: string; reason: string };

export async function deliverInvestorEmail(input: {
  to: string;
  subject: string;
  body: string;
  brandName: string;
  websiteUrl: string | null;
}): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false, provider: "resend", reason: "Email sending isn't configured yet (RESEND_API_KEY and RESEND_FROM_EMAIL)." };
  }
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: renderEmailText(input.body),
    html: renderEmailHtml({ brandName: input.brandName, body: input.body, websiteUrl: input.websiteUrl, replyToEmail: from }),
  });
  if (result.error || !result.data?.id) {
    return { ok: false, provider: "resend", reason: result.error?.message ?? "The email provider did not confirm the send." };
  }
  return { ok: true, provider: "resend", messageId: result.data.id };
}
