import { createClient } from "@cofounderai/core/db/server";
import { buildPersonalDataExport } from "@cofounderai/core/privacy/export";

/**
 * PRIV-2: "Download my data" on the Profile page. The user id comes only from the
 * session -- there is no parameter to point it at anyone else.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in to download your data.", { status: 401 });

  const data = await buildPersonalDataExport(user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
