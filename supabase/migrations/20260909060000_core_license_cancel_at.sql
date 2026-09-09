-- Epic 2 follow-up: cancelling a license no longer deactivates it immediately -- it
-- stays fully active (read AND write, per core.has_module_write()) until the license's
-- next billing cycle, then the existing grace/expired lifecycle (ADR-9, C-4) takes over
-- exactly as it did before. `cancel_at` is that scheduled date; a license with
-- status = 'active' and cancel_at not null is "cancellation pending" -- still on, but
-- due to start its grace period once cancel_at arrives. Reactivating (the existing
-- activateLicense() path) during that window just clears cancel_at; nothing about the
-- grace/expired mechanics themselves changes, so ADR-9's "never deletes data" guarantee
-- and core.has_module()/has_module_write() are untouched by this migration.

alter table core.licenses add column cancel_at timestamptz;

-- The scheduled sweep (processDueCancellations(), mirroring expireGracePeriods()) scans
-- for exactly this: active licenses whose cancel_at has arrived.
create index licenses_pending_cancellation_idx on core.licenses (cancel_at)
  where status = 'active' and cancel_at is not null;

alter table core.license_events drop constraint license_events_event_type_check;
alter table core.license_events add constraint license_events_event_type_check
  check (event_type in (
    'activated', 'deactivated', 'reactivated', 'expired',
    'cancellation_scheduled', 'cancellation_undone'
  ));
