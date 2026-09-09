import { createCrudHandler } from "@cofounderai/core/api-v1/crud.server";

/** Read-only for this first pass -- see module-fsm/api-v1/resources/jobs.server.ts's
 * own comment for why (no application-layer permission re-derivation for writes yet). */
export const handle = createCrudHandler({
  schema: "crm",
  table: "tickets",
  filterColumn: "business_id",
  listSelect: "id, channel_id, party_id, assigned_to, subject, status, created_at, updated_at",
  defaultOrder: { column: "created_at", ascending: false },
  queryFilters: ["status", "channel_id"],
});
