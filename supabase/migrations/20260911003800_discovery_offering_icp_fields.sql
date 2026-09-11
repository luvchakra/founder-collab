-- DISC-OFFER-P0-02.2: "Offering ICP Builder" -- discovery.icp_profiles already supports
-- most of the field list (industries, company_sizes, geographies, roles, pain_points,
-- exclusions) plus one extra the backlog doesn't ask for (buying_signals, left alone --
-- used elsewhere in scoring/discovery). Purely additive: five new array columns for the
-- fields it was missing, same "text[] not null default '{}'" shape as every existing
-- list field on this table, so no existing row needs backfilling to satisfy a new
-- not-null constraint.
alter table discovery.icp_profiles
  add column revenue text[] not null default '{}',
  add column business_model text[] not null default '{}',
  add column technology text[] not null default '{}',
  add column growth_stage text[] not null default '{}',
  add column existing_tools text[] not null default '{}';
