-- DISC-OFFER-P1-01.1 "Scheduled Offering Re-Discovery" -- the doc's own worked example
-- ("Last discovery: Today, 10:30 / Next discovery: Tomorrow / [Run Now]") needs a
-- per-offering cadence and the resulting due-date. `discovery.workspaces` is 1:1 with an
-- offering (01.1's own product<->workspace mapping), so this is a plain pair of columns
-- on that existing table, not a new one -- checked the entity ownership map
-- (docs/plan/00-MASTER-PLAN.md §5) first, which has no "schedule"/"recurrence" concept
-- listed at all, confirming this is genuinely new rather than a parallel of something
-- already there.
--
-- "Last discovery" is deliberately NOT a column here -- it's derived from
-- `discovery.pipeline_runs` (DISC-OFFER-P0-14.1, already the authoritative record of
-- every completed walk through the pipeline) via the new `getLastCompletedPipelineRun`
-- query, the same "don't store what's already derivable" discipline 14.1's own
-- migration already applied to "AI provider/model"/"stages executed".
--
-- `rediscovery_interval` is a closed three-value vocabulary (`off`/`daily`/`weekly`), not
-- an open-ended cron expression or arbitrary integer -- the doc's own mockup shows a
-- single human cadence, not a scheduling DSL, and a closed enum matches every other
-- "which of a few known things" field this schema already uses
-- (`pipeline_runs.trigger`, `icp_profile_versions.source`). `next_discovery_at` is
-- nullable and null by default: a workspace with scheduling off (the default for every
-- existing and new offering alike) genuinely has nothing "next" to show -- "no false
-- precision", the same reasoning DISC-OFFER-P0-05.2/05.5/13.1 already apply to a
-- genuinely absent (not merely zero) value.
alter table discovery.workspaces
  add column rediscovery_interval text not null default 'off'
    check (rediscovery_interval in ('off', 'daily', 'weekly')),
  add column next_discovery_at timestamptz;
