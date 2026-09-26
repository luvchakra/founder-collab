import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { marketingAnalyticsExport } from "./analytics";
import { marketingAssetsExport } from "./assets";
import { marketingCampaignExport } from "./campaign-detail";
import { marketingCampaignsExport } from "./campaigns";
import { marketingContentExport } from "./content";
import { marketingDashboardExport } from "./dashboard";
import { marketingStrategyExport } from "./strategy";
import { marketingWebsiteSeoExport } from "./website-seo";

/**
 * Every Marketing export adapter (EXP-MKT-01..07), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const MARKETING_EXPORTS: ExportAdapter<any>[] = [
  marketingDashboardExport, // EXP-MKT-01
  marketingStrategyExport, // EXP-MKT-02
  marketingCampaignsExport, // EXP-MKT-03
  marketingCampaignExport, // EXP-MKT-04
  marketingContentExport, // EXP-MKT-05
  marketingAssetsExport, // EXP-MKT-06
  marketingWebsiteSeoExport, // EXP-MKT-06
  marketingAnalyticsExport, // EXP-MKT-07
];
