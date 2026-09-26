-- RBAC-22 -- billing authorization follows business permissions (docs/plan/15-MULTI-USER-
-- RBAC-BACKLOG.md §33). Payments were visible to the owning account's owners/admins; they
-- are now visible to whoever holds billing.view in that business (owners always; admins
-- by default; a custom Finance role if granted). Subscriptions stay visible to every
-- member -- which plan the business is on is not sensitive.
drop policy "account admins can view their business payments" on platform.billing_payments;
create policy "members with billing.view can view their business payments" on platform.billing_payments
  for select to authenticated using (
    (business_id in (select core.user_business_ids()) and core.has_business_permission(business_id, 'billing.view'))
    or platform.is_superadmin()
  );
