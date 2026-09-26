import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { crmAnalyticsExport } from "./analytics";
import { crmConversationsExport } from "./conversations";
import { crmCustomer360Export } from "./customer-360";
import { crmDashboardExport } from "./dashboard";
import { crmExceptionsExport } from "./exceptions";
import { crmFollowUpsExport } from "./follow-ups";
import { crmLeadsExport } from "./leads";
import { crmLostBusinessExport } from "./lost-business";
import { crmOpportunitiesExport } from "./opportunities";
import { crmReactivationExport } from "./reactivation";
import { crmReviewsExport } from "./reviews";

/**
 * Every CRM export adapter (EXP-CRM-01..10), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const CRM_EXPORTS: ExportAdapter<any>[] = [
  crmDashboardExport, // EXP-CRM-01
  crmLeadsExport, // EXP-CRM-02
  crmOpportunitiesExport, // EXP-CRM-03
  crmAnalyticsExport, // EXP-CRM-04
  crmLostBusinessExport, // EXP-CRM-05
  crmReactivationExport, // EXP-CRM-06
  crmFollowUpsExport, // EXP-CRM-07
  crmReviewsExport, // EXP-CRM-08
  crmConversationsExport, // EXP-CRM-09
  crmCustomer360Export, // EXP-CRM-10
  crmExceptionsExport, // EXP-CRM-10
];
