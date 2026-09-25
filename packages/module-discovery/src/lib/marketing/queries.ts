import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type {
  CampaignMetricRow,
  CampaignStatus,
  ContentStatus,
  ContentType,
  ContentVersion,
  MarketingAsset,
  MarketingCampaign,
  MarketingChannel,
  MarketingContent,
  MarketingStrategy,
  SeoItem,
  SeoStatus,
} from "./types";

/**
 * MKT-01 — the Marketing read layer. Every query is scoped by `business_id` explicitly
 * *and* runs through the caller's RLS-bound client, so a tenant boundary holds even if a
 * caller passes the wrong id: RLS returns nothing for a business the user is not a member
 * of, or one without a Discovery licence (`tenant AND licensed`). Pages call these;
 * presentational components never do (§39).
 */

type Row = Record<string, unknown>;

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapCampaign(r: Row): MarketingCampaign {
  const offering = r.offering as { name?: string } | null;
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    offeringId: (r.offering_id as string) ?? null,
    offeringName: offering?.name ?? null,
    icpProfileId: (r.icp_profile_id as string) ?? null,
    name: r.name as string,
    description: (r.description as string) ?? null,
    objective: r.objective as MarketingCampaign["objective"],
    channel: r.channel as MarketingChannel,
    budget: toNumber(r.budget),
    currency: (r.currency as string) ?? null,
    startAt: (r.start_at as string) ?? null,
    endAt: (r.end_at as string) ?? null,
    landingPageUrl: (r.landing_page_url as string) ?? null,
    message: (r.message as string) ?? null,
    cta: (r.cta as string) ?? null,
    utm: (r.utm as Record<string, string>) ?? {},
    status: r.status as CampaignStatus,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapMetric(r: Row): CampaignMetricRow {
  return {
    campaignId: r.campaign_id as string,
    metricDate: r.metric_date as string,
    source: r.source as CampaignMetricRow["source"],
    impressions: toNumber(r.impressions),
    clicks: toNumber(r.clicks),
    sessions: toNumber(r.sessions),
    engagements: toNumber(r.engagements),
    leads: toNumber(r.leads),
    qualifiedLeads: toNumber(r.qualified_leads),
    opportunities: toNumber(r.opportunities),
    customers: toNumber(r.customers),
    revenue: toNumber(r.revenue),
    spend: toNumber(r.spend),
    currency: (r.currency as string) ?? null,
  };
}

function mapContent(r: Row): MarketingContent {
  const campaign = r.campaign as { name?: string } | null;
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    offeringId: (r.offering_id as string) ?? null,
    campaignId: (r.campaign_id as string) ?? null,
    campaignName: campaign?.name ?? null,
    title: r.title as string,
    contentType: r.content_type as ContentType,
    brief: (r.brief as string) ?? null,
    body: (r.body as string) ?? null,
    summary: (r.summary as string) ?? null,
    audience: (r.audience as string) ?? null,
    channel: (r.channel as string) ?? null,
    cta: (r.cta as string) ?? null,
    status: r.status as ContentStatus,
    scheduledAt: (r.scheduled_at as string) ?? null,
    publishedAt: (r.published_at as string) ?? null,
    approvedAt: (r.approved_at as string) ?? null,
    publishedVersionId: (r.published_version_id as string) ?? null,
    externalUrl: (r.external_url as string) ?? null,
    seoMetadata: (r.seo_metadata as Record<string, string>) ?? {},
    updatedAt: r.updated_at as string,
  };
}

function mapStrategy(r: Row): MarketingStrategy {
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    offeringId: (r.offering_id as string) ?? null,
    name: r.name as string,
    status: r.status as MarketingStrategy["status"],
    versionNumber: Number(r.version_number ?? 1),
    origin: (r.origin as MarketingStrategy["origin"]) ?? "user",
    positioning: (r.positioning as MarketingStrategy["positioning"]) ?? {},
    valueProposition: (r.value_proposition as MarketingStrategy["valueProposition"]) ?? {},
    differentiation: (r.differentiation as MarketingStrategy["differentiation"]) ?? {},
    targetMarkets: (r.target_markets as MarketingStrategy["targetMarkets"]) ?? {},
    messaging: (r.messaging as MarketingStrategy["messaging"]) ?? {},
    channels: (r.channels as MarketingChannel[]) ?? [],
    goals: (r.goals as MarketingStrategy["goals"]) ?? [],
    updatedAt: r.updated_at as string,
  };
}

const CAMPAIGN_SELECT = "*, offering:products(name)";

export interface CampaignFilters {
  status?: CampaignStatus | "all";
  channel?: MarketingChannel | "all";
  offeringId?: string;
  sort?: "newest" | "name" | "end_date";
}

export const listCampaigns = cache(
  async (businessId: string, filters: CampaignFilters = {}): Promise<MarketingCampaign[]> => {
    const supabase = await createClient();
    let query = supabase.from("marketing_campaigns").select(CAMPAIGN_SELECT).eq("business_id", businessId);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    else query = query.neq("status", "archived");
    if (filters.channel && filters.channel !== "all") query = query.eq("channel", filters.channel);
    if (filters.offeringId) query = query.eq("offering_id", filters.offeringId);

    if (filters.sort === "name") query = query.order("name", { ascending: true });
    else if (filters.sort === "end_date") query = query.order("end_at", { ascending: true, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    // Bounded (§68): a dashboard never needs every campaign ever run.
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(mapCampaign);
  },
);

export const getCampaign = cache(async (businessId: string, campaignId: string): Promise<MarketingCampaign | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCampaign(data as Row) : null;
});

/** Metric snapshots, always within an explicit window (§47: "Use explicit date ranges"). */
export const listCampaignMetrics = cache(
  async (
    businessId: string,
    window: { from: string; to: string },
    campaignIds?: string[],
  ): Promise<CampaignMetricRow[]> => {
    if (campaignIds && campaignIds.length === 0) return [];
    const supabase = await createClient();
    let query = supabase
      .from("marketing_campaign_metrics")
      .select("*")
      .eq("business_id", businessId)
      .gte("metric_date", window.from)
      .lte("metric_date", window.to);
    if (campaignIds) query = query.in("campaign_id", campaignIds);
    const { data, error } = await query.order("metric_date", { ascending: true }).limit(5000);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(mapMetric);
  },
);

export interface ContentFilters {
  status?: ContentStatus | "all";
  contentType?: ContentType | "all";
  campaignId?: string;
}

export const listContent = cache(
  async (businessId: string, filters: ContentFilters = {}): Promise<MarketingContent[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("marketing_content")
      .select("*, campaign:marketing_campaigns(name)")
      .eq("business_id", businessId);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    else query = query.neq("status", "archived");
    if (filters.contentType && filters.contentType !== "all") query = query.eq("content_type", filters.contentType);
    if (filters.campaignId) query = query.eq("campaign_id", filters.campaignId);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(mapContent);
  },
);

/** Content with a schedule inside a window — the calendar's read (§15). */
export const listScheduledContent = cache(
  async (businessId: string, window: { from: string; to: string }): Promise<MarketingContent[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("marketing_content")
      .select("*, campaign:marketing_campaigns(name)")
      .eq("business_id", businessId)
      .gte("scheduled_at", window.from)
      .lte("scheduled_at", window.to)
      .order("scheduled_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(mapContent);
  },
);

export const getContent = cache(async (businessId: string, contentId: string): Promise<MarketingContent | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_content")
    .select("*, campaign:marketing_campaigns(name)")
    .eq("business_id", businessId)
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapContent(data as Row) : null;
});

export const listContentVersions = cache(async (businessId: string, contentId: string): Promise<ContentVersion[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_content_versions")
    .select("id, content_id, version_number, title, body, summary, origin, created_at")
    .eq("business_id", businessId)
    .eq("content_id", contentId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    contentId: r.content_id as string,
    versionNumber: Number(r.version_number),
    title: r.title as string,
    body: (r.body as string) ?? null,
    summary: (r.summary as string) ?? null,
    origin: r.origin as ContentVersion["origin"],
    createdAt: r.created_at as string,
  }));
});

export const listStrategies = cache(async (businessId: string): Promise<MarketingStrategy[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_strategies")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapStrategy);
});

/** The strategy to show by default: the company-wide active one, else the latest draft. */
export function pickCurrentStrategy(strategies: MarketingStrategy[]): MarketingStrategy | null {
  const companyWide = strategies.filter((s) => s.offeringId === null);
  return (
    companyWide.find((s) => s.status === "active") ??
    companyWide.find((s) => s.status === "draft") ??
    strategies.find((s) => s.status === "active") ??
    strategies[0] ??
    null
  );
}

export const listAssets = cache(async (businessId: string): Promise<MarketingAsset[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_assets")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // File facts live on core.attachments (one storage subsystem, §14.3). A second query
  // rather than an embed: the two tables are in different schemas.
  const core = await createCoreClient({ schema: "core" });
  const { data: attachments, error: attachmentError } = await core
    .from("attachments")
    .select("id, file_name, content_type, size_bytes, storage_bucket, storage_path")
    .eq("business_id", businessId)
    .in(
      "id",
      rows.map((r) => r.attachment_id as string),
    );
  if (attachmentError) throw attachmentError;
  const byId = new Map(((attachments ?? []) as Row[]).map((a) => [a.id as string, a]));

  return rows.map((r) => {
    const a = byId.get(r.attachment_id as string);
    return {
      id: r.id as string,
      businessId: r.business_id as string,
      attachmentId: r.attachment_id as string,
      name: r.name as string,
      assetType: r.asset_type as MarketingAsset["assetType"],
      fileName: (a?.file_name as string) ?? (r.name as string),
      contentType: (a?.content_type as string) ?? null,
      sizeBytes: toNumber(a?.size_bytes),
      storageBucket: (a?.storage_bucket as string) ?? null,
      storagePath: (a?.storage_path as string) ?? null,
      altText: (r.alt_text as string) ?? null,
      description: (r.description as string) ?? null,
      campaignId: (r.campaign_id as string) ?? null,
      contentId: (r.content_id as string) ?? null,
      offeringId: (r.offering_id as string) ?? null,
      createdAt: r.created_at as string,
    };
  });
});

export const listSeoItems = cache(
  async (businessId: string, status: SeoStatus | "active" = "active"): Promise<SeoItem[]> => {
    const supabase = await createClient();
    let query = supabase.from("marketing_seo_items").select("*").eq("business_id", businessId);
    if (status === "active") query = query.in("status", ["open", "in_progress"]);
    else query = query.eq("status", status);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      pageUrl: (r.page_url as string) ?? null,
      category: r.category as SeoItem["category"],
      severity: r.severity as SeoItem["severity"],
      title: r.title as string,
      description: (r.description as string) ?? null,
      recommendedAction: (r.recommended_action as string) ?? null,
      evidence: (r.evidence as Record<string, unknown>) ?? {},
      source: r.source as SeoItem["source"],
      sourceUrl: (r.source_url as string) ?? null,
      observedAt: (r.observed_at as string) ?? null,
      status: r.status as SeoStatus,
      updatedAt: r.updated_at as string,
    }));
  },
);

/** Offering choices for pickers — read from the canonical offering table, never copied. */
export const listOfferingOptions = cache(async (businessId: string): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, status")
    .eq("business_id", businessId)
    .neq("status", "archived")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id as string, name: r.name as string }));
});

/**
 * Short-lived signed links for asset previews and downloads (§14.3: "use signed URLs for
 * private content"). One batched call per bucket rather than one per asset. The storage
 * API checks the caller's access when it signs, so this cannot mint a link to another
 * business's file.
 */
export async function assetSignedUrls(assets: MarketingAsset[], expiresInSeconds = 3600): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const withPath = assets.filter((a) => a.storageBucket && a.storagePath);
  if (withPath.length === 0) return urls;
  const core = await createCoreClient({ schema: "core" });
  const byBucket = new Map<string, MarketingAsset[]>();
  for (const a of withPath) {
    const list = byBucket.get(a.storageBucket!) ?? [];
    list.push(a);
    byBucket.set(a.storageBucket!, list);
  }
  for (const [bucket, list] of byBucket) {
    const { data, error } = await core.storage.from(bucket).createSignedUrls(
      list.map((a) => a.storagePath!),
      expiresInSeconds,
    );
    if (error) throw error;
    for (const [i, entry] of (data ?? []).entries()) {
      if (entry.signedUrl) urls.set(list[i]!.id, entry.signedUrl);
    }
  }
  return urls;
}

export interface ActivityEntry {
  id: string;
  action: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** One record's audit trail, newest first — the "activity timeline" on detail pages (§9.4). */
export const listEntityActivity = cache(
  async (businessId: string, entityType: string, entityId: string): Promise<ActivityEntry[]> => {
    const core = await createCoreClient({ schema: "core" });
    const { data, error } = await core
      .from("audit_log")
      .select("id, action, created_at, before, after")
      .eq("business_id", businessId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      action: r.action as string,
      createdAt: r.created_at as string,
      before: (r.before as Record<string, unknown>) ?? null,
      after: (r.after as Record<string, unknown>) ?? null,
    }));
  },
);
