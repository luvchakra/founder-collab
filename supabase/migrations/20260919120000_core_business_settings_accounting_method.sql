-- FIN-3 (Activation Wizard, §42) step 2, "Accounting method". §42's own text: "Support
-- accrual/cash reporting configuration without rewriting source transactions" -- a
-- reporting preference, not a second posting engine. This migration only records the
-- choice; nothing reads it yet (reports staying accrual-only until a later story teaches
-- them to re-derive a cash view from it is the "without rewriting source transactions"
-- part -- the ledger itself never changes shape for this).
--
-- Lands on `core.business_settings` next to `fiscal_year_start_month`/`gstin`/
-- `gst_registration_type` -- all three are finance/GST-flavoured fields already living on
-- this general per-business settings table (20260906095000's own precedent), not a new
-- gst-schema table, and inherits that table's existing RLS (any business member may write
-- their own business's settings; see that migration for why -- a preference like this one
-- is exactly the kind of low-stakes field that policy was written for).

alter table core.business_settings
  add column accounting_method text not null default 'accrual'
    check (accounting_method in ('accrual', 'cash'));
