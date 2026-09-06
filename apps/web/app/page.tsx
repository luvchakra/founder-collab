import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";

// co-founder-ai's own "/" is its marketing landing page (components/marketing/*, not
// yet ported — tracked in docs/PORT-PROVENANCE.md). Until then, "/" just routes to
// somewhere real instead of the P-0 scaffold's fabricated DashboardShell preview.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
