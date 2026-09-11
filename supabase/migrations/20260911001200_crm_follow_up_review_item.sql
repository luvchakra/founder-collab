-- CRM-08.7 (WonderArc CRM backlog, Epic CRM-08): "Review Recovery Task" -- a review
-- almost never carries a party_id (CRM-08.5's own design: no phone/email to match on),
-- so crm.activity's "attached to something" check (party_id/lead_id/opportunity_id/
-- conversation_id) can never be satisfied for a review-triggered task in the common
-- case. crm.follow_up has no such constraint, so a new nullable review_item_id column
-- there -- rather than forcing a fake party/conversation just to satisfy activity's
-- check, or adding review_item to that check's own list for a case it was never meant
-- to cover -- is the minimal correct home for "a task about this review."
alter table crm.follow_up add column review_item_id uuid references crm.review_item (id) on delete cascade;

-- Idempotent rule application: applyReviewRecoveryRules() (lib/reviews/recovery-
-- rules.ts) runs against every synced review, including ones already seen on a prior
-- sync -- this is what makes a second run a no-op instead of a duplicate task.
create unique index follow_up_review_item_id_uq on crm.follow_up (business_id, review_item_id) where review_item_id is not null;

-- The unique index above leads with business_id, not review_item_id, so it doesn't
-- cover a plain FK lookup/cascade-delete by review_item_id alone -- a separate index,
-- same as every other FK column on this table (follow_up_activity_id_idx et al) already
-- has one.
create index follow_up_review_item_id_idx on crm.follow_up (review_item_id);

create function crm.enforce_review_item_business_id(p_review_item_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.review_item where id = p_review_item_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'review_item_id % does not belong to business_id %', p_review_item_id, p_business_id;
  end if;
end; $$;

-- Same function crm.follow_up's own before-insert-or-update trigger already calls --
-- create or replace in place, adding the one new check, rather than a second trigger.
create or replace function crm.enforce_follow_up_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.activity_id is not null then perform crm.enforce_activity_business_id(new.activity_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  if new.review_item_id is not null then perform crm.enforce_review_item_business_id(new.review_item_id, new.business_id); end if;
  return new;
end; $$;
