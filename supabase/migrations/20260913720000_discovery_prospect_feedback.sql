-- DISC-OFFER-P1 §7-02.1 "Prospect Feedback" -- checked `00-MASTER-PLAN.md` §5 and the
-- existing schema first: `discovery.offering_feedback` (DISC-OFFER-P1-04.1) is a
-- different, already-shipped concept -- structured AI-value/user-value corrections on
-- one ICP field, not a founder's own closed-vocabulary tag on a prospect. No overlap, no
-- duplicate.
--
-- The doc's own eleven tags span several things a founder might be reacting to (the
-- prospect itself, the targeting, a message, the response) but the doc names this ONE
-- story "Prospect Feedback" and gives ONE flat closed vocabulary -- not eleven fields or
-- several sub-tables. Modeled literally as written: one append-only tag (plus optional
-- free text) per feedback event, scoped to the prospect. A prospect can accumulate
-- several feedback rows over its lifetime (e.g. "Wrong Timing" early on, "Interested"
-- later) -- same "history of facts, never rewritten" precedent as `discovery.signals`/
-- `offering_feedback` above.
create table discovery.prospect_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  -- The doc's own eleven-item closed vocabulary, verbatim.
  feedback_tag text not null check (
    feedback_tag in (
      'good_prospect', 'bad_prospect', 'wrong_person', 'wrong_timing', 'good_message',
      'bad_message', 'interested', 'not_interested', 'already_customer', 'not_relevant',
      'spam'
    )
  ),
  note text,
  created_at timestamptz not null default now()
);

create index prospect_feedback_workspace_id_idx on discovery.prospect_feedback (workspace_id);
create index prospect_feedback_prospect_id_idx on discovery.prospect_feedback (prospect_id);

alter table discovery.prospect_feedback enable row level security;

-- Select and insert only -- append-only, same as `offering_feedback`/`signals`: a
-- recorded piece of feedback is a fact about what a founder observed at that moment,
-- never edited or deleted after the fact.
create policy "members can view prospect feedback in their workspaces"
  on discovery.prospect_feedback for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create prospect feedback in their workspaces"
  on discovery.prospect_feedback for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
