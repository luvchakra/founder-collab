import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { CUSTOMER_ACQUISITION_EXPORTS } from "./customer-acquisition";
import { FUNDING_EXPORTS } from "./funding";
import { MARKETING_EXPORTS } from "./marketing";

/** Every Discovery export adapter -- customer acquisition, Marketing and Funding each keep
 * their own list (./<area>/index.ts); this file only joins them for the host. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const DISCOVERY_EXPORTS: ExportAdapter<any>[] = [
  ...CUSTOMER_ACQUISITION_EXPORTS,
  ...MARKETING_EXPORTS,
  ...FUNDING_EXPORTS,
];
