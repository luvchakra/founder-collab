function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** **bold** -> <strong>, escaping everything else. Mirrors the same markdown-lite subset
 * the chat feature already uses (components/chat/chat-markdown.tsx) -- one small,
 * consistent convention across the app rather than a second parser. */
function inlineToHtml(text: string): string {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .map((part) => {
      const match = part.match(/^\*\*(.+)\*\*$/);
      return match ? `<strong>${escapeHtml(match[1] ?? "")}</strong>` : escapeHtml(part);
    })
    .join("");
}

function bodyToHtmlParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#27272a;">${inlineToHtml(p)}</p>`,
    )
    .join("");
}

/**
 * A minimal, inline-styled HTML email -- inline styles because most email clients strip
 * <style> blocks, so this is the only reliable way to get consistent formatting. The
 * brand header is the sender's own product/business name (there's no logo-upload feature
 * to source an actual image from), the footer links to a real website when one is on
 * file, never a fabricated social link, and the CTA is a mailto: reply to the configured
 * from-address -- the only "call to action" that's genuinely real without inventing a
 * scheduling/booking integration this app doesn't have.
 */
export function renderEmailHtml(input: {
  brandName: string;
  body: string;
  websiteUrl: string | null;
  replyToEmail: string;
}): string {
  const { brandName, body, websiteUrl, replyToEmail } = input;
  const footerLink = websiteUrl
    ? ` · <a href="${escapeHtml(websiteUrl)}" style="color:#71717a;text-decoration:none;">${escapeHtml(
        websiteUrl.replace(/^https?:\/\//, ""),
      )}</a>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e4e4e7;">
                <span style="font-size:18px;font-weight:700;color:#18181b;">${escapeHtml(brandName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                ${bodyToHtmlParagraphs(body)}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                  <tr>
                    <td style="border-radius:6px;background-color:#18181b;">
                      <a href="mailto:${escapeHtml(replyToEmail)}" style="display:inline-block;padding:10px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Reply to this email</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e4e4e7;">
                <p style="margin:0;font-size:12px;color:#71717a;">${escapeHtml(brandName)}${footerLink}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plain-text fallback for clients that don't render HTML -- same content, ** markers
 * stripped rather than converted. */
export function renderEmailText(body: string): string {
  return body.replace(/\*\*(.+?)\*\*/g, "$1");
}
