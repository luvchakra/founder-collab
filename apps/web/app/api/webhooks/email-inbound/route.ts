import { NextResponse } from "next/server";
import { ingestInboundEmail } from "@cofounderai/module-discovery/lib/conversations/ingest-inbound-email";

/**
 * Provider-agnostic inbound email webhook (Epic 9). Point your email provider's
 * inbound-parse webhook (Postmark, SendGrid, Mailgun, etc.) here; if its payload shape
 * differs, translate it to { from, subject?, text } upstream -- most providers already
 * expose a "from" address and a plain-text body close to this.
 *
 * Authenticated via a shared secret header rather than Supabase Auth, since the caller is
 * a third-party provider, not a logged-in user.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-webhook-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.from !== "string" || typeof body.text !== "string") {
    return NextResponse.json(
      { error: "Expected JSON body { from: string, text: string, subject?: string }" },
      { status: 400 },
    );
  }

  const result = await ingestInboundEmail({
    from: body.from,
    subject: typeof body.subject === "string" ? body.subject : null,
    text: body.text,
  });

  if (!result.matched) {
    // 200, not an error -- an unmatched sender (e.g. an out-of-office auto-reply from an
    // address we don't track) isn't a webhook failure, and returning an error status would
    // make most providers retry indefinitely.
    return NextResponse.json({ matched: false, reason: result.reason });
  }
  return NextResponse.json({ matched: true, messageId: result.message.id });
}
