-- FIN-9 (dimensions, §29). `gst.journal_lines` has carried four optional dimension columns
-- since F1 -- `party_id`, `item_id` (references into the canonical `core.parties`/
-- `core.items`), and free-text `location` and `project_ref` -- but nothing configured them
-- or reported on them. This adds the configuration and the report aggregate.
--
-- Checked docs/plan/00-MASTER-PLAN.md §5 first: the dimensions themselves are not a new
-- entity (they are the columns above, pointing at core rows where they point anywhere);
-- what is new is a per-business switch and display label per dimension, which no module
-- owns yet. `core.custom_field_defs` is per-entity custom data, not a reporting axis over
-- ledger lines, so it is not the home for this.
--
-- NEVER MANDATORY (§29: "do not make every dimension mandatory"): there is deliberately no
-- `required` column. Enabling a dimension only shows its field on the manual journal form
-- and its tab on the dimension report; a line without it is always valid and reports as
-- "Unassigned". Nothing here constrains `gst.journal_lines`.

create table gst.dimension_settings (
  business_id uuid not null references core.businesses (id) on delete cascade,
  dimension_key text not null check (dimension_key in ('party', 'item', 'location', 'project')),
  enabled boolean not null default false,
  -- What this business calls it ("Branch" for location, "Job" for project). Null = the
  -- default name.
  label text check (label is null or (btrim(label) <> '' and length(label) <= 40)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, dimension_key)
);

comment on table gst.dimension_settings is
  'FIN-9: which optional ledger dimensions (party/item/location/project on gst.journal_lines) '
  'a business uses, and what it calls them. Never mandatory -- there is no required flag.';

create trigger dimension_settings_set_updated_at
  before update on gst.dimension_settings
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Report aggregate: journal activity grouped by one dimension's value
-- ---------------------------------------------------------------------------

-- Per (dimension value, account type): debit and credit totals over posted and reversed
-- entries in the period (a reversal carries its original's dimensions, so the pair nets
-- out under the same value). A null value is returned as its own group -- "Unassigned" --
-- so the report always adds up to the whole ledger rather than silently omitting lines
-- nobody tagged. SECURITY INVOKER: RLS on the gst tables (tenant AND licensed) applies.
create function gst.dimension_totals(
  p_business_id uuid,
  p_dimension text,
  p_from date,
  p_to date
)
returns table (
  dimension_value text,
  account_type text,
  debit numeric,
  credit numeric
)
language sql
stable
set search_path = gst
as $$
  select
    case p_dimension
      when 'party' then l.party_id::text
      when 'item' then l.item_id::text
      when 'location' then nullif(btrim(l.location), '')
      when 'project' then nullif(btrim(l.project_ref), '')
    end as value,
    a.type,
    sum(l.debit),
    sum(l.credit)
  from gst.journal_lines l
  join gst.journal_entries e on e.id = l.entry_id
  join gst.accounts a on a.id = l.account_id
  where l.business_id = p_business_id
    and p_dimension in ('party', 'item', 'location', 'project')
    and e.status in ('posted', 'reversed')
    and (p_from is null or e.posting_date >= p_from)
    and (p_to is null or e.posting_date <= p_to)
  group by 1, 2
  order by 1 nulls last, 2;
$$;

revoke all on function gst.dimension_totals(uuid, text, date, date) from public, anon;
grant execute on function gst.dimension_totals(uuid, text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('gst.dimensions.manage', 'gst', 'Choose which reporting dimensions (party, item, location, project) Finance uses and what they are called')
on conflict (key) do nothing;

insert into core.role_permission_grants (role_id, permission_key)
select r.id, 'gst.dimensions.manage'
from core.roles r
where r.business_id is null and r.key in ('owner', 'admin', 'accountant')
on conflict do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'gst.dimensions.manage'),
  ('admin', 'gst.dimensions.manage'),
  ('accountant', 'gst.dimensions.manage')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed; writes need the permission.
-- ---------------------------------------------------------------------------

alter table gst.dimension_settings enable row level security;

create policy "business members can view dimension settings in their licensed businesses"
  on gst.dimension_settings for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "dimension managers can create dimension settings in their licensed businesses"
  on gst.dimension_settings for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.dimensions.manage')
  );

create policy "dimension managers can update dimension settings in their licensed businesses"
  on gst.dimension_settings for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.dimensions.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'gst.dimensions.manage')
  );

-- No delete policy: switching a dimension off is `enabled = false`, which keeps its label.

grant select, insert, update on gst.dimension_settings to authenticated;
grant all on gst.dimension_settings to service_role;
