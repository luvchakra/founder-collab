import { hasModule, requireModule } from "@cofounderai/core/licensing/queries";
import { listWarehouses, reserveStock, releaseStock, consumeStock } from "@cofounderai/module-inventory/contract/index";
import { listJobMaterialRequirement } from "./queries";

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

/** "Job parts reserve on schedule" (F-14) -- best-effort: neither an unlicensed
 * `inventory` (ADR-10's own graceful degraded mode -- "the same job completes cleanly
 * with the parts as plain charges" per 02-FSM-PRD.md §7 acceptance criterion #4, which
 * this extends to scheduling too) nor a stock shortfall should ever block scheduling a
 * job. A per-line reservation failure (not enough available) is caught and skipped, not
 * retried -- the dispatcher still sees the job scheduled; `stock.low` alerts (surfaced
 * separately) are how they'd notice the shortfall, not a blocked schedule action. */
export async function reserveJobParts(businessId: string, jobId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const licensed = await hasModule(businessId, "inventory");
  if (!licensed) return;

  const lines = await listJobMaterialRequirement(businessId, jobId);
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
 * because `inventory` wasn't licensed yet at schedule time). */
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
}
