-- Avatar uploads (profile settings page). Public bucket -- avatar URLs are rendered
-- directly as <img src> everywhere a user's avatar shows (topbar, user menu), same as a
-- Google OAuth avatar_url already is; nothing in an avatar image is sensitive. Writes are
-- restricted to the owning user via their uid as the first path segment
-- (avatars/<user_id>/<filename>), enforced the same way every other table's RLS is:
-- through auth.uid(), never trusted from the client. Platform-wide (auth.users), not
-- owned by any module schema.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own avatar"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
