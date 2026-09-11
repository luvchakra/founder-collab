import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getEstimateForOpportunity, listEstimateLines } from "../estimates/queries";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

function fsmClient() {
  return createCoreClient({ schema: "fsm" });
}

export type JobMaterialRequirementLine = {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  quantity: number;
  unit: string;
};

/**
 * INT-03.1's "FSM Job Material Requirement" -- also the one place `reserveJobParts()`/
 * `consumeJobParts()`/`releaseJobParts()` (F-14, `inventory-integration/mutations.ts`)
 * get their parts list from, so the requirement shown on the job is always exactly what
 * reservation acts on, never a second copy of it. A job's required items are simply the
 * charge lines of its originating estimate (`job.opportunity_id -> fsm.opportunities ->
 * core.documents`) that reference a `core.items` row with `kind='good'` -- the one kind
 * `core.item_inventory_attrs`'s own invariant ties to real stock tracking. FSM stores no
 * separate requirement entity/ledger of its own (Rule 3: "Never Copy Ownership");
 * Inventory remains the authority on the product and its quantity/unit.
 *
 * A job created directly (no opportunity, F-5), whose estimate was never approved, or
 * whose estimate has no `good`-kind lines (a service-only job) yields an empty list --
 * "service-only jobs require no inventory" holds trivially, not as a special case.
 */
export async function listJobMaterialRequirement(businessId: string, jobId: string): Promise<JobMaterialRequirementLine[]> {
  const fsm = await fsmClient();
  const { data: job, error: jobError } = await fsm.from("jobs").select("opportunity_id").eq("id", jobId).eq("business_id", businessId).maybeSingle();
  if (jobError) throw jobError;
  if (!job?.opportunity_id) return [];

  const estimate = await getEstimateForOpportunity(businessId, job.opportunity_id);
  if (!estimate) return [];

  const lines = await listEstimateLines(businessId, estimate.id);
  if (lines.length === 0) return [];

  const itemIds = [...new Set(lines.map((l) => l.item_id).filter((id): id is string => Boolean(id)))];
  if (itemIds.length === 0) return [];
  const core = await coreClient();
  const { data: items, error: itemsError } = await core.from("items").select("id, kind, unit").in("id", itemIds);
  if (itemsError) throw itemsError;
  const stockedItems = new Map(items.filter((i) => i.kind === "good").map((i) => [i.id, i]));

  return lines
    .filter((l) => l.item_id && stockedItems.has(l.item_id))
    .map((l) => ({
      itemId: l.item_id!,
      itemName: l.item_name,
      itemSku: l.item_sku,
      quantity: l.quantity,
      unit: stockedItems.get(l.item_id!)!.unit,
    }));
}
