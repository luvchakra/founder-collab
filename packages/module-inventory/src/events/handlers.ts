import { registerEventHandler } from "@cofounderai/core/events/registry";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import type { DomainEvent } from "@cofounderai/core/events/types";
import { createAdminClient } from "../db/admin";

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

/**
 * Auto-creates a first warehouse the moment `inventory` is licensed for a business
 * (NEXT-ACTIVITIES.md's own deferred item, "no auto-created first warehouse when an
 * inventory license activates" -- StockPilot's own onboarding flow was deliberately not
 * ported to avoid a second business-creation path, but a business with an inventory
 * license and zero warehouses has nowhere to record stock at all, which is a real gap,
 * not a deliberate one). `packages/core/src/licensing/lifecycle.ts#activateLicense()`
 * already publishes `license.${eventType}` for every transition (`recordLicenseEvent()`)
 * -- subscribing here rather than importing inventory-specific logic into `core` itself
 * (core may not import any module, CLAUDE.md non-negotiable #3) is the correct mechanism
 * per ADR-5.
 *
 * Runs via the admin client -- this handler fires from the cron drain loop, which has no
 * signed-in user session, same reasoning `work-requests/mutations.ts` already documents
 * for its own no-session case. Idempotent: skips entirely if the business already has
 * any warehouse at all (a manual one created before this fired, or this being a
 * reactivation rather than a first activation) -- never creates a second default
 * warehouse alongside one that already exists.
 */
registerEventHandler("license.activated", async (event: DomainEvent) => {
  const payload = event.payload as { module_key?: string };
  if (payload.module_key !== "inventory") return;

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("warehouses")
    .select("id")
    .eq("business_id", event.business_id)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { error } = await admin.from("warehouses").insert({
    business_id: event.business_id,
    name: "Main Warehouse",
    code: "MAIN",
    type: "warehouse",
  });
  if (error) throw error;
});
