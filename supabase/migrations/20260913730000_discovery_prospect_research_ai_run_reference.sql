-- DISC-OFFER-P1 §7-03.2 "Research Cache" -- checked first: every field the doc's own
-- list asks a cache record to carry (source, timestamp, expiry, input/context hash,
-- research version, AI provider/model) already exists somewhere in this schema --
-- `discovery.ai_runs` (operation/provider/model/prompt_version/input_hash/created_at,
-- the same "input_hash + operation + prompt_version + model" cache identity
-- CLAUDE.md's own dev principle #5 and docs/byok-ai-requirements.md §13 already
-- establish) plus `prospect_research.researched_at`/`expires_at` (already written on
-- every research run, `research-prospect.ts`'s own `RESEARCH_TTL_DAYS`). The one real
-- gap: nothing links a specific cached `prospect_research` row back to the exact
-- `ai_runs` row that produced it, so a founder (or this story's own UI) has no way to
-- show which provider/model/version actually generated the research currently on
-- screen -- only the timestamp and expiry.
--
-- Nullable, `on delete set null` -- research from before this column existed, or a
-- future workspace whose `ai_runs` row genuinely gets pruned, must not lose the research
-- itself over a missing audit reference.
alter table discovery.prospect_research
  add column ai_run_id uuid references discovery.ai_runs (id) on delete set null;

create index prospect_research_ai_run_id_idx on discovery.prospect_research (ai_run_id);
