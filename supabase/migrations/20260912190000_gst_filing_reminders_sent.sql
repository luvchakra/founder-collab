-- WonderArc Compliance backlog, COMPLY-P0-09.3 (Reminder Engine): a business-facing
-- reminder that a GSTR-1/3B/9 filing obligation (COMPLY-P0-09.1's own computed calendar)
-- is coming due. Mirrors `module-fsm`'s own `sendDueReminders()` pattern exactly (a
-- cron entry point, Resend email, idempotent via a persisted "already sent" marker,
-- module-license-gated, one business's own send failure never aborting the rest of the
-- run) -- checked that existing implementation first (backlog rule 1) rather than
-- inventing a different reminder mechanism for this module.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 and this backlog's own §4/§5 first (backlog
-- rule 1/5): no existing table records "has a reminder already gone out for this specific
-- obligation" -- COMPLY-P0-09.1's own Filing Calendar is deliberately schema-free (computed
-- live from a registration + a versioned rule + `gst.return_periods`), which is exactly
-- why THIS table has to exist: a reminder, once sent, must never be re-sent for the same
-- obligation just because the calendar was recomputed on the next cron run.
--
-- SCOPE, deliberately narrowed to FILING obligations only (backlog rule 5, "do not
-- implement future stories implicitly") -- COMPLY-P0-09.2's own PAYMENT obligations are
-- NOT reminded here. A monthly filer's payment IS its GSTR-3B filing (same due date, so a
-- filing reminder already covers it in practice); a QRMP quarterly filer's own PMT-06
-- installment payments are a genuinely separate obligation with no return attached, and
-- reminding about those is a real, plausible future addition to this same table (it would
-- need its own natural-key shape, since an installment has no `return_type`), deliberately
-- left out rather than guessed at here.
--
-- One row per (business, return_type, period_end, lead_days) that has ever been sent --
-- `unique` on that natural key is the whole idempotency mechanism: the cron scans every
-- upcoming obligation on every run, computes which lead-day thresholds it has now
-- crossed, and only sends (inserting a row) for a threshold that has no row yet. Never
-- updated, never deleted -- an append-only historical record of which reminders actually
-- went out, same "append-only" precedent every other history table in this schema
-- follows.

create table gst.filing_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  return_type text not null check (return_type in ('gstr1', 'gstr3b', 'gstr9')),
  period_end date not null,
  -- How many days before the due date this reminder was for (e.g. 7, 1) -- part of the
  -- natural key so a business gets both a "due in a week" AND a "due tomorrow" reminder,
  -- not just the first one that ever fires.
  lead_days integer not null check (lead_days >= 0),
  sent_at timestamptz not null default now(),
  unique (business_id, return_type, period_end, lead_days)
);

create index filing_reminders_sent_business_id_idx on gst.filing_reminders_sent (business_id);

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). In practice the cron route
-- writes through the admin client (no signed-in user, same reasoning
-- `einvoicing/mutations.ts#generateEinvoice` already documents for the `document.issued`
-- event consumer) -- this INSERT policy is the same belt-and-suspenders backstop
-- `gst.einvoices`/`gst.eway_bills` already document, not the literal enforcement
-- mechanism. No extra permission beyond module licensing on INSERT, matching
-- `gst.tax_determinations`'s own reasoning: recording that a reminder was sent is an
-- automatic system byproduct, not a user-level settings decision.
-- ---------------------------------------------------------------------------

alter table gst.filing_reminders_sent enable row level security;

create policy "business members can view their filing reminders sent"
  on gst.filing_reminders_sent for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "licensed businesses can record a filing reminder sent"
  on gst.filing_reminders_sent for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
  );

-- No update, no delete policy -- append-only, see this migration's own top docstring.

grant select, insert on gst.filing_reminders_sent to authenticated;
grant all on gst.filing_reminders_sent to service_role;
