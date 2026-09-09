-- Fixes a real security gap in the SP-7/S-2 GST credentials tables, documented in
-- docs/testing/EXECUTION-2026-09-08.md finding 3 (from TC-GST-001): `gsp_password`/
-- `client_secret` on both `gst.eway_bill_credentials` and `gst.einvoice_credentials`
-- were stored as plain `text`, protected only by access control (no SELECT grant to
-- `authenticated` at all -- `20260907150000_gst_credentials_schema.sql`'s own comment
-- already flagged this as "the same class of risk as the reveal-service-role-key
-- finding," kept verbatim from upstream rather than fixed at the time). Contrast
-- `discovery.ai_provider_credentials` (BYOK): its own migration comment states plainly
-- that `encrypted_api_key` is application-level AES-256-GCM ciphertext specifically
-- *because* "RLS does not by itself protect a column from application code" -- exactly
-- the guarantee GST's own secrets were missing.
--
-- A plain column rename, not a type change: ciphertext is stored as the same base64
-- `text` the plaintext used to be (packages/core/src/crypto/api-key.ts packs iv +
-- authTag + ciphertext into one base64 string) -- no ALTER TYPE, no backfill needed.
-- Confirmed via Supabase MCP against the dev project before writing this: both tables
-- have zero rows in every environment this session touched, so there is no real secret
-- to re-encrypt -- this is a schema fix, not a data migration (CLAUDE.md's "no data
-- migration" note is about the platform's launch-time promise for demo data in the
-- source repos, which this isn't, but the same zero-existing-rows fact applies here).
--
-- `gsp_username`/`client_id` are deliberately left as plain `text` -- they're
-- identifiers, not secrets, matching BYOK's own convention of only encrypting the
-- actual key material (`encrypted_api_key`), never anything used purely for display or
-- routing.
alter table gst.eway_bill_credentials rename column gsp_password to encrypted_gsp_password;
alter table gst.eway_bill_credentials rename column client_secret to encrypted_client_secret;

alter table gst.einvoice_credentials rename column gsp_password to encrypted_gsp_password;
alter table gst.einvoice_credentials rename column client_secret to encrypted_client_secret;
