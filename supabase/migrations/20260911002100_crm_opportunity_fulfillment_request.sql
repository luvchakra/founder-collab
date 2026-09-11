-- INT-02.2 (Cross-Module Completion Backlog, Epic INT-02): "Create Inventory
-- Fulfillment/Reservation Request." One pointer, exactly the same shape as CRM-11.1's
-- own `fsm_opportunity_id` bridge column: CRM stores only the reference, Inventory's
-- own sales order (created through `createFulfillmentRequest()`, the inventory
-- contract's own authoritative mutation) remains the source of truth for everything
-- else (status, totals, line items) -- always re-read live, never copied here. Bare
-- uuid, no FK -- inventory's `sales_orders` compat view sits over `core.documents` in
-- another module's own schema territory (CLAUDE.md non-negotiable #1: cross-schema FKs
-- point only into `core`), same reasoning `fsm_opportunity_id` already documents.
alter table crm.opportunity add column fulfillment_request_id uuid;
