-- BILL-08 -- a checkout session remembers where it sends the customer (§51, §52).
--
-- A second tab (or a double click) with the same idempotency key must land on the same
-- provider checkout, not create a second one. Stripe's hosted-checkout URL is what that
-- tab needs; it is not a secret (it is the page the customer's own browser opens) and
-- the table is readable only by the member who started the session.
alter table platform.checkout_sessions add column checkout_url text;
-- The reason a session failed, safe to show the customer who started it (§29, §97).
alter table platform.checkout_sessions add column failure_message_safe text;
