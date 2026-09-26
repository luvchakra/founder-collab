-- DISC-OFFER-P1-02.3 "Offering Performance Analysis" -- "Which Discovery Plays perform
-- best?" was the one question of the five left unanswered, because a Discovery Definition
-- (DISC-OFFER-P0-04.1) kept no record of which Discovery Play preset (DISC-OFFER-P0-04.2,
-- `lib/discovery-definitions/plays.ts`) it was started from. This column is that record.
--
-- Entity-ownership check (00-MASTER-PLAN.md §5): a column on an existing discovery-owned
-- table, no new concept. Nullable: a definition written from scratch, seeded by the
-- pipeline's own "Build Discovery Strategy" stage, or created before this column existed
-- has no play. No backfill -- guessing a play from a definition's name or signals would
-- attribute outcomes to a play nobody chose; those rows report as "Custom definition".
--
-- The key catalogue lives in application code (the presets are hand-written constants,
-- not rows), so the constraint checks the key's shape rather than an enumerated list that
-- would need a migration every time a preset is added. The server action only ever
-- writes a key that exists in `DISCOVERY_PLAYS`.
alter table discovery.discovery_definitions
  add column play_key text check (play_key is null or play_key ~ '^[a-z][a-z0-9_]{0,63}$');

create index discovery_definitions_play_key_idx on discovery.discovery_definitions (workspace_id, play_key)
  where play_key is not null;
