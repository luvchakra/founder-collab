-- Supabase advisor "multiple_permissive_policies" (NEXT-ACTIVITIES.md §3, "Supabase
-- advisor findings" row): core.user_profiles had two separate permissive SELECT
-- policies ("users can view their own profile" and "co-members can view each other's
-- profile", both from 20260906095000_core_business_settings_profiles.sql), so Postgres
-- evaluates both on every SELECT instead of one -- pure performance overhead, RLS ORs
-- permissive policies together so the visible rows were already the union of both.
-- Merged into one policy with the same two conditions OR'd together; not editing the
-- original migration (this session's own established convention: a corrective follow-up
-- migration, not a rewrite of an already-applied one).
--
-- The "own profile" branch is still needed on its own, not just implied by the
-- co-member branch: a user with a profile row who isn't a member of any business yet
-- (freshly signed up, before creating/joining one) would otherwise see nothing.
drop policy if exists "co-members can view each other's profile" on core.user_profiles;
drop policy if exists "users can view their own profile" on core.user_profiles;

create policy "users can view own or co-member profiles"
  on core.user_profiles for select
  using (
    id = (select auth.uid())
    or id in (
      select bm2.user_id from core.business_members bm1
      join core.business_members bm2 on bm2.business_id = bm1.business_id
      where bm1.user_id = (select auth.uid())
    )
  );
