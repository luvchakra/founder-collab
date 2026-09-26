import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

/**
 * Platform-administration export adapters (EXP-ADMIN-01..07). They live in the host, next
 * to the /platform pages they serve, because the platform admin UI itself lives here and
 * reads through @cofounderai/core/admin -- no module owns this data. Run by core's
 * runPlatformExport() (superadmin only, audited in platform.audit_log).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const PLATFORM_EXPORTS: PlatformExportAdapter<any>[] = [];
