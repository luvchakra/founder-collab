-- docs/design/crm-module-design.md Part B, B2: lets an agent link a ticket to "the
-- thing they're actually asking about" -- a specific order, job, or invoice -- so B1's
-- Customer 360 panel can highlight the *relevant* item instead of just listing
-- everything the party has ever done. `related_document_id` is a plain uuid, not a
-- real FK: it points at a row owned by whichever module `related_module` names
-- (inventory/fsm's own core.documents rows, or a gst generation-history row), and
-- crm has no schema of any of those to reference (this platform's non-negotiable #1:
-- cross-schema FKs point only into core, and even core.documents can't be the target
-- here since gst's e-invoice/e-way-bill rows aren't core.documents rows themselves).

alter table crm.tickets add column related_module text check (related_module in ('inventory', 'fsm', 'gst'));
alter table crm.tickets add column related_document_id uuid;
alter table crm.tickets add constraint tickets_related_module_requires_document
  check ((related_module is null) = (related_document_id is null));
