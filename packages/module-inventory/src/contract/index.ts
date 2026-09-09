import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { publish } from "@cofounderai/core/events/mutations";
import { createClient } from "../db/server";
import { getDashboardSummary } from "../lib/dashboard/queries";
import { inr, num } from "@cofounderai/core/lib/format";
import type { ContractAvailability, ContractLowStockAlert, ContractResult, ContractWarehouse, UpsertItemInput } from "./types";
import type { ShellAlert } from "@cofounderai/core/shell/types";

/**
 * module-inventory's public API surface (00-MASTER-PLAN.md §6 mechanism 2; SP-9) -- the
 * ONLY thing another module may import from this package (CLAUDE.md's architecture rule
 * #3, CI-enforced by lint:boundaries). Every function here runs as the calling user
 * through the normal RLS-scoped client, same as this module's own routes -- there's no
 * privileged path for a cross-module call; a caller must itself be a member of the
 * business it's asking about, same as any direct write would require.
 */

async function coreClient() {
  return createCoreClient({ schema: "core" });
}

async function requireLicensed(businessId: string): Promise<"MODULE_NOT_LICENSED" | null> {
  const licensed = await hasModule(businessId, "inventory");
  return licensed ? null : "MODULE_NOT_LICENSED";
}

/** Active warehouses for a business -- e.g. for another module's own "where should this
 * be fulfilled from" picker. */
export async function listWarehouses(businessId: string): Promise<ContractResult<ContractWarehouse[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, code")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/** Current stock position for one item, per warehouse (or just the one given). */
export async function getAvailability(
  businessId: string,
  itemId: string,
  warehouseId?: string,
): Promise<ContractResult<ContractAvailability[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const supabase = await createClient();
  let query = supabase
    .from("stock_levels")
    .select("warehouse_id, quantity, reserved, damaged, expired")
    .eq("business_id", businessId)
    .eq("item_id", itemId);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: data.map((l) => ({
      warehouseId: l.warehouse_id,
      quantity: Number(l.quantity),
      reserved: Number(l.reserved),
      available: Number(l.quantity) - Number(l.reserved) - Number(l.damaged) - Number(l.expired),
    })),
  };
}

/** Open low-stock alerts (F-14, `fsm`'s own dispatcher surface: "stock.low surfaced to
 * the dispatcher") -- `inventory.alerts` rows of `type='low_stock'` and `status='open'`,
 * written by `inventory.check_stock_alerts()`'s own trigger, never by the app. */
export async function listLowStockAlerts(businessId: string): Promise<ContractResult<ContractLowStockAlert[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("id, title, description, severity, created_at")
    .eq("business_id", businessId)
    .eq("type", "low_stock")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: data.map((a) => ({ id: a.id, title: a.title, description: a.description, severity: a.severity, createdAt: a.created_at })) };
}

/**
 * Find-or-create/update a `core.items` row -- core-owned, cross-module data (its own
 * `kind` column already spans 'good'/'service'/'labour'/'part'/'expense', not just
 * inventory's own products), so this is the sanctioned write path for another module to
 * register or update one, matching mechanism 2 rather than writing to `core.items`
 * directly from outside its owning module. Goes straight to `core.items`, not the
 * `inventory.products` compat view -- that view's own INSTEAD OF trigger hardcodes
 * `kind = 'good'`, so it can't be reused for a 'part'/'service'/etc row.
 */
export async function upsertItem(businessId: string, input: UpsertItemInput): Promise<ContractResult<{ id: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };
  if (!input.name.trim()) return { ok: false, error: "INVALID_INPUT" };

  const supabase = await coreClient();
  const kind = input.kind ?? "good";
  const itemPayload = {
    business_id: businessId,
    kind,
    sku: input.sku ?? null,
    name: input.name,
    unit: input.unit ?? "pcs",
    hsn_code: input.hsnCode ?? null,
    tax_rate: input.taxRate ?? 18,
    cost_price: input.costPrice ?? 0,
    selling_price: input.sellingPrice ?? 0,
  };

  let itemId = input.id;
  if (itemId) {
    const { error } = await supabase.from("items").update(itemPayload).eq("id", itemId).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
  } else if (input.sku) {
    const { data: existing, error: findError } = await supabase
      .from("items")
      .select("id")
      .eq("business_id", businessId)
      .eq("sku", input.sku)
      .maybeSingle();
    if (findError) return { ok: false, error: findError.message };
    if (existing) {
      itemId = existing.id;
      const { error } = await supabase.from("items").update(itemPayload).eq("id", itemId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data, error } = await supabase.from("items").insert(itemPayload).select("id").single();
      if (error) return { ok: false, error: error.message };
      itemId = data.id;
    }
  } else {
    const { data, error } = await supabase.from("items").insert(itemPayload).select("id").single();
    if (error) return { ok: false, error: error.message };
    itemId = data.id;
  }

  if (kind === "good") {
    const { error } = await supabase.from("item_inventory_attrs").upsert(
      {
        item_id: itemId,
        business_id: businessId,
        reorder_point: input.reorderPoint ?? 0,
        reorder_quantity: input.reorderQuantity ?? 0,
        barcode: input.barcode ?? null,
      },
      { onConflict: "item_id" },
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, data: { id: itemId! } };
}

type ContractMovementType = "reserve" | "unreserve" | "outbound";

async function adjustStock(
  businessId: string,
  itemId: string,
  warehouseId: string,
  movementType: ContractMovementType,
  quantity: number,
  reference?: string,
): Promise<ContractResult<{ movementId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "INVALID_INPUT" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock_for_contract", {
    _business_id: businessId,
    _item_id: itemId,
    _warehouse_id: warehouseId,
    _movement_type: movementType,
    _quantity: quantity,
    _reference: reference ?? null,
  });
  if (error) return { ok: false, error: error.message };

  // Fire-and-forget signal for any other module watching stock change (mechanism 3) --
  // this call already answered its own caller synchronously above; publishing on top
  // lets a third party react asynchronously without this function waiting on it. The
  // registered handler (events/handlers.ts) writes it into the same audit trail
  // stock.adjusted (the DB-trigger path for manual adjustments) already appears in.
  await publish({
    businessId,
    type: "inventory.stock.contract_adjusted",
    payload: { itemId, warehouseId, quantity, movementType, reference: reference ?? null },
  });

  return { ok: true, data: { movementId: data as string } };
}

/** Reserves stock for an item at a warehouse (e.g. another module holding stock for a
 * job/order it's fulfilling) -- rejected if not enough is currently available. */
export function reserveStock(
  businessId: string,
  itemId: string,
  warehouseId: string,
  quantity: number,
  reference?: string,
): Promise<ContractResult<{ movementId: string }>> {
  return adjustStock(businessId, itemId, warehouseId, "reserve", quantity, reference);
}

/** Releases a previously reserved quantity back to available -- rejected if it would
 * release more than is currently reserved. */
export function releaseStock(
  businessId: string,
  itemId: string,
  warehouseId: string,
  quantity: number,
  reference?: string,
): Promise<ContractResult<{ movementId: string }>> {
  return adjustStock(businessId, itemId, warehouseId, "unreserve", quantity, reference);
}

/**
 * A short plain-language snapshot of this business's inventory position -- what the AI
 * assistant (module-discovery's chat) grounds itself in when the founder is looking at
 * Inventory, or has opted into "consult all modules" for a cross-module answer. Reuses
 * the same getDashboardSummary() the Inventory dashboard page itself renders from,
 * rather than a second parallel aggregation -- one read model, two presentations (a UI
 * dashboard here, a paragraph of text there). `canViewCost` is always false here: the
 * chat prompt is not the place to leak cost/margin data to a model call regardless of
 * the asking user's own permissions.
 */
export async function getChatContextSummary(businessId: string): Promise<ContractResult<string>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const summary = await getDashboardSummary(businessId, false);
  const lines = [
    `Inventory: ${num.format(summary.productCount)} products, ${num.format(summary.available)} units available.`,
    summary.stockout > 0 || summary.low > 0
      ? `${num.format(summary.stockout)} out of stock, ${num.format(summary.low)} below reorder point.`
      : "Stock levels are healthy across the board.",
    summary.pendingPurchases > 0
      ? `${num.format(summary.pendingPurchases)} pending purchase order(s)${summary.overduePOs.length > 0 ? `, ${num.format(summary.overduePOs.length)} overdue` : ""}.`
      : "No pending purchase orders.",
    `Sales today: ${inr.format(summary.salesTodayTotal)}.`,
  ];
  return { ok: true, data: lines.join(" ") };
}

/**
 * Topbar alert-bell entries for this business's inventory position (item #13 of a UX
 * pass: "expand the notification feature... to all modules" -- the bell previously only
 * ever showed discovery-derived alerts). Reuses the same getDashboardSummary() every
 * other inventory-facing summary here does; `ShellAlert` is core-owned (packages/core/
 * src/components/shell/types.ts) specifically so a module can produce these without
 * depending on module-discovery, which owns the bell's caller but not the alert shape
 * itself.
 */
export async function getAlerts(businessId: string): Promise<ContractResult<ShellAlert[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const summary = await getDashboardSummary(businessId, false);
  const basePath = `/dashboard/businesses/${businessId}/inventory`;
  const alerts: ShellAlert[] = [];

  if (summary.stockout > 0) {
    alerts.push({
      id: `inventory-stockout-${businessId}`,
      severity: "warning",
      message: `${num.format(summary.stockout)} product${summary.stockout === 1 ? "" : "s"} out of stock.`,
      href: `${basePath}/dashboard`,
    });
  } else if (summary.low > 0) {
    alerts.push({
      id: `inventory-low-${businessId}`,
      severity: "info",
      message: `${num.format(summary.low)} product${summary.low === 1 ? "" : "s"} below reorder point.`,
      href: `${basePath}/dashboard`,
    });
  }

  if (summary.overduePOs.length > 0) {
    alerts.push({
      id: `inventory-overdue-po-${businessId}`,
      severity: "warning",
      message: `${num.format(summary.overduePOs.length)} purchase order${summary.overduePOs.length === 1 ? "" : "s"} overdue.`,
      href: `${basePath}/purchase-orders`,
    });
  }

  // The open-alert rows inventory's own alert engine already maintains (real-time
  // low-stock/stockout triggers, not just this snapshot's own thresholds) -- capped
  // so a business with many open alerts doesn't flood the shared bell.
  for (const a of summary.alerts.slice(0, 3)) {
    alerts.push({
      id: `inventory-alert-${a.id}`,
      severity: a.severity === "critical" ? "warning" : "info",
      message: a.title,
      href: `${basePath}/alerts`,
    });
  }

  return { ok: true, data: alerts };
}

/** Permanently consumes on-hand stock (e.g. parts used on a completed job) -- rejected
 * if not enough is currently available. */
export function consumeStock(
  businessId: string,
  itemId: string,
  warehouseId: string,
  quantity: number,
  reference?: string,
): Promise<ContractResult<{ movementId: string }>> {
  return adjustStock(businessId, itemId, warehouseId, "outbound", quantity, reference);
}
