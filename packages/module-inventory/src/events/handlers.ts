import { registerEventHandler } from "@cofounderai/core/events/registry";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import type { DomainEvent } from "@cofounderai/core/events/types";

/**
 * module-inventory's own event subscriptions (SP-9's "event publish/subscribe wiring";
 * 00-MASTER-PLAN.md's module contract layout: "each module's own events/handlers.ts").
 * Imported once, for its side effect, from apps/web/app/api/cron/drain-events/route.ts
 * before the drain loop runs -- core/events/registry.ts's own map is populated at import
 * time, so a handler that never gets imported never gets registered.
 *
 * `contract/index.ts`'s reserveStock/releaseStock/consumeStock publish
 * "inventory.stock.contract_adjusted" after every successful adjustment (so any other
 * module can react asynchronously); a published event with no registered handler fails
 * permanently on the very next drain (core/events/drain.ts), so this module must
 * subscribe to its own event too, not just publish it. The handler folds each one into
 * the same audit trail `stock.adjusted` (the synchronous DB-trigger path for a manual
 * "Record movement" form submission) already appears in -- one place to see every stock
 * change regardless of which module or path caused it.
 */
registerEventHandler("inventory.stock.contract_adjusted", async (event: DomainEvent) => {
  const payload = event.payload as {
    itemId?: string;
    warehouseId?: string;
    quantity?: number;
    movementType?: string;
    reference?: string | null;
  };

  await writeAuditLog({
    businessId: event.business_id,
    action: "stock.contract_adjusted",
    entityType: "stock_movement",
    after: {
      item_id: payload.itemId ?? null,
      warehouse_id: payload.warehouseId ?? null,
      quantity: payload.quantity ?? null,
      movement_type: payload.movementType ?? null,
      reference: payload.reference ?? null,
    },
  });
});
