import type { ExportAdapter } from "@cofounderai/core/exports/server";

/**
 * Every Discovery (customer acquisition) export adapter (EXP-DISC-01..12), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const CUSTOMER_ACQUISITION_EXPORTS: ExportAdapter<any>[] = [];
