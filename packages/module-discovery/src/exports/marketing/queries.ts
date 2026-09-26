import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import { createClient } from "../../db/server";
import type { CampaignFilters, ContentFilters } from "../../lib/marketing/queries";
import type {
  CampaignMetricRow,
  MarketingAsset,
  MarketingCampaign,
  MarketingChannel,
  MarketingContent,
  SeoItem,
  SeoStatus,
} from "../../lib/marketing/types";

/**
 * EXP-MKT-01..07 -- export-only reads (data-exports.md rule 1). The Marketing pages' own
 * loaders in lib/marketing/queries.ts are bounded for the screen (`.limit(500)` on
 * campaigns, content, assets and SEO items, `.limit(5000)` on metric snapshots); an
 * export of "all matching records" must not stop there silently. Each function below
 * applies *exactly* the predicates of the loader it shadows -- same business filter,
 * same status defaults, same filters -- orders by that loader's key plus `id` so chunks
 * never overlap, and pages with `fetchAllRows`. They run through the same RLS-bound
 * client (`tenant AND licensed`), so the tenant boundary holds twice. The loaders
 * themselves are protected Discovery code and are left untouched.
 *
 * Mapping mirrors the loaders' private mappers field for field, so every downstream
 * helper (campaignTotals, the report builders) sees the same shapes. Storage bucket and
 * path are never selected here: an export has no use for them (rule 5).
 */

type Row = Record<string, unknown>;

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const str = (v: unknown) => (v === null || v === undefined ? null : (v as string));

/** An `in(...)` list is sent in the URL; big id lists go in slices so the request stays
 * well under any proxy's URL limit. */
const ID_SLICE = 150;
function slices<T>(items: T[], size = ID_SLICE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function mapCampaignRow(r: Row): MarketingCampaign {
  const offering = r.offering as { name?: string } | null;
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    offeringId: str(r.offering_id),
    offeringName: offering?.name ?? null,
    icpProfileId: str(r.icp_profile_id),
    name: r.name as string,
    description: str(r.description),
    objective: r.objective as MarketingCampaign["objective"],
    channel: r.channel as MarketingChannel,
    budget: toNumber(r.budget),
    currency: str(r.currency),
    startAt: str(r.start_at),
    endAt: str(r.end_at),
    landingPageUrl: str(r.landing_page_url),
    message: str(r.message),
    cta: str(r.cta),
    utm: (r.utm as Record<string, string>) ?? {},
    status: r.status as MarketingCampaign["status"],
    notes: str(r.notes),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function mapMetricRow(r: Row): CampaignMetricRow {
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
    currency: str(r.currency),
  };
}

export function mapContentRow(r: Row): MarketingContent {
  const campaign = r.campaign as { name?: string } | null;
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    offeringId: str(r.offering_id),
    campaignId: str(r.campaign_id),
    campaignName: campaign?.name ?? null,
    title: r.title as string,
    contentType: r.content_type as MarketingContent["contentType"],
    brief: str(r.brief),
    body: str(r.body),
    summary: str(r.summary),
    audience: str(r.audience),
    channel: str(r.channel),
    cta: str(r.cta),
    status: r.status as MarketingContent["status"],
    scheduledAt: str(r.scheduled_at),
    publishedAt: str(r.published_at),
    approvedAt: str(r.approved_at),
    publishedVersionId: str(r.published_version_id),
    externalUrl: str(r.external_url),
    seoMetadata: (r.seo_metadata as Record<string, string>) ?? {},
    updatedAt: r.updated_at as string,
  };
}

/** Same predicates and sort as `listCampaigns`, without its 500-row bound. */
export async function listCampaignsForExport(businessId: string, filters: CampaignFilters = {}): Promise<MarketingCampaign[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) => {
    let query = supabase.from("marketing_campaigns").select("*, offering:products(name)").eq("business_id", businessId);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    else query = query.neq("status", "archived");
    if (filters.channel && filters.channel !== "all") query = query.eq("channel", filters.channel);
    if (filters.offeringId) query = query.eq("offering_id", filters.offeringId);
    if (filters.sort === "name") query = query.order("name", { ascending: true });
    else if (filters.sort === "end_date") query = query.order("end_at", { ascending: true, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });
    return query.order("id", { ascending: true }).range(from, to);
  });
  return rows.map(mapCampaignRow);
}

/** Same predicates as `listCampaignMetrics` (explicit window, business, the campaigns
 * given), without its 5,000-row bound. */
export async function listCampaignMetricsForExport(
  businessId: string,
  window: { from: string; to: string },
  campaignIds: string[],
): Promise<CampaignMetricRow[]> {
  if (campaignIds.length === 0) return [];
  const supabase = await createClient();
  const out: Row[] = [];
  for (const ids of slices(campaignIds)) {
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from("marketing_campaign_metrics")
        .select("*")
        .eq("business_id", businessId)
        .gte("metric_date", window.from)
        .lte("metric_date", window.to)
        .in("campaign_id", ids)
        .order("metric_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    out.push(...rows);
  }
  out.sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
  return out.map(mapMetricRow);
}

/** Same predicates and order as `listContent`, without its 500-row bound. */
export async function listContentForExport(businessId: string, filters: ContentFilters = {}): Promise<MarketingContent[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) => {
    let query = supabase.from("marketing_content").select("*, campaign:marketing_campaigns(name)").eq("business_id", businessId);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    else query = query.neq("status", "archived");
    if (filters.contentType && filters.contentType !== "all") query = query.eq("content_type", filters.contentType);
    if (filters.campaignId) query = query.eq("campaign_id", filters.campaignId);
    return query.order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
  return rows.map(mapContentRow);
}

/** An asset's metadata only -- no storage bucket, no storage path, no signed URL. */
export type AssetExportRow = Omit<MarketingAsset, "storageBucket" | "storagePath"> & { status: string };

/** Same predicates as `listAssets` (active assets of the business, newest first), without
 * its 500-row bound, and without ever reading where the bytes are stored. */
export async function listAssetsForExport(businessId: string): Promise<AssetExportRow[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from("marketing_assets")
      .select("id, business_id, attachment_id, name, asset_type, alt_text, description, campaign_id, content_id, offering_id, status, created_at")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (rows.length === 0) return [];
  const core = await createCoreClient({ schema: "core" });
  const files = new Map<string, Row>();
  const attachmentIds = rows.map((r) => r.attachment_id as string).filter(Boolean);
  for (const ids of slices(attachmentIds)) {
    const { data, error } = await core
      .from("attachments")
      .select("id, file_name, content_type, size_bytes")
      .eq("business_id", businessId)
      .in("id", ids);
    if (error) throw error;
    for (const a of (data ?? []) as Row[]) files.set(a.id as string, a);
  }
  return rows.map((r) => {
    const a = files.get(r.attachment_id as string);
    return {
      id: r.id as string,
      businessId: r.business_id as string,
      attachmentId: r.attachment_id as string,
      name: r.name as string,
      assetType: r.asset_type as MarketingAsset["assetType"],
      fileName: str(a?.file_name) ?? (r.name as string),
      contentType: str(a?.content_type),
      sizeBytes: toNumber(a?.size_bytes),
      altText: str(r.alt_text),
      description: str(r.description),
      campaignId: str(r.campaign_id),
      contentId: str(r.content_id),
      offeringId: str(r.offering_id),
      createdAt: r.created_at as string,
      status: (r.status as string) ?? "active",
    };
  });
}

/** Same predicates and order as `listSeoItems`, without its 500-row bound. */
export async function listSeoItemsForExport(businessId: string, status: SeoStatus | "active" = "active"): Promise<SeoItem[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) => {
    let query = supabase.from("marketing_seo_items").select("*").eq("business_id", businessId);
    if (status === "active") query = query.in("status", ["open", "in_progress"]);
    else query = query.eq("status", status);
    return query.order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
  return rows.map((r) => ({
    id: r.id as string,
    pageUrl: str(r.page_url),
    category: r.category as SeoItem["category"],
    severity: r.severity as SeoItem["severity"],
    title: r.title as string,
    description: str(r.description),
    recommendedAction: str(r.recommended_action),
    evidence: (r.evidence as Record<string, unknown>) ?? {},
    source: r.source as SeoItem["source"],
    sourceUrl: str(r.source_url),
    observedAt: str(r.observed_at),
    status: r.status as SeoStatus,
    updatedAt: r.updated_at as string,
  }));
}

/**
 * Names for the ids an export row points at -- campaigns and offerings of this business,
 * *including* archived ones, so an asset linked to an archived campaign still says which
 * one (the page's pickers only list live ones and would leave the cell unexplained).
 */
export async function listNamesForExport(businessId: string, table: "marketing_campaigns" | "products"): Promise<Map<string, string>> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase.from(table).select("id, name").eq("business_id", businessId).order("id", { ascending: true }).range(from, to),
  );
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}
