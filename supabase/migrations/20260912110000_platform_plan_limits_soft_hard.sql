-- PLATFORM-P0-06.5 ("Soft vs Hard Limits, Warning Threshold",
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §10). The doc's own text for this story was
-- three bare nouns with no defined behavior (see this workstream's own audit log entry,
-- "PLATFORM-P0-06.5 -- stopped, not built" -- the doc gave no worked example, no definition
-- of what "soft" vs "hard" do differently, and no definition of what a warning threshold
-- triggers). The user has since made three concrete decisions directly (not derived or
-- guessed by this run); this migration implements decision #2, the schema shape.
--
-- Decision #2, verbatim: `limit_type` is a new, INDEPENDENT column on
-- `platform.plan_limits`, meaningful only when `state = 'limited'`. It does NOT reinterpret
-- the existing tri-state `state` column (`limited`/`unlimited`/`disabled`,
-- PLATFORM-P0-04.5/04.6) or retroactively redefine any of its three existing values --
-- "hard" is not a fourth spelling of "limited" and "soft" is not a new `state`. Nullable,
-- with a row-level CHECK requiring it be set (to 'soft' or 'hard') exactly when
-- `state = 'limited'`, and null for the other two states -- the same "a companion column's
-- presence is gated on `state`" shape `plan_limits_value_matches_state` already established
-- for `limit_value` itself, one migration ago.
--
-- Every existing `limited` row (there are none in dev today -- PLATFORM-P0-04.5's own
-- migration deliberately shipped this table with no seeded rows, and nothing since has
-- added one) is backfilled to 'hard' -- decision #1's own explicit instruction, so
-- PLATFORM-P0-06.3's already-shipped, already-dev-verified denial semantics
-- (`try_consume_usage_counter()`, `getLimit()`) are the unchanged default for every row
-- that predates this column, and nothing regresses silently. Going forward, the
-- application layer (`packages/core/src/admin/platform-plan-limits.ts`'s
-- `setPlanLimitSchema`) defaults a newly-`limited` row to `'hard'` too when a superadmin
-- doesn't explicitly pick 'soft' -- the same "default preserves today's behavior" stance,
-- enforced in the one place that already validates every write to this table end to end.
alter table platform.plan_limits add column limit_type text;

update platform.plan_limits set limit_type = 'hard' where state = 'limited';

-- `limit_type is not null and` is required here, not redundant: `limit_type in ('soft',
-- 'hard')` alone evaluates to plain SQL NULL (neither true nor false) when `limit_type` IS
-- null, and Postgres treats a NULL CHECK result as satisfied, not violated -- the classic
-- "NULL IN (...) is NULL, not false" trap. Without the explicit `is not null`, a `limited`
-- row with no `limit_type` at all would silently pass this constraint instead of being
-- rejected. `plan_limits_value_matches_state` (the sibling CHECK on `limit_value`, previous
-- migration) avoids the same trap by using `is not null`/`is null` throughout rather than
-- `in`/`= `; this constraint follows the identical, NULL-safe shape.
alter table platform.plan_limits add constraint plan_limits_type_matches_state check (
  (state = 'limited' and limit_type is not null and limit_type in ('soft', 'hard'))
  or (state in ('unlimited', 'disabled') and limit_type is null)
);

-- No RLS policy change: RLS is row-level, not column-level, and this table's existing
-- select/insert/update/delete policies (superadmin write, any-authenticated-user read per
-- PLATFORM-P0-05.2/05.3's own `platform_catalog_authenticated_read` migration) already
-- cover every column on the row, this new one included.
