import { cache } from "react";
import { createClient } from "../../db/server";
import type { WebsiteOnboardingOfferingCandidate, WebsiteOnboardingPage, WebsiteOnboardingRun } from "./types";

/** The one onboarding run this business page cares about "right now" -- most-recent
 * first, same "most recent reflects current state" convention `getProspectSummaryForParty`
 * (08.1) already established for an opportunity. A retry (lib/website-onboarding/mutations.ts's
 * own createWebsiteOnboardingRun) creates a new row rather than reusing the failed one, so
 * this naturally picks up the latest attempt without any extra bookkeeping. */
export const getLatestWebsiteOnboardingRun = cache(async (
  businessId: string,
): Promise<WebsiteOnboardingRun | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_onboarding_runs")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** By-id lookup for the streaming route handler, which only ever has the run id (passed
 * from the client that created it) -- not wrapped in cache() since a route handler makes
 * exactly one call per request, unlike the page-render call above. */
export async function getWebsiteOnboardingRun(runId: string): Promise<WebsiteOnboardingRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_onboarding_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** DISC-OFFER-P0-09.2's own "crawl progress is visible" / "store source URL and
 * retrieval timestamp" -- the pages a run's crawl actually attempted, fetch order (the
 * order they were inserted in). `cache()`-wrapped for the same reason
 * getLatestWebsiteOnboardingRun is -- both are read on the business page's render. */
export const listWebsiteOnboardingPages = cache(async (runId: string): Promise<WebsiteOnboardingPage[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_onboarding_pages")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

/** DISC-OFFER-P0-09.3's own proposed offerings for a run, in extraction order (the order
 * they were inserted in). `cache()`-wrapped for the same render-time reuse reason
 * `listWebsiteOnboardingPages` is. */
export const listWebsiteOnboardingOfferingCandidates = cache(
  async (runId: string): Promise<WebsiteOnboardingOfferingCandidate[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("website_onboarding_offering_candidates")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
);
