-- COMPLY-P0-07.6 (Return Lock): "Approved/filed periods are protected from silent
-- alteration." This run's own instructions are explicit that this must be a REAL
-- protection, not a UI hint -- so this is a `before update` trigger on
-- `gst.return_periods` itself, which fires for every UPDATE regardless of role (including
-- `service_role`, which bypasses RLS but never bypasses a trigger) -- genuinely tamper-
-- proof against a bug in application code, a direct SQL/admin-client write, or a future
-- migration that forgets this rule, not just something `lib/returns/lifecycle/
-- mutations.ts`'s own callers happen to respect today.
--
-- **What is protected, precisely** (deny-by-name, not deny-by-default -- see below for why
-- that matters for COMPLY-P0-07.7's own future columns):
--   1. Once a period's OLD status is 'approved' or 'filed', its own defining content --
--      `business_id`, `return_type`, `period_start`, `period_end`, `snapshot`, and
--      `created_at` -- can never change. This is the return that was actually reviewed and
--      signed off; silently editing it after the fact (even to "fix" it) would defeat the
--      entire point of COMPLY-P0-07.5's own review workflow. Anyone who genuinely needs a
--      different figure must go through a NEW period/version, not an edit to this one --
--      this story does not build that path (no "supersede an approved period" mechanism
--      exists yet); flagged as a real, deliberately out-of-scope gap, not solved here.
--   2. Once 'approved', `status` may only ever advance to 'filed' -- never back to
--      'draft'/'validated'/'in_review' (matching `lib/returns/lifecycle/transitions.ts`'s
--      own forward-only state machine, now also enforced at the database layer, not just
--      trusted from the application) and never to anything else.
--   3. Once 'filed', `status` can never change again at all -- 'filed' is this pipeline's
--      own terminal stage (`nextStatus('filed') === null`).
-- `status_history` is deliberately NOT protected -- appending a new entry (e.g. the
-- 'filed' transition's own history entry, or a future COMPLY-P0-07.7 "payment recorded"
-- entry) must keep working even on an approved/filed row; only the row's own COMPUTED
-- CONTENT and its terminal status are locked, never its own append-only audit trail.
--
-- **Deliberately deny-by-name, not "lock every column once approved/filed"**: this
-- trigger only names the columns that exist TODAY. COMPLY-P0-07.7 ("Filing/Payment
-- Status") will need to record an ARN/payment reference/government-response metadata onto
-- an already-'filed' period -- a hard "no update at all once filed" rule would foreclose
-- that story before it's even been designed, which is exactly the kind of implicit
-- future-story decision backlog rule 5 warns against making here. Whatever columns that
-- story adds are untouched by this trigger unless THAT story's own migration explicitly
-- adds them to the check below (a deliberate, visible decision at that point, not an
-- accidental gap now).

create function gst.enforce_return_period_lock()
returns trigger language plpgsql as $$
begin
  if old.status in ('approved', 'filed') then
    if new.business_id is distinct from old.business_id
      or new.return_type is distinct from old.return_type
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.snapshot is distinct from old.snapshot
      or new.created_at is distinct from old.created_at
    then
      raise exception 'This return period is already % -- its own business/return type/period/snapshot can never be altered once approved. Prepare a new period instead.', old.status;
    end if;
  end if;

  if old.status = 'approved' and new.status is distinct from 'approved' and new.status is distinct from 'filed' then
    raise exception 'An approved return period can only advance to "filed" -- it cannot move to "%".', new.status;
  end if;

  if old.status = 'filed' and new.status is distinct from 'filed' then
    raise exception 'A filed return period''s status can never change -- "filed" is this pipeline''s own terminal stage.';
  end if;

  return new;
end;
$$;

comment on function gst.enforce_return_period_lock() is
  'COMPLY-P0-07.6: locks an approved/filed gst.return_periods row''s own defining content '
  'and terminal status. Fires for every role, RLS bypass included -- a real, DB-level '
  'guard, not an application-layer convention.';

create trigger return_periods_enforce_lock
  before update on gst.return_periods
  for each row execute function gst.enforce_return_period_lock();
