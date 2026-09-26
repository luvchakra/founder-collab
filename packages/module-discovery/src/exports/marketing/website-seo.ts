// EXP-MKT-06 -- Website & SEO export (/discovery/marketing/website-seo).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { getLatestWebsiteOnboardingRun, listWebsiteOnboardingPages } from "../../lib/website-onboarding/queries";
import { WEBSITE_PAGE_CATEGORY_LABEL } from "../../lib/website-onboarding/crawl-plan";
import type { WebsiteOnboardingPage } from "../../lib/website-onboarding/types";
import { SEO_CATEGORY_LABEL, SEO_STATUSES, type SeoItem, type SeoStatus } from "../../lib/marketing/types";
import { listSeoItemsForExport } from "./queries";

type Filters = { status: SeoStatus | "active" };

const STATUS_LABEL: Record<SeoStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved", dismissed: "Dismissed" };
const SEVERITY_LABEL: Record<SeoItem["severity"], string> = { low: "Low", medium: "Medium", high: "High" };
const SOURCE_LABEL: Record<SeoItem["source"], string> = {
  crawl: "Website crawl",
  manual: "Logged by a person",
  import: "Import",
  ai: "AI-inferred",
};
const PAGE_STATUS_LABEL: Record<WebsiteOnboardingPage["status"], string> = { succeeded: "Fetched", failed: "Failed" };

type Evidence = { note?: string; query?: string; engine?: string; observedAnswer?: string; companyAppears?: boolean; citedUrls?: string[] };
const evidenceOf = (item: SeoItem) => item.evidence as Evidence;

/**
 * The SEO opportunities and AI-search observations in the page's current status view,
 * with what was observed and where it came from, plus the latest crawl's page inventory
 * on its own sheet (the crawl stays the system of record; only what it collected is
 * exported -- it records no titles or meta descriptions, so there are none here either).
 */
export const marketingWebsiteSeoExport: ExportAdapter<Filters> = {
  id: "marketing.website-seo",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: (params) => {
    const status = params.get("status");
    return { status: (SEO_STATUSES as readonly string[]).includes(status ?? "") ? (status as SeoStatus) : "active" };
  },
  describeFilters: (f) => ({ Show: f.status === "active" ? "Open and in progress" : STATUS_LABEL[f.status] }),
  async load(context, filters) {
    const [run, items] = await Promise.all([
      getLatestWebsiteOnboardingRun(context.businessId),
      listSeoItemsForExport(context.businessId, filters.status),
    ]);
    // The run was found through the business filter (and RLS); its pages are read by
    // that run's id only, exactly as the page does.
    const pages = run ? await listWebsiteOnboardingPages(run.id) : [];

    const itemColumns: ExportColumn<SeoItem>[] = [
      { key: "page", header: "Page", getValue: (i) => i.pageUrl },
      { key: "category", header: "Category", getValue: (i) => SEO_CATEGORY_LABEL[i.category] ?? i.category },
      { key: "issue", header: "Issue", getValue: (i) => i.title },
      { key: "severity", header: "Severity", getValue: (i) => SEVERITY_LABEL[i.severity] ?? i.severity },
      { key: "status", header: "Status", getValue: (i) => STATUS_LABEL[i.status] ?? i.status },
      { key: "recommendation", header: "Recommendation", getValue: (i) => i.recommendedAction },
      { key: "source", header: "Source", getValue: (i) => SOURCE_LABEL[i.source] ?? i.source },
      { key: "sourceUrl", header: "Source URL", getValue: (i) => i.sourceUrl },
      { key: "observed", header: "Observed", type: "date", getValue: (i) => i.observedAt },
      { key: "evidence", header: "What was observed", getValue: (i) => evidenceOf(i).note ?? evidenceOf(i).observedAnswer ?? i.description },
      { key: "question", header: "Question asked", getValue: (i) => evidenceOf(i).query },
      { key: "engine", header: "Assistant / engine", getValue: (i) => evidenceOf(i).engine },
      { key: "appeared", header: "Company appeared", type: "boolean", getValue: (i) => evidenceOf(i).companyAppears },
      { key: "cited", header: "Sources cited", getValue: (i) => evidenceOf(i).citedUrls ?? null },
      { key: "updated", header: "Updated", type: "datetime", getValue: (i) => i.updatedAt },
    ];
    const pageColumns: ExportColumn<WebsiteOnboardingPage>[] = [
      { key: "url", header: "URL", getValue: (p) => p.url },
      { key: "category", header: "Page type", getValue: (p) => WEBSITE_PAGE_CATEGORY_LABEL[p.category] ?? p.category },
      { key: "status", header: "Crawl status", getValue: (p) => PAGE_STATUS_LABEL[p.status] ?? p.status },
      { key: "fetched", header: "Fetched", type: "datetime", getValue: (p) => p.fetched_at },
    ];

    return {
      module: "discovery",
      resource: "marketing-website-seo",
      title: "Website & SEO",
      metadata: (run
        ? { "Last crawl": (run.completed_at ?? run.created_at).slice(0, 10), Website: run.website }
        : { "Last crawl": "The website has not been crawled yet" }) as Record<string, string>,
      sheets: [
        { sheetName: "SEO items", columns: itemColumns, rows: items },
        { sheetName: "Crawl pages", columns: pageColumns, rows: pages },
      ],
    };
  },
};
