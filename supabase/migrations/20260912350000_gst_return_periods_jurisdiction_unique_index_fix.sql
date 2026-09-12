-- WonderArc Compliance backlog, COMPLY-P1-02.7 follow-up. **A real bug caught by actually
-- running the RLS harness, not just reasoning about it on paper** (the same payoff this
-- run's own briefing already named for a prior session's COMPLY-P0-07.7 story): the
-- immediately-prior migration's own plain
-- `unique (business_id, return_type, jurisdiction, period_start, period_end)` constraint
-- reintroduces the EXACT NULL-uniqueness gap this session's own briefing flagged as a
-- pre-existing, documented, out-of-scope issue in `gst.tax_rules` -- a plain SQL UNIQUE
-- constraint treats every NULL as distinct from every other NULL, so two `gstr1` periods
-- for the same business/period (both with `jurisdiction = null`) do NOT collide under a
-- plain unique constraint, silently reopening the exact duplicate-period bug the ORIGINAL
-- `gst.return_periods` migration's own 4-column unique constraint had correctly prevented
-- before this story added a nullable column to it. Caught immediately by
-- `scripts/test-gst-return-periods-rls.mjs`'s own pre-existing "a second return period for
-- the SAME business/return_type/period is rejected" assertion, which failed the moment
-- this story's own migration was applied against a real database.
--
-- **Fixed with a UNIQUE INDEX over `coalesce(jurisdiction, '')` instead of a plain UNIQUE
-- constraint over the nullable column directly** -- the standard Postgres pattern for
-- "treat NULL as one specific, comparable value for uniqueness purposes" (as opposed to a
-- PARTIAL unique index, which this schema already uses elsewhere for a DIFFERENT shape of
-- problem -- "unique only among ACTIVE rows," `gst.us_physical_nexus_facts`'s own
-- `one_active_per_state_type` index -- not applicable here, since a null-jurisdiction
-- national return and a non-null-jurisdiction state return both need normal, permanent
-- uniqueness, not an active/inactive distinction). Safe specifically because
-- `jurisdiction`'s own check constraint already guarantees it is either null or exactly two
-- uppercase letters -- an empty string sentinel can never collide with a real value.

alter table gst.return_periods
  drop constraint return_periods_business_id_return_type_jurisdiction_period_key;

create unique index return_periods_business_id_return_type_jurisdiction_period_key
  on gst.return_periods (business_id, return_type, (coalesce(jurisdiction, '')), period_start, period_end);
