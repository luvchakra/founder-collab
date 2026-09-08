import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { listWarehouses, reserveStock, releaseStock, consumeStock } from "@cofounderai/module-inventory/contract/index";
import { getEstimateForOpportunity, listEstimateLines } from "../estimates/queries";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** A job's own "parts" (F-14, PRD §2 Field service integration row): the charge lines of
 * its originating estimate (`job.opportunity_id -> fsm.opportunities -> core.documents`)
 * that reference a `core.items` row with `kind='good'` -- the one kind
 * `core.item_inventory_attrs`'s own invariant ties to real stock tracking (confirmed by
 * reading `20260906103000_core_items.sql`'s own comment before writing this, not
 * assumed). A job created directly (no opportunity, F-5) or whose estimate was never
 * approved has no reliable parts source and simply yields no lines here -- reserve/
 * consume are both correctly no-ops for it, not an error.
 *
 * Deliberately reads the *estimate*'s lines, not the invoice's -- the estimate is the
 * one source available at both "on schedule" (usually before any invoice exists) and
 * "on completion", so both hooks agree on the same parts list rather than reserving
 * against one document and consuming against a different one that might have been
 * edited in between. */
async function listJobPartLines(businessId: string, jobId: string): Promise<{ itemId: string; quantity: number }[]> {
  const core = coreClient();
  const supabase = await core;
  const { data: job, error: jobError } = await supabase.from("jobs").select("opportunity_id").eq("id", jobId).eq("business_id", businessId).maybeSingle();
  if (jobError) throw jobError;
  if (!job?.opportunity_id) return [];

  const estimate = await getEstimateForOpportunity(businessId, job.opportunity_id);
  if (!estimate) return [];

  const lines = await listEstimateLines(businessId, estimate.id);
  if (lines.length === 0) return [];

  const itemIds = [...new Set(lines.map((l) => l.item_id).filter((id): id is string => Boolean(id)))];
  if (itemIds.length === 0) return [];
  const { data: items, error: itemsError } = await supabase.from("items").select("id, kind").in("id", itemIds);
  if (itemsError) throw itemsError;
  const stockedItemIds = new Set(items.filter((i) => i.kind === "good").map((i) => i.id));

  return lines.filter((l) => l.item_id && stockedItemIds.has(l.item_id)).map((l) => ({ itemId: l.item_id!, quantity: l.quantity }));
}

async function firstActiveWarehouseId(businessId: string): Promise<string | null> {
  const result = await listWarehouses(businessId);
  if (!result.ok || result.data.length === 0) return null;
  return result.data[0]!.id;
}

/** "Job parts reserve on schedule" (F-14) -- best-effort: neither an unlicensed
 * `inventory` (ADR-10's own graceful degraded mode -- "the same job completes cleanly
 * with the parts as plain charges" per 02-FSM-PRD.md §7 acceptance criterion #4, which
 * this extends to scheduling too) nor a stock shortfall should ever block scheduling a
 * job. A per-line reservation failure (not enough available) is caught and skipped, not
 * retried -- the dispatcher still sees the job scheduled; `stock.low` alerts (surfaced
 * separately) are how they'd notice the shortfall, not a blocked schedule action. */
export async function reserveJobParts(businessId: string, jobId: string): Promise<void> {
  const licensed = await hasModule(businessId, "inventory");
  if (!licensed) return;

  const lines = await listJobPartLines(businessId, jobId);
  if (lines.length === 0) return;

  const warehouseId = await firstActiveWarehouseId(businessId);
  if (!warehouseId) return;

  for (const line of lines) {
    await reserveStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
  }
}

/** "...consume on completion" (F-14) -- releases the earlier reservation first (a
 * no-op, caught and ignored, if nothing was actually reserved: `inventory` might not
 * have been licensed yet at schedule time, or the reservation itself failed) then
 * permanently consumes the same quantity. Same best-effort reasoning as
 * `reserveJobParts` -- a completed job is never rolled back over a stock shortfall. */
export async function consumeJobParts(businessId: string, jobId: string): Promise<void> {
  const licensed = await hasModule(businessId, "inventory");
  if (!licensed) return;

  const lines = await listJobPartLines(businessId, jobId);
  if (lines.length === 0) return;

  const warehouseId = await firstActiveWarehouseId(businessId);
  if (!warehouseId) return;

  for (const line of lines) {
    await releaseStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
    await consumeStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
  }
}
