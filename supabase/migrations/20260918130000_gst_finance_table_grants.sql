-- Finance F3/F10 — the table grants the banking, recurring-entries and budget migrations
-- never issued.
--
-- Those three migrations enabled RLS and wrote a full set of policies, but granted no
-- table privileges to anyone. RLS is a filter applied *after* the privilege check, not
-- instead of it: with no `grant`, every read fails at the privilege check with
-- `42501 permission denied for table ...` before a policy is ever consulted. The policies
-- were correct and the tables were correct; they were simply unreachable.
--
-- What that broke, all of it since the tables shipped:
--   * /finance/banking, /finance/budget and /finance/recurring — each threw on its first
--     select and rendered the app's generic error boundary.
--   * The statement import, matching and reconciliation write paths.
--   * The post-recurring-entries cron, which runs as `service_role` — these tables had no
--     service_role grant either, so it could not read the schedules or post the entries.
--
-- Each table is granted exactly the commands its own policies cover, so the grant is the
-- coarse gate and RLS stays the fine one; `gst.accounts` and friends in
-- 20260917200000_gst_accounting_foundation.sql are the pattern being matched here,
-- including `grant all ... to service_role` for the admin/cron paths.

-- Banking (20260917240000_gst_banking.sql).
-- bank_transactions carries a delete policy for unmatched lines; the other two do not.
grant select, insert, update on gst.bank_accounts to authenticated;
grant select, insert, update, delete on gst.bank_transactions to authenticated;
grant select, insert, update on gst.bank_reconciliations to authenticated;

-- Recurring entries (20260918100000_gst_recurring_entries.sql).
grant select, insert, update, delete on gst.recurring_entries to authenticated;

-- Budgets (20260918110000_gst_budgets.sql).
grant select, insert, update, delete on gst.budget_lines to authenticated;

-- The admin/cron paths: recurring-mutations.ts and banking-mutations.ts both reach for
-- the service-role client, which bypasses RLS but still needs the privilege.
grant all on gst.bank_accounts, gst.bank_transactions, gst.bank_reconciliations,
  gst.recurring_entries, gst.budget_lines to service_role;
