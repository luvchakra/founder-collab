import { getGstr2bStatementWithDocuments } from "../gstr2b/queries";
import { listImsActionsForDocuments } from "../ims/queries";
import { computeItcAvailability } from "./compute";
import type { ItcAvailabilitySummary } from "./types";

/**
 * COMPLY-P0-08.5: assembles a period's own GSTR-2B documents plus this business's IMS
 * actions on them and computes the real ITC-availability split. `null` only when no
 * GSTR-2B statement has been imported for this period yet -- same "a real absence is not
 * an error" convention `getPurchaseReconciliation`/`getSupplierMatchDrilldown` already
 * established.
 */
export async function getItcAvailability(businessId: string, returnPeriod: string): Promise<ItcAvailabilitySummary | null> {
  const statement = await getGstr2bStatementWithDocuments(businessId, returnPeriod);
  if (!statement) return null;

  const documentIds = statement.documents.map((d) => d.id);
  const imsActions = await listImsActionsForDocuments(businessId, documentIds);

  return computeItcAvailability(businessId, returnPeriod, statement.documents, imsActions);
}
