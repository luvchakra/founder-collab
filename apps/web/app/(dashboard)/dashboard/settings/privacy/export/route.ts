import { createClient } from "@cofounderai/core/db/server";
import { buildPersonalDataExport } from "@cofounderai/core/privacy/export";
import { checkRateLimit } from "@cofounderai/core/security/rate-limit";

/**
 * Self-service download of everything held about the signed-in user (GDPR Arts. 15/20;
 * DPDP s.11) as JSON. Lives under /dashboard so the proxy's login + MFA enforcement
 * covers it; rate-limited because it fans out across every table holding the user's data.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit("privacy-export", user.id, { windowSeconds: 3600, max: 5 }))) {
    return Response.json({ error: "Too many exports -- try again in an hour." }, { status: 429 });
  }

  const data = await buildPersonalDataExport(user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cofounderai-personal-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
