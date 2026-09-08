// Read-only per the original ticket ("Inventory levels (read)") -- writes to stock go
// through a recorded stock_movements entry (adjustments, receiving, shipping, the
// contract/index.ts RPC from SP-9, ...), never a direct stock_levels PATCH, in the API
// any more than in the UI. Registered under the "inventory" resource key (router.ts) to
// keep the original API's own /api/v1/inventory path, even though the backing table is
// stock_levels.
import { createCrudHandler } from "@cofounderai/core/api-v1/crud.server";

export const handle = createCrudHandler({
  schema: "inventory",
  table: "stock_levels",
  filterColumn: "business_id",
  listSelect: "id, item_id, warehouse_id, quantity, reserved, damaged, expired, in_transit, incoming, updated_at",
  defaultOrder: { column: "updated_at", ascending: false },
  queryFilters: ["item_id", "warehouse_id"],
});
