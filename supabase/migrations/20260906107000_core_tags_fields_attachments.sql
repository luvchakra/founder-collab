-- Epic 3, story D-8: core.tags/taggings, core.custom_field_defs/values, core.attachments
-- (00-MASTER-PLAN.md §5). Three independent, cross-module features bundled into one
-- story because all three are Kickserv's "Forms & Fields"/"Tags" settings surface and
-- all three share the same polymorphic shape: a definition/catalog table plus a
-- (entity_type, entity_id) pair pointing at a row in whichever schema actually owns
-- that entity (discovery.prospects, core.parties, a future fsm.jobs, ...).
--
-- That polymorphism is also this story's one real limitation, worth stating plainly:
-- unlike every FK-based cross-tenant check elsewhere in this migration timeline (D-1's
-- enforce_party_business_id and its siblings), nothing here can verify that
-- taggings.taggable_id / custom_field_values.entity_id / attachments.entity_id actually
-- belongs to the tagging/value/attachment's own business_id, because the target table
-- varies per row and isn't knowable at the database level without an entity_type-keyed
-- dispatch this story doesn't build. Callers (module server actions) are responsible for
-- verifying the entity they're tagging/valuing/attaching to is one they can see under
-- RLS before writing the row -- exactly the "never trust a client-supplied id without
-- server-side authorization" principle CLAUDE.md already requires everywhere else.
--
-- core.tags.scope has no CHECK constraint (unlike, say, core.items.kind): Kickserv only
-- names two scopes (work tags on opportunities/jobs, contact tags on customers,
-- 02-FSM-PRD.md §10), but master plan §5 lists every module as a tags consumer, so
-- locking the column to exactly those two values today would block e.g. inventory
-- tagging its own items later for no real benefit -- a text column costs nothing extra.
--
-- core.custom_field_defs.service_type_id is deliberately NOT a foreign key: FSM's own
-- fsm.service_types table doesn't exist yet (F-1 builds it). The column exists now
-- because the backlog explicitly scopes this story as "entity + optional service-type
-- scope"; the FK constraint is F-1's to add once there's something to reference.

create table core.tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  scope text not null,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (business_id, scope, name)
);

create index tags_business_id_idx on core.tags (business_id);

create table core.taggings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  tag_id uuid not null references core.tags (id) on delete cascade,
  taggable_type text not null,
  taggable_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, taggable_type, taggable_id)
);

create index taggings_business_id_idx on core.taggings (business_id);
create index taggings_taggable_idx on core.taggings (taggable_type, taggable_id);

create function core.enforce_tagging_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.tags where id = new.tag_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'tag_id % does not belong to business_id %', new.tag_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger taggings_enforce_business_id
  before insert or update on core.taggings
  for each row execute function core.enforce_tagging_business_id();

create table core.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  entity_type text not null,
  service_type_id uuid,
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  options jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_field_defs_business_id_idx on core.custom_field_defs (business_id);

-- A plain `unique (business_id, entity_type, service_type_id, key)` wouldn't actually
-- stop two global (service_type_id null) defs sharing a key -- a unique index treats
-- every null as distinct from every other null. Split into two indexes instead: one for
-- the "applies to every service type" case, one for a specific service type.
create unique index custom_field_defs_global_key
  on core.custom_field_defs (business_id, entity_type, key)
  where service_type_id is null;
create unique index custom_field_defs_scoped_key
  on core.custom_field_defs (business_id, entity_type, service_type_id, key)
  where service_type_id is not null;

create trigger custom_field_defs_set_updated_at
  before update on core.custom_field_defs
  for each row execute function core.set_updated_at();

create table core.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  field_def_id uuid not null references core.custom_field_defs (id) on delete cascade,
  entity_id uuid not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_def_id, entity_id)
);

create index custom_field_values_business_id_idx on core.custom_field_values (business_id);
create index custom_field_values_entity_id_idx on core.custom_field_values (entity_id);

create trigger custom_field_values_set_updated_at
  before update on core.custom_field_values
  for each row execute function core.set_updated_at();

create function core.enforce_custom_field_value_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.custom_field_defs where id = new.field_def_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'field_def_id % does not belong to business_id %', new.field_def_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger custom_field_values_enforce_business_id
  before insert or update on core.custom_field_values
  for each row execute function core.enforce_custom_field_value_business_id();

create table core.attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  storage_bucket text not null default 'attachments',
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index attachments_business_id_idx on core.attachments (business_id);
create index attachments_entity_idx on core.attachments (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.tags enable row level security;
alter table core.taggings enable row level security;
alter table core.custom_field_defs enable row level security;
alter table core.custom_field_values enable row level security;
alter table core.attachments enable row level security;

create policy "members can view tags in their businesses"
  on core.tags for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create tags in their businesses"
  on core.tags for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update tags in their businesses"
  on core.tags for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete tags in their businesses"
  on core.tags for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view taggings in their businesses"
  on core.taggings for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create taggings in their businesses"
  on core.taggings for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can delete taggings in their businesses"
  on core.taggings for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view custom field defs in their businesses"
  on core.custom_field_defs for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create custom field defs in their businesses"
  on core.custom_field_defs for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update custom field defs in their businesses"
  on core.custom_field_defs for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete custom field defs in their businesses"
  on core.custom_field_defs for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view custom field values in their businesses"
  on core.custom_field_values for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create custom field values in their businesses"
  on core.custom_field_values for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update custom field values in their businesses"
  on core.custom_field_values for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete custom field values in their businesses"
  on core.custom_field_values for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view attachments in their businesses"
  on core.attachments for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create attachments in their businesses"
  on core.attachments for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can delete attachments in their businesses"
  on core.attachments for delete
  using (business_id in (select core.user_business_ids()));

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------

-- Private bucket, path convention <business_id>/<attachment_id>/<filename> -- mirrors
-- discovery's own knowledge-files bucket pattern (20260906100000_discovery_schema.sql).
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "Members can read their businesses' attachments"
on storage.objects for select
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1]::uuid in (select core.user_business_ids())
);

create policy "Members can upload attachments to their businesses"
on storage.objects for insert
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1]::uuid in (select core.user_business_ids())
);

create policy "Members can delete their businesses' attachments"
on storage.objects for delete
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1]::uuid in (select core.user_business_ids())
);
