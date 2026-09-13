-- Fix a brand-name typo: the platform was named "WonderArk" (matching the actual logo
-- artwork), but platform.branding.platform_name's default and the seeded singleton row
-- were both created with the misspelling "WonderArc". Historical migration
-- 20260911010000_platform_branding.sql is left as applied history; this corrects the
-- default going forward and repairs the one row that was ever seeded with the typo (a
-- plain no-op update everywhere the value has already been changed by an admin).
alter table platform.branding alter column platform_name set default 'WonderArk';

update platform.branding
set platform_name = 'WonderArk'
where platform_name = 'WonderArc';
