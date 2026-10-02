import { recordUnsubscribe } from "@cofounderai/core/privacy/suppression";
import { verifyUnsubscribeToken } from "@cofounderai/core/privacy/unsubscribe-token";

/**
 * PRIV-1: the public opt-out endpoint behind every outreach email's unsubscribe link and
 * List-Unsubscribe header (`@cofounderai/core/privacy/suppression#prepareOutreachEmail`).
 *
 * GET only shows a confirmation button: mail-security scanners prefetch every link in an
 * email, so a GET must never change anything. POST records the opt-out -- it is both the
 * button's target and the RFC 8058 one-click endpoint mail clients call directly (body
 * `List-Unsubscribe=One-Click`). No login: the signed token is the authorisation, and it
 * carries only a hash of the address. Repeating it is harmless.
 */

export const dynamic = "force-dynamic";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f6fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<main style="background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:32px;max-width:420px;margin:16px">
<h1 style="font-size:20px;margin:0 0 12px;color:#111827">${title}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const invalid = () =>
  page(
    "Link not valid",
    `<p style="color:#4b5563">This unsubscribe link is invalid or incomplete. Reply to the email you received and ask to be removed instead.</p>`,
    400,
  );

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!verifyUnsubscribeToken(token)) return invalid();
  return page(
    "Unsubscribe",
    `<p style="color:#4b5563">Stop receiving emails from this sender?</p>
<form method="post" action="/api/unsubscribe?t=${escapeHtml(encodeURIComponent(token!))}"><button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(request: Request) {
  const parsed = verifyUnsubscribeToken(new URL(request.url).searchParams.get("t"));
  if (!parsed) return invalid();
  try {
    await recordUnsubscribe(parsed.businessId, parsed.emailHash);
  } catch {
    // Report the real outcome: the opt-out was not recorded.
    return page(
      "Something went wrong",
      `<p style="color:#4b5563">We couldn't record your request just now. Please try again, or reply to the email and ask to be removed.</p>`,
      500,
    );
  }
  return page("You're unsubscribed", `<p style="color:#4b5563">You won't receive further emails from this sender.</p>`);
}
