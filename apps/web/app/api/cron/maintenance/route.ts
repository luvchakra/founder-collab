import { NextResponse } from "next/server";
import { createAdminClient } from "@cofounderai/core/db/admin";
import { expireGracePeriods } from "@cofounderai/core/licensing/lifecycle";
import { bearerTokenMatches } from "@cofounderai/core/security/timing-safe";

/**
 * Daily housekeeping -- point a scheduler at it once a day with
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron's convention), alongside the
 * existing /api/cron/drain-events.
 *
 * - expireGracePeriods() (C-4): moves cancelled licenses past their 30-day read-only
 *   grace to 'expired' (ADR-9 -- data is kept, access ends). It had no scheduler before.
 * - core.run_retention(): every storage-limitation rule (GDPR Art. 5(1)(e); DPDP s.8(7)) --
 *   rate-limit counters, gateway webhook payloads, processed domain events, closed
 *   privacy-request addresses, and audit entries past the 8-year financial retention.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const licensesExpired = await expireGracePeriods();
  const { data: retention, error } = await createAdminClient({ schema: "core" }).rpc("run_retention");
  if (error) {
    console.error("[cron:maintenance] retention failed:", error.message);
    return NextResponse.json({ licensesExpired, error: "Retention failed" }, { status: 500 });
  }
  return NextResponse.json({ licensesExpired, retention });
}
