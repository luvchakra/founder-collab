import { createClient } from "../../db/server";
import type { WebsiteBusinessProfile } from "../ai/schemas";
import type { CrawledPage } from "../ai/website-crawl";
import type { WebsiteOnboardingRun } from "./types";

/** Creates a fresh `pending` run -- both the initial "just created this business" call
 * (createBusinessFromWebsiteAction) and a founder-triggered "Retry" after a failure use
 * this same function. A retry deliberately inserts a new row rather than resetting the
 * failed one, the same append-style precedent `ai_runs`/`prospect_scores` already
 * established elsewhere in this schema -- the failed attempt stays visible in history
 * instead of being overwritten away. */
export async function createWebsiteOnboardingRun(
  businessId: string,
  website: string,
): Promise<WebsiteOnboardingRun> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_onboarding_runs")
    .insert({ business_id: businessId, website, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markWebsiteOnboardingRunRunning(runId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("website_onboarding_runs")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", runId);
  if (error) throw error;
}

export async function completeWebsiteOnboardingRun(
  runId: string,
  profile: WebsiteBusinessProfile,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("website_onboarding_runs")
    .update({ status: "succeeded", profile, completed_at: new Date().toISOString(), error: null })
    .eq("id", runId);
  if (error) throw error;
}

export async function failWebsiteOnboardingRun(runId: string, errorMessage: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("website_onboarding_runs")
    .update({ status: "failed", error: errorMessage, completed_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;
}

/**
 * DISC-OFFER-P0-09.2's own "store source URL and retrieval timestamp." Bulk-inserted once
 * the crawl finishes (whether the overall run succeeded or the homepage fetch itself
 * failed with nothing crawled at all -- an empty `pages` array is a safe no-op insert
 * either way, so the route handler can call this unconditionally rather than branching).
 * Append-only, same as the run itself: a retry's own crawl gets its own fresh run row and
 * its own fresh set of page rows, never overwriting a prior attempt's.
 */
export async function recordWebsiteOnboardingPages(runId: string, pages: CrawledPage[]): Promise<void> {
  if (pages.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("website_onboarding_pages").insert(
    pages.map((page) => ({
      run_id: runId,
      url: page.url,
      category: page.category,
      status: page.status,
      error: page.error,
      fetched_at: page.fetchedAt,
    })),
  );
  if (error) throw error;
}
