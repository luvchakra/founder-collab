import { createCrudHandler } from "@cofounderai/core/api-v1/crud.server";

/** Read-only, always -- an e-invoice/IRN is never created or cancelled by a plain write
 * to this table (generateEinvoice()/cancelEinvoice() call the actual GSP, a real-world
 * side effect an API-key-authenticated CRUD write must never trigger implicitly). Lets
 * a business's own accounting/ERP integration pull IRN/status for its documents without
 * a person clicking through the UI for each one. */
export const handle = createCrudHandler({
  schema: "gst",
  table: "einvoices",
  filterColumn: "business_id",
  listSelect: "id, document_id, status, irn, ack_no, ack_date, cancel_reason, cancelled_at, created_at, updated_at",
  defaultOrder: { column: "created_at", ascending: false },
  queryFilters: ["document_id", "status"],
});
