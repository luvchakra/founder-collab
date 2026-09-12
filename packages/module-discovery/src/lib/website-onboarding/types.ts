import type { WebsiteBusinessProfile } from "../ai/schemas";

export const WEBSITE_ONBOARDING_STATUS_VALUES = ["pending", "running", "succeeded", "failed"] as const;
export type WebsiteOnboardingStatus = (typeof WEBSITE_ONBOARDING_STATUS_VALUES)[number];

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
