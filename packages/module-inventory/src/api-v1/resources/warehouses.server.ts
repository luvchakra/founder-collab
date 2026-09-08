import { createCrudHandler } from "@cofounderai/core/api-v1/crud.server";

// Note: no contact_name/contact_phone here -- inventory.warehouses (SP-3a) never carried
// those columns on this platform, unlike stockpilot-ai-ops's original warehouses table.
const FIELDS = ["name", "code", "type", "address", "city", "state", "country", "is_active"] as const;

export const handle = createCrudHandler({
  schema: "inventory",
  table: "warehouses",
  filterColumn: "business_id",
  listSelect: "id, name, code, type, address, city, state, country, is_active, created_at, updated_at",
  defaultOrder: { column: "name", ascending: true },
  writePermission: "inventory.edit",
  insertFields: FIELDS,
  updateFields: FIELDS,
});
