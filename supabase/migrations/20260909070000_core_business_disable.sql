-- Item #17 of a UX pass: an admin option to disable a business without deleting it --
-- a disabled business drops out of the navbar/business switcher (see
-- getAccountWorkspaceEntries()'s own filter) but every row it owns stays exactly where
-- it is, and re-enabling brings it straight back. Nothing else in the schema needs to
-- change: `disabled_at` is checked only at the nav-listing layer, the same way ADR-9's
-- license grace period never deletes data -- this is even less destructive than that,
-- since it isn't tied to billing at all.

alter table core.businesses add column disabled_at timestamptz;
