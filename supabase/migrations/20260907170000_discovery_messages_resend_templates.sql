-- Lets a founder generate an outreach email from one of their Resend account's
-- templates (resend.com/docs/dashboard/templates) instead of free-form AI copy.
-- Resend templates live in the Resend account itself, not this database -- these
-- columns only remember *which* template + variable values a given message used, so
-- lib/messages/send.ts can send via Resend's `template: { id, variables }` API instead
-- of raw html/text, and the founder can review/edit the filled-in variables before
-- sending. Both null for a free-form (non-templated) message -- the existing, unchanged
-- default path.
alter table discovery.messages
  add column resend_template_id text,
  add column resend_template_name text,
  add column template_variables jsonb;
