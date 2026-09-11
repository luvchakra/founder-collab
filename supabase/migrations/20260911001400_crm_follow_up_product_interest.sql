-- CRM-10.3 (WonderArc CRM backlog, Epic CRM-10): "Out-of-Stock Opportunity" --
-- "Interest captured -> waitlist/follow-up -> inventory event" when a customer requests
-- a product with zero current availability. Same reasoning CRM-08.7's review_item_id and
-- CRM-09.8's interaction_id already established for this table: crm.follow_up has no
-- "attached to something" constraint (unlike crm.activity), so a new nullable
-- product_interest_id column here -- not a new table, not forcing a fake
-- party/conversation just to satisfy activity's check -- is the minimal correct home for
-- "a task about this specific out-of-stock request."
alter table crm.follow_up add column product_interest_id uuid references crm.product_interest (id) on delete cascade;

-- Idempotent waitlisting: createOutOfStockWaitlist() (lib/conversations/products.ts)
-- relies on this to make a second "Waitlist" click on the same product interest a no-op
-- rather than a duplicate task, same pattern follow_up_review_item_id_uq/
-- follow_up_interaction_id_uq already use.
create unique index follow_up_product_interest_id_uq on crm.follow_up (business_id, product_interest_id) where product_interest_id is not null;
create index follow_up_product_interest_id_idx on crm.follow_up (product_interest_id);

create function crm.enforce_product_interest_business_id(p_product_interest_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.product_interest where id = p_product_interest_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'product_interest_id % does not belong to business_id %', p_product_interest_id, p_business_id;
  end if;
end; $$;

create or replace function crm.enforce_follow_up_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.activity_id is not null then perform crm.enforce_activity_business_id(new.activity_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  if new.review_item_id is not null then perform crm.enforce_review_item_business_id(new.review_item_id, new.business_id); end if;
  if new.interaction_id is not null then perform crm.enforce_interaction_business_id(new.interaction_id, new.business_id); end if;
  if new.product_interest_id is not null then perform crm.enforce_product_interest_business_id(new.product_interest_id, new.business_id); end if;
  return new;
end; $$;

-- CRM-10.4's "back in stock" trigger, the other end of CRM-10.3's waitlist: a genuine
-- inventory-side replenishment signal published from the one place stock actually
-- increases through a real restock action (a purchase order receipt), not the
-- cross-module reservation contract's own "inventory.stock.contract_adjusted" (which
-- fires on any reserve/release/consume call, including *decreases*, and only through
-- the contract path other modules use -- never inventory's own purchasing flow). No
-- inventory-side event-vocabulary file exists yet (unlike CRM-01.4's own closed
-- CrmEventType list) -- inventory.stock.contract_adjusted is itself just a bare string
-- literal at its one call site (contract/index.ts), so this follows that same
-- lightweight convention rather than introducing new governance inventory itself
-- hasn't established. Plain insert, not a SECURITY DEFINER wrapper -- this function
-- already runs as the receiving user's own session (authenticated, a member of
-- _doc.business_id), and core.domain_events' own insert policy
-- ("members can publish domain events in their businesses") already allows exactly
-- this, the same way any other authenticated publish() call does.
create or replace function inventory.receive_purchase_order_item(_document_line_id uuid, _quantity numeric)
returns void
language plpgsql
set search_path = inventory, core
as $$
declare
  _line core.document_lines%rowtype;
  _doc core.documents%rowtype;
  _warehouse_id uuid;
  _total_ordered numeric;
  _total_received numeric;
begin
  select * into _line from core.document_lines where id = _document_line_id;
  if not found then
    raise exception 'Purchase order line not found';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  if _line.received_quantity + _quantity > _line.quantity then
    raise exception 'Cannot receive more than the ordered quantity';
  end if;

  select * into _doc from core.documents where id = _line.document_id and doc_type = 'purchase_order';
  if not found then
    raise exception 'Purchase order not found';
  end if;
  if _doc.status not in ('sent', 'approved', 'partially_received') then
    raise exception 'Purchase order must be approved and sent before it can be received';
  end if;
  _warehouse_id := (_doc.source_ref->>'warehouse_id')::uuid;

  insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity, reference, notes, created_by)
  values (_doc.business_id, _line.item_id, _warehouse_id, 'inbound', _quantity, _doc.number, 'Received against purchase order', auth.uid());

  update core.document_lines set received_quantity = received_quantity + _quantity where id = _document_line_id;

  select sum(quantity), sum(received_quantity) into _total_ordered, _total_received
  from core.document_lines where document_id = _doc.id;

  update core.documents
  set status = case when _total_received >= _total_ordered then 'received' else 'partially_received' end
  where id = _doc.id;

  -- required_module = 'crm': this event's only registered consumer today is CRM-10.4's
  -- own handler (events/handlers.ts) -- a business with inventory licensed but not crm
  -- parks this event (core/events/drain.ts) rather than the handler running against a
  -- schema the business isn't entitled to, same as publish()'s own documented use of
  -- this column, replayed automatically once crm is activated (C-4).
  insert into core.domain_events (business_id, type, payload, required_module)
  values (
    _doc.business_id,
    'inventory.stock.replenished',
    jsonb_build_object('itemId', _line.item_id, 'warehouseId', _warehouse_id, 'quantity', _quantity, 'documentId', _doc.id),
    'crm'
  );
end;
$$;

revoke execute on function inventory.receive_purchase_order_item(uuid, numeric) from public;
grant execute on function inventory.receive_purchase_order_item(uuid, numeric) to authenticated;
