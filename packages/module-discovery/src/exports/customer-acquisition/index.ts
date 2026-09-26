import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { discoveryBusinessExport } from "./business";
import { discoveryConversionsExport } from "./conversions";
import { discoveryDashboardExport } from "./dashboard";
import { discoveryHistoryExport } from "./history";
import { discoveryIcpExport } from "./icp";
import { discoveryOpportunitiesExport } from "./opportunities";
import { discoveryPerformanceExport } from "./performance";
import { discoveryProspectDetailExport } from "./prospect-detail";
import { discoveryProspectsExport } from "./prospects";
import { discoveryUsageExport } from "./usage";
import { discoveryWatchlistExport } from "./watchlist";

/**
 * Every Discovery (customer acquisition) export adapter (EXP-DISC-01..12), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const CUSTOMER_ACQUISITION_EXPORTS: ExportAdapter<any>[] = [
  discoveryBusinessExport, // EXP-DISC-01
  discoveryDashboardExport, // EXP-DISC-02
  discoveryProspectsExport, // EXP-DISC-03
  discoveryProspectDetailExport, // EXP-DISC-04 (+ EXP-DISC-07 research/signals, EXP-DISC-08 outreach)
  discoveryOpportunitiesExport, // EXP-DISC-05 + EXP-DISC-09
  discoveryIcpExport, // EXP-DISC-06
  discoveryConversionsExport, // EXP-DISC-10
  discoveryPerformanceExport, // EXP-DISC-11
  discoveryHistoryExport, // EXP-DISC-12 history
  discoveryUsageExport, // EXP-DISC-12 usage
  discoveryWatchlistExport, // EXP-DISC-12 watchlist
];
