import type { WebsiteBusinessProfile } from "../ai/schemas";
import type { WebsitePageCategory } from "./crawl-plan";

export const WEBSITE_ONBOARDING_STATUS_VALUES = ["pending", "running", "succeeded", "failed"] as const;
export type WebsiteOnboardingStatus = (typeof WEBSITE_ONBOARDING_STATUS_VALUES)[number];

export const WEBSITE_ONBOARDING_PAGE_STATUS_VALUES = ["succeeded", "failed"] as const;
export type WebsiteOnboardingPageStatus = (typeof WEBSITE_ONBOARDING_PAGE_STATUS_VALUES)[number];

/** discovery.website_onboarding_pages -- DISC-OFFER-P0-09.2. One row per page the crawl
 * actually attempted (homepage plus whichever internal pages robots.txt allowed and the
 * crawl plan chose), recording the story's own "store source URL and retrieval
 * timestamp" -- only pages that were fetched, never pages skipped by robots/dedup/cap
 * (those were never attempted, so there is nothing to record). */
export type WebsiteOnboardingPage = {
  id: string;
  run_id: string;
  url: string;
  category: WebsitePageCategory;
  status: WebsiteOnboardingPageStatus;
  error: string | null;
  fetched_at: string;
  created_at: string;
};

/** discovery.website_onboarding_runs -- DISC-OFFER-P0-09.1. Business_id-scoped, not
 * workspace_id-scoped: this runs before any offering/workspace exists. */
export type WebsiteOnboardingRun = {
  id: string;
  business_id: string;
  website: string;
  status: WebsiteOnboardingStatus;
  profile: WebsiteBusinessProfile | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
