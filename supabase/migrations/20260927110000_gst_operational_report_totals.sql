-- FIN-6 (operational reports, §28): sales by customer and by item, purchases and expenses
-- by supplier. Read-only aggregates over `core.documents`/`core.document_lines`/
-- `core.items`/`core.parties` -- the canonical invoice, bill and item rows every module
-- writes -- so no table is created and nothing is copied into a Finance-local master.
-- (Inventory valuation is NOT here: stock is inventory-owned and Finance reads it only
-- through module-inventory's contract, ADR-10.)
--
-- Aggregated in SQL for the same reason as `gst.account_period_totals`: a busy business has
-- more documents than PostgREST returns in one page, and a sales report that is quietly
-- short is worse than no report.
--
-- SECURITY INVOKER: RLS on the core tables decides tenancy (a caller only sees documents
-- of businesses they belong to). Core tables carry no Finance licence check of their own,
-- so each function adds one explicitly -- `core.licensed_business_ids('gst')` -- and a
-- caller whose Finance licence has lapsed gets nothing, exactly as the gst-schema tables
-- behave (ADR-4/ADR-8: tenant AND licensed).
--
-- Sign convention: what was sold or bought is positive; a credit note or sales return
-- (and a supplier credit) counts negative against it, so every figure is net. Drafts and
-- cancelled documents are not transactions and are excluded -- the same rule
-- `financeEventFromDocument` applies before posting.

-- ---------------------------------------------------------------------------
-- Sales by customer
-- ---------------------------------------------------------------------------

create function gst.sales_by_party(p_business_id uuid, p_from date, p_to date)
returns table (
  party_id uuid,
  party_name text,
  document_count bigint,
  taxable_value numeric,
  tax numeric,
  total numeric
)
language sql
stable
set search_path = gst
as $$
  with signed as (
    select
      d.party_id,
      case when d.doc_type in ('credit_note', 'sales_return') then -1 else 1 end as sign,
      d.subtotal - d.discount_amount + d.shipping_amount as taxable,
      d.cgst_amount + d.sgst_amount + d.igst_amount as tax,
      d.total_amount as total
    from core.documents d
    where d.business_id = p_business_id
      and p_business_id in (select core.licensed_business_ids('gst'))
      and d.doc_type in ('invoice', 'debit_note', 'credit_note', 'sales_return')
      and d.status not in ('draft', 'cancelled')
      and (p_from is null or d.doc_date >= p_from)
      and (p_to is null or d.doc_date <= p_to)
  )
  select
    s.party_id,
    p.name,
    count(*) filter (where s.sign = 1),
    sum(s.sign * s.taxable),
    sum(s.sign * s.tax),
    sum(s.sign * s.total)
  from signed s
  join core.parties p on p.id = s.party_id
  group by s.party_id, p.name
  order by sum(s.sign * s.taxable) desc, p.name;
$$;

revoke all on function gst.sales_by_party(uuid, date, date) from public, anon;
grant execute on function gst.sales_by_party(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Sales by item (product or service)
-- ---------------------------------------------------------------------------

-- From the lines, at the price each line was sold at (quantity x unit price, the snapshot
-- the line itself carries -- never the item's current price). A header-only document (a
-- hand-entered invoice with no lines) has no item to attribute to; it is reported once,
-- as a null item, so the by-item total still accounts for every sale. A document-level
-- discount or shipping charge is not apportioned to lines, which is why the by-item total
-- can differ from the by-customer total by exactly those amounts.
create function gst.sales_by_item(p_business_id uuid, p_from date, p_to date)
returns table (
  item_id uuid,
  item_name text,
  item_kind text,
  sku text,
  quantity numeric,
  sales_value numeric
)
language sql
stable
set search_path = gst
as $$
  with docs as (
    select d.id, case when d.doc_type in ('credit_note', 'sales_return') then -1 else 1 end as sign,
           d.subtotal - d.discount_amount + d.shipping_amount as taxable
    from core.documents d
    where d.business_id = p_business_id
      and p_business_id in (select core.licensed_business_ids('gst'))
      and d.doc_type in ('invoice', 'debit_note', 'credit_note', 'sales_return')
      and d.status not in ('draft', 'cancelled')
      and (p_from is null or d.doc_date >= p_from)
      and (p_to is null or d.doc_date <= p_to)
  )
  select i.id, i.name, i.kind, i.sku, sum(docs.sign * l.quantity), round(sum(docs.sign * l.quantity * l.unit_price), 2)
  from docs
  join core.document_lines l on l.document_id = docs.id
  join core.items i on i.id = l.item_id
  group by i.id, i.name, i.kind, i.sku
  union all
  select null, null, null, null, null, sum(docs.sign * docs.taxable)
  from docs
  where not exists (select 1 from core.document_lines l where l.document_id = docs.id)
  having count(*) > 0
  order by 6 desc nulls last;
$$;

revoke all on function gst.sales_by_item(uuid, date, date) from public, anon;
grant execute on function gst.sales_by_item(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Purchases and expenses by supplier
-- ---------------------------------------------------------------------------

-- A bill and an expense are one document type (`supplier_bill`), told apart by
-- `source_ref.kind` (see docs/FINANCE-PROGRESS.md "A bill and an expense are one
-- document"); a bill with no recorded kind predates hand entry and is a bill. A supplier
-- credit reduces the supplier's bills.
create function gst.purchases_by_party(p_business_id uuid, p_from date, p_to date)
returns table (
  party_id uuid,
  party_name text,
  kind text,
  document_count bigint,
  taxable_value numeric,
  tax numeric,
  total numeric
)
language sql
stable
set search_path = gst
as $$
  with signed as (
    select
      d.party_id,
      case when d.doc_type = 'supplier_credit' then 'bill' else coalesce(d.source_ref ->> 'kind', 'bill') end as kind,
      case when d.doc_type = 'supplier_credit' then -1 else 1 end as sign,
      d.subtotal - d.discount_amount + d.shipping_amount as taxable,
      d.cgst_amount + d.sgst_amount + d.igst_amount as tax,
      d.total_amount as total
    from core.documents d
    where d.business_id = p_business_id
      and p_business_id in (select core.licensed_business_ids('gst'))
      and d.doc_type in ('supplier_bill', 'supplier_credit')
      and d.status not in ('draft', 'cancelled')
      and (p_from is null or d.doc_date >= p_from)
      and (p_to is null or d.doc_date <= p_to)
  )
  select s.party_id, p.name, s.kind, count(*) filter (where s.sign = 1),
         sum(s.sign * s.taxable), sum(s.sign * s.tax), sum(s.sign * s.total)
  from signed s
  join core.parties p on p.id = s.party_id
  group by s.party_id, p.name, s.kind
  order by sum(s.sign * s.total) desc, p.name;
$$;

revoke all on function gst.purchases_by_party(uuid, date, date) from public, anon;
grant execute on function gst.purchases_by_party(uuid, date, date) to authenticated;
