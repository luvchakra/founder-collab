import { NextResponse } from "next/server";
import { runDueRecurringEntries } from "@cofounderai/module-gst/lib/accounting/recurring-mutations";

/**
 * Posts every business's due recurring journal entries — rent, depreciation,
 * subscriptions. Point a scheduler at this daily.
 *
 * Authenticated by the same shared secret as the other cron routes here, since the caller
 * is a scheduler rather than a logged-in user.
 *
 * Safe to run as often as you like, and safe to miss: each occurrence carries an
 * idempotency key derived from its template and date, so a double run collides on the
 * entry that already exists, and a run that was missed for a week catches up the whole
 * backlog rather than only the most recent occurrence.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueRecurringEntries();
  return NextResponse.json(result);
}
