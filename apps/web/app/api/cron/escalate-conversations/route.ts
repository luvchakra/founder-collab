import { NextResponse } from "next/server";
import { runEscalationSweep } from "@cofounderai/module-crm/lib/escalation/mutations";

/**
 * CRM-09.8's timed ladder: sweeps every actively-`crm`-licensed business's still-open
 * commercial interactions and climbs each one's escalation follow-up to whatever stage
 * its own configured delays say it's reached. Same shared-secret auth as every other
 * cron route in this app.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runEscalationSweep();
  return NextResponse.json(result);
}
