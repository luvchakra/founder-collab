-- CRM-07.8: "WhatsApp Template Catalog" -- a small local registry of the business's own
-- already-Meta-approved templates (name + language + how many `{{n}}` variables it takes)
-- so a human can pick one to send without leaving the app. This table is deliberately not
-- a mirror of Meta's own template-approval workflow (submitting/approving new templates
-- via the Graph API is a real, separate feature this story doesn't build) -- it only
-- records templates that already exist and are approved on Meta's side, for local lookup
-- and variable-count validation before sending.
create table crm.whatsapp_template (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  language_code text not null,
  variable_count integer not null default 0 check (variable_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name, language_code)
);

create index whatsapp_template_business_id_idx on crm.whatsapp_template (business_id);

create trigger whatsapp_template_set_updated_at
  before update on crm.whatsapp_template
  for each row execute function core.set_updated_at();

-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table.
alter table crm.whatsapp_template enable row level security;

create policy "members can view whatsapp_template in their licensed businesses"
  on crm.whatsapp_template for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );

create policy "members can create whatsapp_template in their licensed businesses"
  on crm.whatsapp_template for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

create policy "members can update whatsapp_template in their licensed businesses"
  on crm.whatsapp_template for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

create policy "members can delete whatsapp_template in their licensed businesses"
  on crm.whatsapp_template for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.whatsapp_template to authenticated, service_role;
