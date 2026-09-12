-- PLATFORM-P0-05.2/05.3 (Entitlement Precedence / Evaluation,
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §9): a live permission gap found while
-- building `hasFeature()`/`getLimit()` (proactively checked for, per this run's own task
-- brief -- the same class of bug PLATFORM-P0-03.4 found: a live RLS policy that's
-- silently wrong, not merely incomplete).
--
-- Every plan-catalog table built in §8 (platform.plans, platform.plan_modules,
-- platform.features, platform.plan_features, platform.plan_limits) has a SELECT policy
-- scoped to `platform.is_superadmin()` only -- correct for that section's own story (a
-- superadmin managing the catalog through /platform/plans), but wrong for THIS section:
-- the Entitlement Engine's whole point is answering "is this business entitled to X" for
-- an ordinary signed-in business member, e.g. a module's own mutation calling
-- `hasFeature()` on behalf of whichever user is using the app right now. Confirmed
-- directly (not assumed): every sibling `test-platform-plan-*-rls.mjs` script already
-- proves a non-superadmin business member gets 0 rows back from these tables today. Left
-- as-is, `hasFeature()`/`getLimit()` would silently and incorrectly report "not entitled"
-- for every real business user, every time, regardless of their actual plan -- exactly the
-- "fabricated/wrong data presented as real" failure mode this backlog's own repeated "no
-- fabricated data" stance already rules out elsewhere (PLATFORM-P0-02.1's honest MRR/ARR
-- "--", PLATFORM-P0-04.5's empty plan_limits seed).
--
-- The fix: these five tables' catalog *contents* are not sensitive tenant data -- they
-- describe what a Free/Pro/Max plan includes, the commercial-catalog equivalent of a
-- public pricing page, not a specific business's own private information. So SELECT
-- widens to any authenticated user (replacing the superadmin-only SELECT policy with an
-- open one); INSERT/UPDATE/DELETE stay exactly as superadmin-only as every sibling
-- migration in §8 already left them -- this migration touches no write policy at all.
-- This is the same "read is open, write stays gated" shape `core.modules`' own "the
-- module catalogue is readable by any authenticated user" policy (Epic 2, C-3) already
-- established for an analogous non-sensitive, platform-wide catalog table.

drop policy "superadmins can view plans" on platform.plans;
create policy "authenticated users can view the plan catalog" on platform.plans for select to authenticated
  using (true);

drop policy "superadmins can view plan modules" on platform.plan_modules;
create policy "authenticated users can view plan module entitlements" on platform.plan_modules for select to authenticated
  using (true);

drop policy "superadmins can view features" on platform.features;
create policy "authenticated users can view the feature catalog" on platform.features for select to authenticated
  using (true);

drop policy "superadmins can view plan features" on platform.plan_features;
create policy "authenticated users can view plan feature entitlements" on platform.plan_features for select to authenticated
  using (true);

drop policy "superadmins can view plan limits" on platform.plan_limits;
create policy "authenticated users can view plan limits" on platform.plan_limits for select to authenticated
  using (true);
