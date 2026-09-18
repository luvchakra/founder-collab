-- The GRANTs three Finance migrations forgot.
--
-- `20260917240000_gst_banking`, `20260918100000_gst_recurring_entries` and
-- `20260918110000_gst_budgets` each enabled RLS and wrote policies, but never granted the
-- underlying table privileges. RLS narrows what a role may reach; it does not grant the
-- reach in the first place, so `authenticated` got "permission denied for table
-- bank_accounts" and the Banking, Recurring Entries and Budget pages all failed with the
-- generic error boundary.
--
-- The dev database healed itself some minutes later — Supabase applies grants to new
-- tables in exposed schemas on its own schedule — which is precisely why this is worth
-- writing down rather than leaving. A fresh environment built from this timeline would
-- break exactly the same way, and "it works once the platform gets round to it" is not a
-- property to depend on: the window is unpredictable and invisible.
--
-- Idempotent: granting a privilege that is already held is a no-op, so this is safe on the
-- dev database that has since been fixed and correct on one built from scratch.
--
-- Privileges mirror what each table's own policies already allow, and no more:
--   * no DELETE on bank accounts or reconciliations -- history must not vanish;
--   * DELETE on bank transactions (a line imported by mistake, while still unmatched),
--     budget lines (a plan, not a record) and recurring entries (a template).

grant select, insert, update on gst.bank_accounts to authenticated;
grant select, insert, update, delete on gst.bank_transactions to authenticated;
grant select, insert, update on gst.bank_reconciliations to authenticated;
grant select, insert, update, delete on gst.recurring_entries to authenticated;
grant select, insert, update, delete on gst.budget_lines to authenticated;

-- The drain and the recurring-entry cron run as service_role with no session, so they
-- need their own grants -- `20260917200000`'s own accounting tables already have these.
grant all on gst.bank_accounts, gst.bank_transactions, gst.bank_reconciliations,
             gst.recurring_entries, gst.budget_lines
  to service_role;
