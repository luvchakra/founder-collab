import { createCrudHandler } from "@cofounderai/core/api-v1/crud.server";

const FIELDS = ["name", "gstin", "phone", "email", "billing_address", "shipping_address", "state", "is_active"] as const;

export const handle = createCrudHandler({
  schema: "inventory",
  table: "customers",
  filterColumn: "org_id",
  listSelect: "id, name, gstin, phone, email, billing_address, shipping_address, state, is_active, created_at, updated_at",
  defaultOrder: { column: "name", ascending: true },
  writePermission: "customers.edit",
  insertFields: FIELDS,
  updateFields: FIELDS,
});
