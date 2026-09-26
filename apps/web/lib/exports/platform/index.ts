import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";
import { platformAiUsageExport } from "./ai-usage";
import { platformAuditExport } from "./audit";
import { platformComplianceExport } from "./compliance";
import { platformConfigHistoryExport } from "./config-history";
import { platformIntegrationsExport } from "./integrations";
import { platformPlansExport } from "./plans";
import { platformAnnouncementsExport, platformFeatureFlagsExport, platformNotificationPoliciesExport } from "./settings";

/**
 * Platform-administration export adapters (EXP-ADMIN-01..07). They live in the host, next
 * to the /platform pages they serve, because the platform admin UI itself lives here and
 * reads through @cofounderai/core/admin -- no module owns this data. Run by core's
 * runPlatformExport() (superadmin only, audited in platform.audit_log).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const PLATFORM_EXPORTS: PlatformExportAdapter<any>[] = [
  platformAuditExport,
  platformAiUsageExport,
  platformIntegrationsExport,
  platformPlansExport,
  platformComplianceExport,
  platformConfigHistoryExport,
  platformAnnouncementsExport,
  platformFeatureFlagsExport,
  platformNotificationPoliciesExport,
];
