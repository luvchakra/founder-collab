-- CRM-07.10 (WonderArc CRM backlog): "WhatsApp Click-to-Chat Link" -- a business-owned
-- entry point (a `wa.me` link with a pre-filled message) that attributes the resulting
-- conversation back to a product/source/campaign. Meta's click-to-chat links carry no
-- structured metadata of their own -- only a pre-filled text field -- so attribution is
-- encoded as a short `[ref:CODE]` tag appended to that pre-filled text, parsed back out
-- of the first inbound message on the CRM-07.3 ingest path and matched against this
-- table's `ref_code`. The resulting match is written onto the *interaction's* own
-- `metadata` jsonb column, not onto `crm.lead` -- `crm.lead.source_module`/
-- `source_reference` are already claimed by CRM-07.11's own `(business_id,
-- source_module='whatsapp', source_reference=<externalActorId>)` dedup key, and reusing
-- those columns for a second, incompatible meaning would break that guarantee.
create table crm.click_to_chat_link (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  label text not null,
  -- The dialable WhatsApp number the `wa.me` link opens a chat with, in international
  -- format without a leading `+` (the format `wa.me/<number>` itself expects). Entered
  -- directly rather than looked up from the connected `channel_connection` -- that row's
  -- `external_account_id` is Meta's internal `phone_number_id`, not the public dialable
  -- number, and fetching the latter would mean a new Graph API field lookup this story
  -- doesn't otherwise need; the founder already knows their own public WhatsApp number.
  whatsapp_number text not null,
  -- Short, URL-safe code embedded in the pre-filled message as `[ref:CODE]` -- unique
  -- per business so a founder can reuse a human-friendly label across links without
  -- the ref code colliding.
  ref_code text not null,
  -- Free-text product/source/campaign attribution (the story's own wording) -- a plain
  -- field rather than a `core.items` FK + picker UI: nothing in this story's own scope
  -- calls for a structured product link, and a founder typing "Spring sale - blue mugs"
  -- covers product, source, and campaign in one field without half-building a picker
  -- this story doesn't otherwise need.
  campaign text,
  prefilled_message text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, ref_code)
);

create index click_to_chat_link_business_id_idx on crm.click_to_chat_link (business_id);

-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table.
alter table crm.click_to_chat_link enable row level security;

create policy "members can view click_to_chat_link in their licensed businesses"
  on crm.click_to_chat_link for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "members can create click_to_chat_link in their licensed businesses"
  on crm.click_to_chat_link for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can update click_to_chat_link in their licensed businesses"
  on crm.click_to_chat_link for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can delete click_to_chat_link in their licensed businesses"
  on crm.click_to_chat_link for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.click_to_chat_link to authenticated, service_role;
