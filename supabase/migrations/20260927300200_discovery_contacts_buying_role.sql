-- DISC-OFFER-P1-04.3 "Offering-Specific Contact Relevance": "the same person can have
-- different roles for different offerings; the relevance model must be offering-specific."
--
-- Entity-ownership check (00-MASTER-PLAN.md §5): `discovery.contacts` is already the
-- offering-scoped person record -- one row per person per offering workspace, so the same
-- real person tracked under two offerings is two rows. Until now their role was only ever
-- DERIVED (a buyer persona matched on job title, DISC-OFFER-P0-06.2/06.3), so one title
-- always produced the same kind of answer; a founder had no way to record "decision maker
-- for Managed IAM, only a user of IAM Training". This column is that record, on the
-- offering-scoped row, never on a shared person/party.
--
-- Vocabulary: the buyer-persona `role_in_committee` values (20260911003900) so the two
-- read as one language, plus `not_involved` -- a founder's explicit "this person has no
-- part in buying THIS offering", which a persona cannot express. Nullable: no role set
-- means relevance is derived as before.
alter table discovery.contacts
  add column buying_role text check (
    buying_role is null
    or buying_role in ('executive_buyer', 'decision_maker', 'influencer', 'budget_stakeholder', 'user', 'other', 'not_involved')
  );
