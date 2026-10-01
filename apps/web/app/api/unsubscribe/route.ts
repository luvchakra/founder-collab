import { addSuppression } from "@cofounderai/core/privacy/suppression";
import { verifyUnsubscribeToken } from "@cofounderai/core/privacy/unsubscribe-token";
import { checkRateLimit, clientIp } from "@cofounderai/core/security/rate-limit";

/**
 * Public opt-out endpoint for outreach email (privacy/unsubscribe-token.ts).
 *
 * GET only renders a confirmation button: link scanners and mail-security proxies
 * prefetch every URL in an email, so a GET must never change state. POST performs the
 * unsubscribe -- it's both the button's target and the RFC 8058 one-click endpoint mail
 * clients call directly (body "List-Unsubscribe=One-Click"). No login: the signed token
 * is the authorization, and it carries only a hash of the address.
 */
function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f4f6fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<main style="background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:32px;max-width:420px;margin:16px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const INVALID = () =>
  page("Link not valid", `<p style="color:#555">This unsubscribe link is invalid or incomplete. Reply to the email you received and ask to be removed instead.</p>`, 400);

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!verifyUnsubscribeToken(token)) return INVALID();
  const action = `/api/unsubscribe?t=${encodeURIComponent(token!)}`;
  return page(
    "Unsubscribe",
    `<p style="color:#555">Stop receiving emails from this sender?</p>
<form method="post" action="${action}"><button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(request: Request) {
  const allowed = await checkRateLimit("unsubscribe", clientIp(request.headers), { windowSeconds: 3600, max: 30 });
  if (!allowed) return page("Too many requests", `<p style="color:#555">Please try again later.</p>`, 429);

  const parsed = verifyUnsubscribeToken(new URL(request.url).searchParams.get("t"));
  if (!parsed) return INVALID();
  await addSuppression(parsed.businessId, parsed.emailHash, "unsubscribe");
  return page("You're unsubscribed", `<p style="color:#555">You won't receive further emails from this sender.</p>`);
}
