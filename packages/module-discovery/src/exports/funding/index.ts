import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { fundingAnalyticsExport } from "./analytics";
import { fundingDashboardExport } from "./dashboard";
import { fundingDataRoomExport } from "./data-room";
import { fundingDueDiligenceExport } from "./due-diligence";
import { fundingInvestorExport } from "./investor-detail";
import { fundingInvestorsExport } from "./investors";
import { fundingOutreachExport } from "./outreach";
import { fundingPipelineExport } from "./pipeline";
import { fundingProfileExport } from "./profile";
import { fundingReadinessExport } from "./readiness";
import { fundingRoundsExport } from "./rounds";

/**
 * Every Funding export adapter (EXP-FND-01..10), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const FUNDING_EXPORTS: ExportAdapter<any>[] = [
  fundingDashboardExport, // EXP-FND-01
  fundingProfileExport, // EXP-FND-02
  fundingReadinessExport, // EXP-FND-03
  fundingRoundsExport, // EXP-FND-04
  fundingInvestorsExport, // EXP-FND-05
  fundingInvestorExport, // EXP-FND-06
  fundingPipelineExport, // EXP-FND-07
  fundingOutreachExport, // EXP-FND-08
  fundingDataRoomExport, // EXP-FND-09
  fundingDueDiligenceExport, // EXP-FND-10
  fundingAnalyticsExport, // EXP-FND-10
];
