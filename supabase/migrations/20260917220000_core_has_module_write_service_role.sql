-- Lets a system context check the write half of a licence.
--
-- `core.has_module_write()` (C-3, ADR-9) is the licence check that distinguishes "still
-- licensed" from "cancelled and in its 30-day read-only grace period" -- during the
-- grace period the data is readable but nothing new may be written. It is granted to
-- `authenticated` only, which is right for every UI path, but Finance's automatic posting
-- runs from the domain-event drain, where there is no session and therefore no
-- `authenticated` role.
--
-- The drain's own gate (`required_module` + `core.has_module()`) is the looser of the
-- two: it parks an event for a business with no licence at all, but would let one
-- through during a read-only grace period, where posting a journal entry would be
-- exactly the write ADR-9 says must not happen.
--
-- Purely additive, and the same precedent `core.has_module()` already set for the API
-- layer (20260907210000): the function's body has no `auth.uid()`/session dependency to
-- begin with, so this changes only who may call it, never what it returns.

grant execute on function core.has_module_write(uuid, text) to service_role;
