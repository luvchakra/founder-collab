-- PLATFORM-P0-03.3: "Platform Login Branding" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §7). Extends the singleton `platform.branding` row (PLATFORM-P0-03.1) with the fields
-- this sub-story adds beyond what 03.1 already covers:
--
--   logo               -> already `logo_url` (03.1) -- the login page reuses the one
--                          platform logo rather than a second, separate logo column.
--   headline           -> already `login_headline` (03.1)
--   support text       -> already `login_support_text` (03.1)
--   background treatment -> login_background_style + login_background_value (new)
--   legal links        -> login_terms_url + login_privacy_url (new)
--
-- "Legal links" is deliberately scoped to Terms + Privacy here (the two links essentially
-- every login screen shows) rather than a fully dynamic, arbitrary-length link list --
-- PLATFORM-P1-09.3 ("Legal Link Management") is the later, P1 story that generalizes this
-- into Terms/Privacy/Cookie Policy/DPA/Support with version tracking. Building that general
-- mechanism now, for a P0 story that only asks for "legal links" on one screen, would be
-- speculative ahead of its own turn (CLAUDE.md development principle #7).
--
-- login_background_style/value: a small closed vocabulary (not arbitrary CSS -- PLATFORM-
-- P0-03.2's own "do not allow arbitrary CSS injection through the admin UI" instruction
-- applies just as much here even though 03.2 itself is deferred). The check constraint
-- validates the *value* against the *style* in the same row -- e.g. 'image' requires an
-- http(s) URL, 'solid' requires one hex color, 'gradient' requires two comma-separated hex
-- colors -- so a malformed pairing can never be stored, not just rejected by the app's own
-- Zod schema (defense in depth, same as every other column here).
alter table platform.branding
  add column login_background_style text not null default 'gradient'
    check (login_background_style in ('gradient', 'solid', 'image')),
  add column login_background_value text
    check (
      login_background_value is null
      or (login_background_style = 'image' and login_background_value ~ '^https?://')
      or (login_background_style = 'solid' and login_background_value ~ '^#[0-9a-fA-F]{6}$')
      or (login_background_style = 'gradient'
          and login_background_value ~ '^#[0-9a-fA-F]{6},#[0-9a-fA-F]{6}$')
    ),
  add column login_terms_url text
    check (login_terms_url is null or login_terms_url ~ '^https?://'),
  add column login_privacy_url text
    check (login_privacy_url is null or login_privacy_url ~ '^https?://');

comment on column platform.branding.login_background_style is
  'Closed vocabulary (gradient|solid|image) -- never arbitrary CSS, per PLATFORM-P0-03.2''s '
  'no-CSS-injection rule.';
comment on column platform.branding.login_background_value is
  'Interpreted per login_background_style: image -> http(s) URL, solid -> one #hex color, '
  'gradient -> two comma-separated #hex colors ("from,to"). Null means "use the platform''s '
  'existing default login look, unchanged".';

-- No RLS/grant changes needed: the existing `select`/`update` policies (is_superadmin())
-- already cover these new columns since Postgres RLS is row-level, not column-level.
-- The *public*, unauthenticated login screen reads a narrow subset of this row through a
-- separate service-role-backed function (packages/core/src/admin/platform-branding.ts's
-- getPublicLoginBranding()), not through this RLS path -- see that function's own docstring
-- for why (the row must be readable pre-login, but nothing in it is secret: no keys, no
-- credentials, just display copy/colors/URLs).
