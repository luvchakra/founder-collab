import { callGspGet, type GspCredentials } from "../gsp-client";
import { parseGstPeriod } from "../gstr2b/parse";
import type { Gstr2bFetchAdapter } from "./types";
import type { RawGstr2bJson } from "../gstr2b/types";

/** Pure: converts this platform's own `YYYY-MM` return period into GSTN's own `MMYYYY`
 * query convention (the inverse of `parse.ts`'s own `parseGstPeriod`) and appends it as a
 * query parameter -- the shape every GSP "Returns" API integrator (ClearTax, MasterGST)
 * documents for a period-scoped fetch, mirroring `buildEwbNoUrl`'s own
 * append-as-path-or-query convention for a single-resource GET. */
export function buildGstr2bFetchUrl(baseUrl: string, returnPeriod: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(returnPeriod);
  if (!match) throw new Error(`"${returnPeriod}" is not a valid return period (expected YYYY-MM).`);
  const mmyyyy = `${match[2]}${match[1]}`;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}ret_period=${mmyyyy}`;
}

/**
 * COMPLY-P0-08.1 (GSTR-2B Fetch/Import): the GSP-based `Gstr2bFetchAdapter`
 * implementation -- see this module's own `types.ts` docstring and
 * `20260912130000_gst_gstr2b_credentials.sql`'s "real-world note" for why this is a
 * deliberately simplified, OPTIONAL path (most GSPs' actual Returns API needs an
 * additional OTP-session-token step this platform does not model), and never exercised
 * against a live GSP sandbox this story (no reachable sandbox, no demo business with real
 * credentials) -- same honest limit already stated for the IRP/e-way-bill adapters.
 */
export function createGspGstr2bFetchAdapter(fetchUrl: string, credentials: GspCredentials): Gstr2bFetchAdapter {
  return {
    async fetch(returnPeriod: string): Promise<RawGstr2bJson> {
      if (!parseGstPeriod(returnPeriod)) {
        throw new Error(`"${returnPeriod}" is not a valid return period (expected YYYY-MM).`);
      }
      const response = await callGspGet(buildGstr2bFetchUrl(fetchUrl, returnPeriod), credentials);
      return response as RawGstr2bJson;
    },
  };
}
