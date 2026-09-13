-- DISC-OFFER-P1 §7-01.1 "Saved Offering Discovery" (docs/plan/10-DISCOVERY-OFFERING-
-- CENTRIC-BACKLOG.md §7, EPIC DISC-OFFER-P1-01 "Continuous Discovery") -- distinct from
-- the already-built, identically-numbered DISC-OFFER-P1-01.1 "Scheduled Offering
-- Re-Discovery" (§20, `20260912250000_discovery_workspaces_rediscovery_schedule.sql`,
-- `rediscovery_interval`/`next_discovery_at`) -- see
-- docs/design/discovery-offering-backlog-audit.md's own 2026-09-13 entry for the full
-- resolution of that numbering collision. §20's own story already IS the "enable/
-- disable monitoring" toggle this story's own text asks for, and "offering, ICP, plays,
-- signals" are already inherently saved by virtue of already existing per-workspace
-- (one offering = one workspace = one ICP = its own plays/signals, no separate "save"
-- action needed for any of them). The genuinely NEW thing this story needs is the
-- criteria bundle that narrows which future discovery results actually matter: a
-- minimum score floor, and free-text keyword filters for geography/industries/buyer
-- roles/exclusions.
--
-- Lives on `discovery.workspaces` (not a new table) for the same reason
-- `rediscovery_interval`/`next_discovery_at` do: checked the entity-ownership map
-- (docs/plan/00-MASTER-PLAN.md §5) first, found no "criteria"/"monitoring filter"
-- concept listed at all, and a workspace is already the 1:1 offering-scoped row this
-- naturally belongs to.
--
-- Every filter is a free-text keyword array, not a foreign key into a fixed catalog --
-- `discovery.prospects.industry`/`location` are themselves free text (no fixed
-- catalog exists for either), and there is no structured "buyer role" field anywhere
-- in this schema to reference (a buyer persona's own `role` field is a per-workspace,
-- free-text value too -- `discovery.buyer_personas.role`). Matching against free text
-- with free text is honest about what this platform can actually verify; a fixed
-- enum would imply a precision the underlying data doesn't have. All four arrays
-- default to `'{}'` (an empty filter matches everything -- "no criteria set" must never
-- silently exclude every result).
alter table discovery.workspaces
  add column discovery_min_score integer check (discovery_min_score is null or (discovery_min_score >= 0 and discovery_min_score <= 100)),
  add column discovery_geography_filter text[] not null default '{}',
  add column discovery_industries_filter text[] not null default '{}',
  add column discovery_buyer_roles_filter text[] not null default '{}',
  add column discovery_exclusions text[] not null default '{}';
