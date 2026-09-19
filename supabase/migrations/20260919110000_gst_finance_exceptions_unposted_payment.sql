-- FIN-2 (Backfill, §41) needs to route a payment allocation it could not post to the same
-- queue FIN-1 built, and `unposted_document` is the wrong bucket for it -- a payment
-- allocation isn't a `core.documents` row, and reusing that type would make its
-- `reference_key` (a document id for every other row of that type) ambiguous. FIN-1's own
-- migration docstring said widening `exception_type` is "a future story's own call, not
-- something to bolt on ad hoc" -- this is that future story, now that it is actually
-- needed rather than guessed at ahead of time.

alter table gst.finance_exceptions
  drop constraint finance_exceptions_exception_type_check;

alter table gst.finance_exceptions
  add constraint finance_exceptions_exception_type_check
  check (exception_type in ('unposted_document', 'unposted_payment', 'itc_at_risk', 'filing_blocker'));

comment on table gst.finance_exceptions is
  'FIN-1/FIN-2: one triage queue for what otherwise sits scattered across the dashboard, '
  'the GST ledger, filing readiness and the backfill scan. summary/impact/suggested_action '
  'are frozen snapshots, not recomputed live. Sync is additive-only -- see the FIN-1 '
  'migration''s own docstring.';
