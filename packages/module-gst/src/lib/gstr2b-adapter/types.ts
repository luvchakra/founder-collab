import type { RawGstr2bJson } from "../gstr2b/types";

/**
 * COMPLY-P0-08.1: the backlog's own universal rule 7 ("government integrations must be
 * adapter-based") applied to GSTR-2B fetching -- same shape as `IrpAdapter`/
 * `EwayBillAdapter` (COMPLY-P0-05.3/06.3). The only method a GSTR-2B fetch integration
 * needs: given a return period, return the raw statement JSON exactly as the provider
 * returned it -- `lib/gstr2b/parse.ts`'s own `parseGstr2bJson` (already used by the
 * manual-upload path) is the single normalization step both paths share, so this
 * interface does no parsing of its own.
 */
export interface Gstr2bFetchAdapter {
  fetch(returnPeriod: string): Promise<RawGstr2bJson>;
}
