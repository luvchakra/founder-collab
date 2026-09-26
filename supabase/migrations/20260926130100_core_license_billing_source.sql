-- BILL-17 -- a licence records its commercial source (docs/plan/14-SUBSCRIPTION-BILLING-
-- BACKLOG.md §49): "manual" for every licence that exists today (activated from Settings
-- -> Licenses, or seeded at business creation), "subscription" for one provisioned by a
-- plan subscription. core.licenses stays the only authorization mechanism -- no parallel
-- billing licence table -- and has_module()/RLS ignore these columns entirely.
--
-- subscription_id deliberately has no foreign key: platform.subscriptions lives in the
-- `platform` schema, and cross-schema foreign keys point only INTO core (CLAUDE.md
-- non-negotiable #1). The billing provisioning service keeps the two in step.
--
-- Existing licences become "manual" and are never touched by subscription reconciliation,
-- which only changes licences it provisioned itself -- so rolling billing out revokes
-- nobody's access (§13).

alter table core.licenses
  add column source text not null default 'manual' check (source in ('manual', 'subscription')),
  add column subscription_id uuid;

create index licenses_subscription_idx on core.licenses (subscription_id) where subscription_id is not null;
