// EXP-DISC-02 -- Discovery Dashboard export (/[businessSlug]/discovery/dashboard).
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import { getIcpProfile } from "../../lib/icp/queries";
import { DASHBOARD_BIN_LABEL } from "../../lib/opportunities/dashboard";
import type { AccountOfferingEntry, CrossOfferingAccount, OfferingPortfolioRow } from "../../lib/portfolio/types";
import { getBusinessPortfolioData } from "../../lib/portfolio/queries";
import { computeConversionFunnel, type ConversionFunnelStep } from "../../lib/prospects/pipeline";
import { getBusiness, listProducts, listWorkspacesForProducts } from "../../lib/tenancy/queries";
import type { Product } from "../../lib/tenancy/types";
import { creditsUsedPercent, OPERATION_LABEL } from "../../lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "../../lib/usage/limits";
import { getWorkspaceUsageForWorkspaces } from "../../lib/usage/queries";
import { listProspectsForExport } from "./queries";
import { LEVEL_LABEL, labelOf, ratio } from "./shared";

type OverviewRow = {
  offerings: number;
  readyOfferings: number;
  prospects: number;
  qualified: number;
  won: number;
  sent: number;
  replied: number;
  closed: number;
  aiRuns: number;
  creditsUsed: number;
  periodStart: string | null;
  periodEnd: string | null;
};

type OfferingRow = {
  product: Product;
  hasProfile: boolean;
  hasIcp: boolean | null;
  prospects: number | null;
  won: number | null;
  portfolio: OfferingPortfolioRow | null;
};

type FunnelRow = ConversionFunnelStep & { previous: number; total: number };
type AccountRow = { account: CrossOfferingAccount; entry: AccountOfferingEntry };
type UsageRow = { offering: string; operation: string; runs: number; cost: number; periodStart: string; periodEnd: string };

/**
 * The numbers behind the Discovery Dashboard -- its KPI cards, per-offering readiness,
 * the account-wide conversion funnel, the cross-offering accounts and this month's AI
 * usage -- one sheet each, never a picture of the page. Prospects are read through the
 * uncapped export copy of the page's own pipeline query; the portfolio (hot/new
 * opportunities, open conversations, cross-offering accounts) and usage come from the
 * page's own functions. AI usage is expressed as the page expresses it, as a share of the
 * monthly AI credit allowance -- never a raw currency figure.
 */
export const discoveryDashboardExport: ExportAdapter<Record<string, never>> = {
  id: "discovery.dashboard",
  module: "discovery",
  permissions: [],
  parseFilters: () => ({}),
  async load(context) {
    const business = await getBusiness(context.businessId);
    if (!business) throw new ExportDeniedError("Business not found.", 404);

    const products = await listProducts(context.businessId);
    const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
    const workspaceByProductId = new Map(workspaces.map((w) => [w.product_id, w.id] as const));
    const workspaceIds = workspaces.map((w) => w.id);

    const [icpFlags, usageByWorkspace, prospects, portfolio] = await Promise.all([
      Promise.all(workspaceIds.map((id) => getIcpProfile(id).then((icp) => [id, Boolean(icp)] as const))),
      getWorkspaceUsageForWorkspaces(workspaceIds),
      listProspectsForExport(workspaceIds),
      getBusinessPortfolioData(context.businessId),
    ]);
    const hasIcpByWorkspace = new Map(icpFlags);
    const portfolioByProductId = new Map(portfolio.offeringRows.map((row) => [row.productId, row] as const));

    const funnel = computeConversionFunnel(prospects);
    const reached = (stage: string) => funnel.steps.find((s) => s.stage === stage)?.reached ?? 0;

    const offeringRows: OfferingRow[] = products.map((product) => {
      const workspaceId = workspaceByProductId.get(product.id);
      const own = workspaceId ? prospects.filter((p) => p.workspace_id === workspaceId) : null;
      return {
        product,
        hasProfile: Boolean(product.product_profile),
        hasIcp: workspaceId ? (hasIcpByWorkspace.get(workspaceId) ?? false) : null,
        prospects: own ? own.length : null,
        won: own ? own.filter((p) => p.outcome === "won").length : null,
        portfolio: portfolioByProductId.get(product.id) ?? null,
      };
    });

    const usages = Object.values(usageByWorkspace);
    const totalCost = usages.reduce((sum, u) => sum + u.totalCost, 0);
    const overview: OverviewRow = {
      offerings: products.length,
      readyOfferings: offeringRows.filter((r) => r.hasProfile && r.hasIcp).length,
      prospects: prospects.length,
      qualified: prospects.filter((p) => p.status === "qualified").length,
      won: prospects.filter((p) => p.outcome === "won").length,
      sent: reached("sent"),
      replied: reached("replied"),
      closed: reached("closed"),
      aiRuns: usages.reduce((sum, u) => sum + u.totalRuns, 0),
      // Exactly the dashboard's own card: % of the combined monthly allowance, clamped.
      creditsUsed: creditsUsedPercent(totalCost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(workspaceIds.length, 1)) / 100,
      periodStart: usages[0]?.periodStart ?? null,
      periodEnd: usages[0]?.periodEnd ?? null,
    };

    const funnelRows: FunnelRow[] = funnel.steps.map((step, i) => ({
      ...step,
      previous: i > 0 ? funnel.steps[i - 1]!.reached : funnel.total,
      total: funnel.total,
    }));

    const accountRows: AccountRow[] = portfolio.crossOfferingAccounts.flatMap((account) =>
      account.offerings.map((entry) => ({ account, entry })),
    );

    const productNameByWorkspaceId = new Map(
      products.flatMap((p) => {
        const id = workspaceByProductId.get(p.id);
        return id ? [[id, p.name] as const] : [];
      }),
    );
    const usageRows: UsageRow[] = usages.flatMap((usage) =>
      usage.byOperation.map((op) => ({
        offering: productNameByWorkspaceId.get(usage.workspaceId) ?? "",
        operation: op.operation,
        runs: op.runs,
        cost: op.cost,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
      })),
    );

    return {
      module: "discovery",
      resource: "dashboard",
      title: "Discovery dashboard",
      metadata: {
        "AI allowance": `Each offering gets ${FREE_TIER_MONTHLY_RUN_LIMIT} AI runs and 100% of its AI credits per month; credit figures are shares of that allowance.`,
      },
      sheets: [
        {
          sheetName: "Overview",
          columns: [
            { key: "business", header: "Business", getValue: () => business.name },
            { key: "offerings", header: "Offerings", type: "integer", getValue: (r: OverviewRow) => r.offerings },
            { key: "ready", header: "Offerings ready to prospect", type: "integer", getValue: (r: OverviewRow) => r.readyOfferings },
            { key: "prospects", header: "Prospects", type: "integer", getValue: (r: OverviewRow) => r.prospects },
            { key: "qualified", header: "Qualified", type: "integer", getValue: (r: OverviewRow) => r.qualified },
            { key: "won", header: "Won", type: "integer", getValue: (r: OverviewRow) => r.won },
            { key: "sent", header: "Reached Sent", type: "integer", getValue: (r: OverviewRow) => r.sent },
            { key: "replied", header: "Reached Replied", type: "integer", getValue: (r: OverviewRow) => r.replied },
            { key: "reply_rate", header: "Reply rate", type: "percent", getValue: (r: OverviewRow) => ratio(r.replied, r.sent) },
            { key: "close_rate", header: "Overall conversion", type: "percent", getValue: (r: OverviewRow) => ratio(r.closed, r.prospects) },
            { key: "ai_runs", header: "AI runs this month", type: "integer", getValue: (r: OverviewRow) => r.aiRuns },
            { key: "credits", header: "AI credits used", type: "percent", getValue: (r: OverviewRow) => r.creditsUsed },
            { key: "period_start", header: "Usage period start", type: "datetime", getValue: (r: OverviewRow) => r.periodStart },
            { key: "period_end", header: "Usage period end", type: "datetime", getValue: (r: OverviewRow) => r.periodEnd },
          ],
          rows: [overview],
        },
        {
          sheetName: "Offerings",
          columns: [
            { key: "offering", header: "Offering", getValue: (r: OfferingRow) => r.product.name },
            { key: "has_profile", header: "Has offering profile", type: "boolean", getValue: (r: OfferingRow) => r.hasProfile },
            { key: "has_icp", header: "Has ICP", type: "boolean", getValue: (r: OfferingRow) => r.hasIcp },
            { key: "ready", header: "Ready to prospect", type: "boolean", getValue: (r: OfferingRow) => (r.hasIcp === null ? null : r.hasProfile && r.hasIcp) },
            { key: "prospects", header: "Prospects", type: "integer", getValue: (r: OfferingRow) => r.prospects },
            { key: "won", header: "Won", type: "integer", getValue: (r: OfferingRow) => r.won },
            { key: "hot", header: "Hot opportunities", type: "integer", getValue: (r: OfferingRow) => r.portfolio?.hotCount ?? null },
            { key: "new", header: "New opportunities", type: "integer", getValue: (r: OfferingRow) => r.portfolio?.newCount ?? null },
            { key: "conversations", header: "Open conversations", type: "integer", getValue: (r: OfferingRow) => r.portfolio?.conversationCount ?? null },
          ],
          rows: offeringRows,
        },
        {
          sheetName: "Prospect Funnel",
          columns: [
            { key: "stage", header: "Stage", getValue: (r: FunnelRow) => r.label },
            { key: "reached", header: "Prospects reached", type: "integer", getValue: (r: FunnelRow) => r.reached },
            { key: "share", header: "Share of all prospects", type: "percent", getValue: (r: FunnelRow) => ratio(r.reached, r.total) },
            { key: "step", header: "Conversion from previous stage", type: "percent", getValue: (r: FunnelRow) => ratio(r.reached, r.previous) },
          ],
          rows: funnelRows,
        },
        {
          sheetName: "Cross Offering Accounts",
          columns: [
            { key: "company", header: "Company", getValue: (r: AccountRow) => r.account.companyName },
            { key: "domain", header: "Domain", getValue: (r: AccountRow) => r.account.domain },
            { key: "offerings", header: "Offerings with this account", type: "integer", getValue: (r: AccountRow) => r.account.offerings.length },
            { key: "offering", header: "Offering", getValue: (r: AccountRow) => r.entry.productName },
            { key: "score", header: "Opportunity score", type: "integer", getValue: (r: AccountRow) => r.entry.score },
            { key: "priority", header: "Priority", getValue: (r: AccountRow) => labelOf(LEVEL_LABEL, r.entry.priority) },
            { key: "bin", header: "Dashboard bin", getValue: (r: AccountRow) => labelOf(DASHBOARD_BIN_LABEL, r.entry.bin) },
          ],
          rows: accountRows,
        },
        {
          sheetName: "Usage",
          columns: [
            { key: "offering", header: "Offering", getValue: (r: UsageRow) => r.offering },
            { key: "operation", header: "Operation", getValue: (r: UsageRow) => labelOf(OPERATION_LABEL, r.operation) },
            { key: "runs", header: "Runs", type: "integer", getValue: (r: UsageRow) => r.runs },
            { key: "credits", header: "Share of monthly AI credits", type: "percent", getValue: (r: UsageRow) => r.cost / FREE_TIER_MONTHLY_COST_LIMIT_USD },
            { key: "period_start", header: "Period start", type: "datetime", getValue: (r: UsageRow) => r.periodStart },
            { key: "period_end", header: "Period end", type: "datetime", getValue: (r: UsageRow) => r.periodEnd },
          ],
          rows: usageRows,
        },
      ],
    };
  },
};
