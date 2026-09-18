-- A supplier bill is a document this platform could not represent.
--
-- `core.documents` allowed `purchase_order` but nothing for "a supplier has invoiced us
-- and we owe them by a date". A purchase order is a commitment: it creates no liability,
-- carries no due date anyone is chased on, and is often for a different amount than what
-- is eventually billed. That gap is why Accounts Payable was the one Finance screen that
-- could not be built — the posting rules (`supplier_bill.created`) and the aging
-- arithmetic were already there and module-agnostic, with nothing to run against.
--
-- Added to the canonical documents table rather than as a Finance-local bills table, per
-- 00-MASTER-PLAN.md §5: a second copy of "a bill" is exactly the triplication that map
-- exists to prevent, and Inventory will want to raise these against its own purchase
-- orders. Signed off by the product owner 2026-09-18.
--
-- `supplier_credit` comes with it. A supplier's credit note is to a bill what a credit
-- note is to an invoice, and adding the pair now avoids a second migration the first time
-- anyone returns goods against a bill.

alter table core.documents
  drop constraint documents_doc_type_check;

alter table core.documents
  add constraint documents_doc_type_check
  check (doc_type in (
    'estimate', 'sales_order', 'invoice', 'credit_note', 'debit_note',
    'proforma_invoice', 'purchase_order', 'sales_return',
    'supplier_bill', 'supplier_credit'
  ));

-- The per-type partial index every other doc_type already has (see this table's own
-- migration): the common query is "recent documents of one type for this business", and
-- core.documents mixes every type in one table.
create index if not exists documents_business_id_supplier_bill_idx
  on core.documents (business_id, doc_date desc)
  where doc_type = 'supplier_bill';

create index if not exists documents_business_id_supplier_credit_idx
  on core.documents (business_id, doc_date desc)
  where doc_type = 'supplier_credit';
