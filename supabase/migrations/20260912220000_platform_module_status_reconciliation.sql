-- PLATFORM-P0-07.3 ("Module Maintenance Mode", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §11) -- resuming the story stopped in this backlog's own audit log entry once the user
-- made all four decisions that entry's own open questions needed. This migration is the
-- reconciliation of `platform.modules.enabled` (PLATFORM-P0-07.2's kill switch) and
-- `platform.modules.status` (PLATFORM-P0-07.1's four-value enum) the user's decision #1
-- requires, plus the `read_only`/`maintenance` behavioral meaning decisions #2/#3, plus the
-- audited customer-facing message decision #4.
--
-- **Decision #1's reconciliation, and why this direction (not the other)**: the user's own
-- instruction offered two directions -- "status could become the single source of truth...
-- with enabled derived/kept in sync, OR enabled=false could be the thing that forces
-- status='disabled'" -- and asked for whichever "requires the least duplicated state."
-- `status` is chosen as the single source of truth: `enabled` becomes a `generated always
-- as ... stored` column computed directly from `status` (`available`/`read_only` ->
-- true, `maintenance`/`disabled` -> false). This is the direction with zero duplicated
-- state, not merely less: the database itself makes it *structurally impossible* for the
-- two columns to ever disagree, rather than relying on a trigger or application-layer
-- discipline to keep two independently-writable columns in sync (a trigger-based "keep
-- enabled in sync with status" approach was considered and rejected -- it would still leave
-- two physically separate columns a future migration or a direct service-role write could
-- desynchronize; a generated column cannot be desynchronized, full stop). The
-- read_only/available distinction is folded into "enabled" too, matching decision #2's own
-- framing: a read_only module is still reachable (read allowed), the same way a business's
-- own license in its 30-day grace period is still "has_module() = true" even though
-- "has_module_write() = false" -- `enabled` (this column) has always meant "reachable at
-- all," never "fully unrestricted," so read_only correctly maps to enabled = true.
--
-- **Decision #3's "maintenance is the same full block as disabled"** falls directly out of
-- this same generated-column definition: `maintenance` and `disabled` compute to the exact
-- same `enabled = false`, so every existing enforcement point that already keys off
-- `enabled` (none remain after this migration -- see below) or, from here on, off
-- `status not in ('available', 'read_only')` treats them identically by construction. There
-- is no separate access level for `maintenance` anywhere in this schema -- the only
-- difference the application layer is expected to render is *copy* (a `maintenance`-specific
-- "temporary, we'll be back soon" message vs. `disabled`'s indefinite notice), driven by
-- `status` itself plus the new optional `customer_facing_message` column below, never by a
-- second flag.
--
-- **Decision #1's "same safeguards" requirement**: `platform.set_module_status()` below is
-- the one new SECURITY DEFINER function that owns every future status transition
-- (available/read_only/maintenance/disabled, in any direction) -- it requires a non-empty
-- `reason` unconditionally (PLATFORM-P0-07.2's own existing bar, which already required a
-- reason in BOTH directions of its enabled/disabled flip, not just disabling) and writes one
-- atomic audit row per transition to `platform.module_status_events` (this migration's
-- rename+extension of PLATFORM-P0-07.2's own `platform.module_kill_switch_events` -- see
-- below for why extend rather than fork a sibling table). The "impact confirmation" and
-- "explicit acknowledgement" halves of §11's own four requirements stay UI-layer concerns,
-- exactly as PLATFORM-P0-07.2's own migration already documented for the boolean kill
-- switch ("this migration lays down the data half only") -- the admin UI (see
-- `packages/core/src/admin/platform-modules.ts` and the new status dialog) shows both before
-- ever calling this function, and shows them specifically whenever the transition enters or
-- leaves a fully-blocked state (`maintenance`/`disabled`) in either direction, mirroring
-- PLATFORM-P0-07.2's own dialog already requiring the same ceremony for re-enabling, not
-- only disabling.
--
-- `platform.set_module_enabled(p_module_key, p_enabled, p_reason)` (PLATFORM-P0-07.2's own
-- RPC) is kept, not dropped -- redefined as a thin wrapper delegating to
-- `set_module_status()` (mapping `enabled=true` -> `status='available'`, `enabled=false` ->
-- `status='disabled'`, and passing the module's current `customer_facing_message` through
-- unchanged) rather than writing to `platform.modules` directly. This is deliberately "a
-- thin wrapper around the same audited mechanism" per the user's own phrasing -- one real
-- mutation path (`set_module_status`), two equally-valid entry points into it, never two
-- independent ways to reach "every business blocked."
--
-- **Decision #4's message audit**: `platform.module_status_events` (renamed from
-- `module_kill_switch_events`, see below) gains `previous_message`/`new_message` alongside
-- the renamed `previous_status`/`new_status` (replacing the old boolean `enabled` column,
-- which is now fully redundant with `new_status`) -- every call to `set_module_status()`
-- captures a full before/after snapshot of both fields in one row, so a superadmin editing
-- only the message (status held constant) is audited exactly the same way a status-only
-- change is, per the user's own instruction that a message change "leave a trace of
-- who/when/old-value/new-value, consistent with the standard this backlog has already set
-- for reason fields."
--
-- **Why extend `module_kill_switch_events` rather than fork a sibling table**: this backlog
-- was explicitly given the choice ("reuse or extend the existing... audit table, or a
-- clearly-named sibling, your call"). A sibling table would mean two audit trails for what
-- is now conceptually one lifecycle (every module status transition, kill-switch or
-- otherwise) -- exactly the kind of fragmented, hard-to-reconcile history CLAUDE.md
-- non-negotiable #5 warns against for tables in general. Renamed (not left as
-- `module_kill_switch_events`) because, after this migration, it audits every status
-- transition (including `read_only`<->`available`, which is not a "kill switch" in any
-- sense) -- keeping the old name would misdescribe its own contents going forward.
-- Built as an explicit fresh table (not `like ... including all`, which copies neither
-- foreign keys, RLS enablement, nor policies -- all three matter here, so this is spelled
-- out in full rather than relying on a copy that would silently need each of those redone
-- anyway). Confirmed live via `execute_sql` before writing this migration that
-- `platform.module_kill_switch_events` has zero rows in the dev project -- there is no real
-- history to preserve across the rename, only the table shape.
create table platform.module_status_events (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references core.modules (key),
  previous_status text not null check (previous_status in ('available', 'read_only', 'maintenance', 'disabled')),
  new_status text not null check (new_status in ('available', 'read_only', 'maintenance', 'disabled')),
  previous_message text,
  new_message text,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

drop table platform.module_kill_switch_events;

create index module_status_events_module_key_idx on platform.module_status_events (module_key);
create index module_status_events_performed_by_idx on platform.module_status_events (performed_by);

alter table platform.module_status_events enable row level security;

-- Sensitive operational history, same trust level PLATFORM-P0-07.2's own
-- `module_kill_switch_events` policy already established -- superadmin-only SELECT, not the
-- open catalog read `platform.modules` itself gets.
create policy "superadmins can view module status events"
  on platform.module_status_events for select to authenticated
  using (platform.is_superadmin());

-- No INSERT/UPDATE/DELETE policy or grant to `authenticated` at all -- the only path to a
-- row is `set_module_status()`'s own SECURITY DEFINER insert below, exactly
-- `core.write_audit_log()`'s "one function owns every write" pattern PLATFORM-P0-07.2
-- already established for this table's predecessor.
grant select on platform.module_status_events to authenticated;
grant all on platform.module_status_events to service_role;

-- The optional customer-facing message (§11, "with optional customer-facing message") --
-- shown to a blocked/degraded business instead of (or alongside) the default WonderArc copy
-- for its module's current status. Nullable (no message set is the common case); length-
-- capped the same defense-in-depth-under-the-database way every other free-text field in
-- this backlog's platform.* tables already is (e.g. platform.branding's footer_text).
alter table platform.modules
  add column customer_facing_message text
    check (customer_facing_message is null or char_length(customer_facing_message) <= 2000);

-- The reconciliation itself: `enabled` stops being an independently-writable column and
-- becomes fully derived from `status` -- see this migration's own header comment for why
-- this direction (status as the single source of truth) was chosen over the reverse.
alter table platform.modules drop column enabled;
alter table platform.modules
  add column enabled boolean generated always as (status in ('available', 'read_only')) stored;

create function platform.set_module_status(
  p_module_key text,
  p_status text,
  p_message text,
  p_reason text
)
returns platform.modules
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_row platform.modules;
  v_prev_status text;
  v_prev_message text;
  v_new_message text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change a module''s platform-wide status.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change a module''s platform-wide status.';
  end if;
  if p_status not in ('available', 'read_only', 'maintenance', 'disabled') then
    raise exception 'Unknown module status: %', p_status;
  end if;

  select status, customer_facing_message into v_prev_status, v_prev_message
  from platform.modules
  where module_key = p_module_key
  for update;

  if not found then
    raise exception 'Unknown module key: %', p_module_key;
  end if;

  v_new_message := nullif(btrim(coalesce(p_message, '')), '');

  update platform.modules
  set status = p_status,
      customer_facing_message = v_new_message,
      updated_by = auth.uid(),
      updated_at = now()
  where module_key = p_module_key
  returning * into v_row;

  insert into platform.module_status_events
    (module_key, previous_status, new_status, previous_message, new_message, reason, performed_by)
  values
    (p_module_key, v_prev_status, p_status, v_prev_message, v_new_message, btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.set_module_status(text, text, text, text) from public, anon;
grant execute on function platform.set_module_status(text, text, text, text) to authenticated;

-- PLATFORM-P0-07.2's own RPC, kept as a thin wrapper -- see this migration's own header
-- comment for why (one real mutation path, a second entry point into it, per the user's own
-- "reuse platform.set_module_enabled() (or a thin wrapper around the same audited
-- mechanism)" instruction). `language sql` (not plpgsql) since it is genuinely just a single
-- delegating call -- no branching of its own beyond the ternary already expressed as a CASE.
create or replace function platform.set_module_enabled(p_module_key text, p_enabled boolean, p_reason text)
returns platform.modules
language sql
security definer
set search_path = platform
as $$
  select platform.set_module_status(
    p_module_key,
    case when p_enabled then 'available' else 'disabled' end,
    (select customer_facing_message from platform.modules where module_key = p_module_key),
    p_reason
  );
$$;
