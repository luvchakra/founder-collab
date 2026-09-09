import { createCrudHandler } from "@cofounderai/core/api-v1/crud.server";

/** Read-only for this first pass (item #7 of a UX/API pass: "work on useful apis which
 * can be used for each module") -- no `writePermission`, so createCrudHandler rejects
 * POST/PATCH with 405 rather than accepting writes an API key could use to bypass
 * `jobs.edit`'s own application-layer enforcement (fsm's own mutations.ts calls
 * requirePermission() for every job write; nothing here re-derives that check yet). A
 * fast-follow once that's worth doing, not attempted speculatively. */
export const handle = createCrudHandler({
  schema: "fsm",
  table: "jobs",
  filterColumn: "business_id",
  listSelect:
    "id, number, party_id, opportunity_id, service_type_id, description, status, started_at, completed_at, created_at, updated_at",
  defaultOrder: { column: "created_at", ascending: false },
  queryFilters: ["status"],
});
