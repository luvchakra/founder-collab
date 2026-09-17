-- Per-business logo, shown wherever a business identifies itself in the UI (today: the
-- topbar business switcher). Lives on core.businesses alongside the rest of the
-- business's own profile (name/description/website/industry) rather than on
-- core.business_settings, which holds operational configuration (currency, GSTIN, fiscal
-- year start) instead. Nullable with no default: a business without a logo is the normal
-- case, and the UI falls back to a generic icon.
alter table core.businesses add column if not exists logo_url text;

-- Public bucket, same shape as `avatars` (20260906100000_discovery_schema.sql): reads are
-- public because the stored URL is rendered straight into the app shell on every page,
-- and writes are restricted by the business the object is filed under --
-- business-logos/<business_id>/<filename>. core.user_business_ids() is the same
-- membership predicate core.businesses' own RLS uses, so a user can only write a logo for
-- a business they can already see, and never for another account's.
insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do nothing;

create policy "Business logos are publicly readable"
on storage.objects for select
using (bucket_id = 'business-logos');

create policy "Members can upload their business's logo"
on storage.objects for insert
with check (
  bucket_id = 'business-logos'
  and exists (
    select 1
    from core.user_business_ids() as business_id
    where business_id::text = (storage.foldername(name))[1]
  )
);

create policy "Members can update their business's logo"
on storage.objects for update
using (
  bucket_id = 'business-logos'
  and exists (
    select 1
    from core.user_business_ids() as business_id
    where business_id::text = (storage.foldername(name))[1]
  )
);

create policy "Members can delete their business's logo"
on storage.objects for delete
using (
  bucket_id = 'business-logos'
  and exists (
    select 1
    from core.user_business_ids() as business_id
    where business_id::text = (storage.foldername(name))[1]
  )
);
