import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { hasModule, requireModule } from "@cofounderai/core/licensing/queries";
import { listWarehouses, reserveStock, releaseStock, consumeStock, getAvailability } from "@cofounderai/module-inventory/contract/index";
import { listJobMaterialRequirement } from "./queries";
import type { JobPartsReservationStatus, JobPartsShortfallLine } from "../jobs/types";

function fsmClient() {
  return createCoreClient({ schema: "fsm" });
}

/** The parts list every function below reserves/consumes/releases against is
 * `listJobMaterialRequirement()` (`./queries.ts`) -- the same read INT-03.1's job page
 * shows, so a job's displayed requirement and what actually moves stock are always one
 * source, never two. (That function's own docstring covers a schema-scoping bug fixed
 * there while inspecting this file for INT-03.1: F-14's reserve/consume/release had
 * never actually run a stock movement until that fix.) */
async function firstActiveWarehouseId(businessId: string): Promise<string | null> {
  const result = await listWarehouses(businessId);
  if (!result.ok || result.data.length === 0) return null;
  return result.data[0]!.id;
}

async function recordReservationOutcome(
  businessId: string,
  jobId: string,
  status: JobPartsReservationStatus,
  detail: JobPartsShortfallLine[],
): Promise<void> {
  const fsm = await fsmClient();
  await fsm
    .from("jobs")
    .update({ parts_reservation_status: status, parts_reservation_detail: detail, parts_reservation_checked_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("business_id", businessId);
}

/** "Job parts reserve on schedule" (F-14, status tracking added INT-03.2) -- best-effort:
 * neither an unlicensed `inventory` (ADR-10's own graceful degraded mode -- "the same
 * job completes cleanly with the parts as plain charges" per 02-FSM-PRD.md §7
 * acceptance criterion #4, which this extends to scheduling too) nor a stock shortfall
 * should ever block scheduling a job. A per-line reservation failure (not enough
 * available) no longer disappears silently: each one is recorded, and the job's overall
 * `parts_reservation_status` becomes `reserved` (every line succeeded),
 * `partially_reserved` (some did), or `unavailable` (none did) -- "partial availability
 * is explicit" and "user sees missing items," both this story's own acceptance criteria.
 *
 * Idempotent by construction: a job whose `parts_reservation_status` is already set has
 * already had a reservation attempt run, so this returns immediately rather than
 * re-attempting (and potentially double-reserving lines that already succeeded) -- a
 * deliberate retry (e.g. after replenishment) is INT-03.3's own explicit "Retry
 * Handoff" action, not something this function does on repeated invocation. */
export async function reserveJobParts(businessId: string, jobId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const licensed = await hasModule(businessId, "inventory");
  if (!licensed) return;

  const fsm = await fsmClient();
  const { data: existing } = await fsm.from("jobs").select("parts_reservation_status").eq("id", jobId).eq("business_id", businessId).maybeSingle();
  if (existing?.parts_reservation_status) return;

  const lines = await listJobMaterialRequirement(businessId, jobId);
  if (lines.length === 0) return;

  const warehouseId = await firstActiveWarehouseId(businessId);
  if (!warehouseId) return;

  const shortfalls: JobPartsShortfallLine[] = [];
  for (const line of lines) {
    const result = await reserveStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
    if (!result || !result.ok) {
      const availability = await getAvailability(businessId, line.itemId, warehouseId).catch(() => null);
      const available = availability?.ok ? (availability.data[0]?.available ?? 0) : 0;
      shortfalls.push({
        itemId: line.itemId,
        itemName: line.itemName,
        itemSku: line.itemSku,
        unit: line.unit,
        requested: line.quantity,
        shortfall: Math.max(line.quantity - Math.max(available, 0), 0),
      });
    }
  }

  const status: JobPartsReservationStatus = shortfalls.length === 0 ? "reserved" : shortfalls.length === lines.length ? "unavailable" : "partially_reserved";
  await recordReservationOutcome(businessId, jobId, status, shortfalls);
}

/** "...consume on completion" (F-14) -- releases the earlier reservation first (a
 * no-op, caught and ignored, if nothing was actually reserved: `inventory` might not
 * have been licensed yet at schedule time, or the reservation itself failed) then
 * permanently consumes the same quantity. Same best-effort reasoning as
 * `reserveJobParts` -- a completed job is never rolled back over a stock shortfall. */
export async function consumeJobParts(businessId: string, jobId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const licensed = await hasModule(businessId, "inventory");
  if (!licensed) return;

  const lines = await listJobMaterialRequirement(businessId, jobId);
  if (lines.length === 0) return;

  const warehouseId = await firstActiveWarehouseId(businessId);
  if (!warehouseId) return;

  for (const line of lines) {
    await releaseStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
    await consumeStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
  }
}

/** "...release on cancellation" -- the other side of `consumeJobParts()`'s own release
 * step, for the path that was previously missing entirely (docs/testing/
 * EXECUTION-2026-09-08.md finding 2, from TC-FSM-011's own explicit callout: "not left
 * reserved-forever if the job is cancelled instead of completed"). Only releases --
 * cancelling a job never consumes its parts, unlike completing one. Same best-effort
 * reasoning as the other two: cancelling a job is never blocked by inventory being
 * unlicensed or by the release call itself failing (e.g. nothing was actually reserved,
 * because `inventory` wasn't licensed yet at schedule time, or a line was never
 * successfully reserved to begin with -- `releaseStock()` itself rejects releasing more
 * than is reserved, caught and ignored the same as every other per-line call here).
 *
 * Also clears `parts_reservation_status` (INT-03.2): once released, nothing is actually
 * reserved for this job any more, so leaving a stale `reserved`/`partially_reserved`
 * badge showing on a cancelled job would be actively wrong, not just less rich. */
export async function releaseJobParts(businessId: string, jobId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const licensed = await hasModule(businessId, "inventory");
  if (!licensed) return;

  const lines = await listJobMaterialRequirement(businessId, jobId);
  if (lines.length === 0) return;

  const warehouseId = await firstActiveWarehouseId(businessId);
  if (!warehouseId) return;

  for (const line of lines) {
    await releaseStock(businessId, line.itemId, warehouseId, line.quantity, `fsm.jobs:${jobId}`).catch(() => null);
  }

  const fsm = await fsmClient();
  await fsm
    .from("jobs")
    .update({ parts_reservation_status: null, parts_reservation_detail: null, parts_reservation_checked_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("business_id", businessId);
}
