-- PLATFORM-P1-05.3 (Tax on Subscription Billing) and PLATFORM-P1-05.4 (Price Versioning),
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §27.
--
-- 05.3 -- WonderArk's own tax on what it charges for subscriptions, kept apart from the
-- tax a customer's business handles in the gst module (gst.* tables): it lives on the
-- platform's own single-row platform.billing_settings, never in a business's compliance
-- data. It describes how the provider prices are set up (e.g. "GST 18%, included") so
-- customers see it next to prices; what the provider actually charges is configured at the
-- provider.
--
-- 05.4 -- a subscription keeps the exact price row it was billed on. plan_prices rows are
-- never deleted (a price change deactivates the old row and inserts a new one, BILL-32), so
-- pinning the row's id keeps the amount, currency and interval a customer signed up for,
-- even after the plan's price changes.

alter table platform.billing_settings
  add column subscription_tax_label text not null default '' check (char_length(subscription_tax_label) <= 20),
  add column subscription_tax_rate numeric(5, 2) not null default 0 check (subscription_tax_rate between 0 and 50),
  add column subscription_prices_include_tax boolean not null default true,
  add constraint billing_settings_tax_label_when_rate check (subscription_tax_rate = 0 or btrim(subscription_tax_label) <> '');

alter table platform.subscriptions add column plan_price_id uuid references platform.plan_prices (id);
create index subscriptions_plan_price_idx on platform.subscriptions (plan_price_id);

create or replace function platform.update_subscription_tax_settings(
  p_label text,
  p_rate numeric,
  p_prices_include_tax boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before platform.billing_settings;
  v_after platform.billing_settings;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select * into v_before from platform.billing_settings where id for update;
  update platform.billing_settings set
    subscription_tax_label = btrim(coalesce(p_label, '')),
    subscription_tax_rate = p_rate,
    subscription_prices_include_tax = p_prices_include_tax,
    updated_at = now(),
    updated_by = auth.uid()
  where id
  returning * into v_after;
  insert into platform.billing_settings_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_before) - 'id', to_jsonb(v_after) - 'id', p_reason, auth.uid());
end;
$$;

revoke execute on function platform.update_subscription_tax_settings(text, numeric, boolean, text) from public, anon;
grant execute on function platform.update_subscription_tax_settings(text, numeric, boolean, text) to authenticated;
