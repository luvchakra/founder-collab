/**
 * MKT-01 — Marketing domain types. Every enum here mirrors a check constraint in
 * supabase/migrations/20260925100000_discovery_marketing.sql; the two are kept in step by
 * hand because the database is the authority and the constants are what the UI and the
 * Zod schemas read. Labels live beside the values so no screen invents its own wording.
 */

export const CAMPAIGN_OBJECTIVES = [
  "awareness",
  "traffic",
  "engagement",
  "lead_generation",
  "qualified_leads",
  "opportunity_creation",
  "customer_acquisition",
  "retention",
  "other",
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CAMPAIGN_OBJECTIVE_LABEL: Record<CampaignObjective, string> = {
  awareness: "Awareness",
  traffic: "Traffic",
  engagement: "Engagement",
  lead_generation: "Lead generation",
  qualified_leads: "Qualified leads",
  opportunity_creation: "Opportunity creation",
  customer_acquisition: "Customer acquisition",
  retention: "Retention",
  other: "Other",
};

export const MARKETING_CHANNELS = [
  "website",
  "seo",
  "linkedin",
  "email",
  "events",
  "partnerships",
  "paid_search",
  "paid_social",
  "communities",
  "referrals",
  "other",
] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const MARKETING_CHANNEL_LABEL: Record<MarketingChannel, string> = {
  website: "Website",
  seo: "SEO",
  linkedin: "LinkedIn",
  email: "Email",
  events: "Events",
  partnerships: "Partnerships",
  paid_search: "Paid search",
  paid_social: "Paid social",
  communities: "Communities",
  referrals: "Referrals",
  other: "Other",
};

export const CAMPAIGN_STATUSES = ["draft", "planned", "active", "paused", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export const CONTENT_TYPES = [
  "blog",
  "social",
  "email",
  "case_study",
  "whitepaper",
  "webinar",
  "video",
  "landing_page",
  "ad_copy",
  "other",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  blog: "Blog",
  social: "LinkedIn / Social",
  email: "Email / Newsletter",
  case_study: "Case study",
  whitepaper: "Whitepaper",
  webinar: "Webinar",
  video: "Video",
  landing_page: "Landing page",
  ad_copy: "Ad copy",
  other: "Other",
};

export const CONTENT_STATUSES = ["idea", "draft", "review", "approved", "scheduled", "published", "archived"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export const ASSET_TYPES = [
  "image",
  "logo",
  "video",
  "pdf",
  "presentation",
  "creative",
  "brand_material",
  "document",
  "other",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  image: "Image",
  logo: "Logo",
  video: "Video",
  pdf: "PDF",
  presentation: "Presentation",
  creative: "Creative",
  brand_material: "Brand material",
  document: "Document",
  other: "Other",
};

export const SEO_CATEGORIES = [
  "metadata",
  "content_gap",
  "topic_coverage",
  "internal_linking",
  "page_structure",
  "keyword_opportunity",
  "conversion",
  "ai_search_visibility",
  "other",
] as const;
export type SeoCategory = (typeof SEO_CATEGORIES)[number];

export const SEO_CATEGORY_LABEL: Record<SeoCategory, string> = {
  metadata: "Metadata",
  content_gap: "Content gap",
  topic_coverage: "Topic coverage",
  internal_linking: "Internal linking",
  page_structure: "Page structure",
  keyword_opportunity: "Keyword opportunity",
  conversion: "Conversion",
  ai_search_visibility: "AI search visibility",
  other: "Other",
};

export const SEO_STATUSES = ["open", "in_progress", "resolved", "dismissed"] as const;
export type SeoStatus = (typeof SEO_STATUSES)[number];

export const SEO_SEVERITIES = ["low", "medium", "high"] as const;
export type SeoSeverity = (typeof SEO_SEVERITIES)[number];

export const METRIC_SOURCES = ["manual", "import", "website", "provider", "computed"] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

export const STRATEGY_STATUSES = ["draft", "active", "archived"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

// ---------------------------------------------------------------------------
// Rows as the query layer returns them
// ---------------------------------------------------------------------------

export interface MarketingCampaign {
  id: string;
  businessId: string;
  offeringId: string | null;
  offeringName: string | null;
  icpProfileId: string | null;
  name: string;
  description: string | null;
  objective: CampaignObjective;
  channel: MarketingChannel;
  budget: number | null;
  currency: string | null;
  startAt: string | null;
  endAt: string | null;
  landingPageUrl: string | null;
  message: string | null;
  cta: string | null;
  utm: Record<string, string>;
  status: CampaignStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A metric snapshot. Every count is `number | null`: null is "this source did not report
 * it", which must stay distinguishable from a reported zero all the way to the screen
 * (spec §10, §40, §52.9).
 */
export interface CampaignMetricRow {
  campaignId: string;
  metricDate: string;
  source: MetricSource;
  impressions: number | null;
  clicks: number | null;
  sessions: number | null;
  engagements: number | null;
  leads: number | null;
  qualifiedLeads: number | null;
  opportunities: number | null;
  customers: number | null;
  revenue: number | null;
  spend: number | null;
  currency: string | null;
}

export interface MarketingContent {
  id: string;
  businessId: string;
  offeringId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  title: string;
  contentType: ContentType;
  brief: string | null;
  body: string | null;
  summary: string | null;
  audience: string | null;
  channel: string | null;
  cta: string | null;
  status: ContentStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  approvedAt: string | null;
  publishedVersionId: string | null;
  externalUrl: string | null;
  seoMetadata: Record<string, string>;
  updatedAt: string;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  versionNumber: number;
  title: string;
  body: string | null;
  summary: string | null;
  origin: "user" | "ai_generated" | "ai_rewritten" | "ai_repurposed";
  createdAt: string;
}

export interface MarketingStrategy {
  id: string;
  businessId: string;
  offeringId: string | null;
  name: string;
  status: StrategyStatus;
  versionNumber: number;
  origin: "user" | "ai_draft";
  positioning: StrategyPositioning;
  valueProposition: StrategyValueProposition;
  differentiation: StrategyDifferentiation;
  targetMarkets: StrategyTargetMarkets;
  messaging: StrategyMessaging;
  channels: MarketingChannel[];
  goals: StrategyGoal[];
  updatedAt: string;
}

export interface StrategyPositioning {
  category?: string;
  targetProblem?: string;
  statement?: string;
  marketContext?: string;
}
export interface StrategyValueProposition {
  headline?: string;
  supportingPoints?: string[];
  proofPoints?: string[];
}
export interface StrategyDifferentiation {
  differentiators?: string[];
  competitorStatements?: string[];
  whyUs?: string;
}
export interface StrategyTargetMarkets {
  regions?: string[];
  industries?: string[];
  companySegments?: string[];
  buyerSegments?: string[];
}
export interface StrategyMessaging {
  keyMessages?: string[];
  objections?: { objection: string; response: string }[];
}
export interface StrategyGoal {
  name: string;
  metric: string;
  target: number | null;
  period: string;
  status: "not_started" | "on_track" | "at_risk" | "achieved" | "missed";
}

export interface MarketingAsset {
  id: string;
  businessId: string;
  attachmentId: string;
  name: string;
  assetType: AssetType;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  /** Where the bytes live in the shared attachments bucket; used only to mint signed URLs. */
  storageBucket: string | null;
  storagePath: string | null;
  altText: string | null;
  description: string | null;
  campaignId: string | null;
  contentId: string | null;
  offeringId: string | null;
  createdAt: string;
}

export interface SeoItem {
  id: string;
  pageUrl: string | null;
  category: SeoCategory;
  severity: SeoSeverity;
  title: string;
  description: string | null;
  recommendedAction: string | null;
  evidence: Record<string, unknown>;
  source: "crawl" | "manual" | "import" | "ai";
  sourceUrl: string | null;
  observedAt: string | null;
  status: SeoStatus;
  updatedAt: string;
}
