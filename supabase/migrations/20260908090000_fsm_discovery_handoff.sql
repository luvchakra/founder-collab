-- F-13 (Discovery -> FSM handoff): a second bare/no-FK column alongside the existing
-- `source_prospect_id` (F-1), needed so an opportunity born from a won prospect can link
-- back to it (PRD §6 point 5: "the opportunity shows 'from prospect X'") -- the prospect
-- detail page's own route is `/products/[workspaceId]/prospects/[prospectId]`, so the
-- backlink needs the workspace id too, not just the prospect id. Same "cross-schema
-- reference resolved in application code, not a real FK" reasoning `source_prospect_id`
-- already documents (CLAUDE.md non-negotiable #1: cross-schema FKs point only into
-- `core`; `discovery.workspaces` is not `core`-owned).
alter table fsm.opportunities add column source_workspace_id uuid;
