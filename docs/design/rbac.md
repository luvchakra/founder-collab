# Multi-user / multi-business RBAC — design and decisions

Implements `docs/plan/15-MULTI-USER-RBAC-BACKLOG.md` (RBAC-01..38). This records what
RBAC-01 found, the decisions taken on top of the spec, and where each rule is enforced.

## What was there (RBAC-01)

- **Tenancy was account-based.** `core.user_business_ids()` returned every business of
  every account the user belonged to; `core.businesses` visibility was account-based too.
  `core.business_members` held a role per business, but only `core.has_permission()` read it.
- **Roles were fixed strings** (`owner`, `admin`, `inventory_manager`, … `viewer`) with a
  global `core.role_permissions` table. No custom roles, no membership status, no invitations.
- **Module RLS** was `tenant AND licensed` via `core.licensed_business_ids(module)` /
  `core.write_licensed_business_ids(module)` in ~450 policies; 129 GST policies also
  called `core.has_permission()`.
- **Direct membership writes** were allowed: a member could insert their own membership row
  with any role.
- In production every account member and every business member was an owner.

## Model

```text
auth.users ─ core.business_members (business_id, user_id, role_id, status)
                      │
                      ▼
               core.roles (business_id null = system role; else a business's custom role)
                      │
                      ▼
        core.role_permission_grants ─► core.permissions (one catalogue)
Business ─ core.licenses ─► module access
```

- **Membership decides access.** `user_business_ids()` = active memberships, plus every
  business of an account the user owns or administers (unchanged for every existing user).
  Suspended and removed members see nothing; their rows and history stay.
- **One role per membership** (§7). `role_id` is authoritative; the legacy `role` text is
  kept in sync by trigger (`custom` for custom roles) so existing readers keep working.
- **Owner holds every permission**, including keys added later. Admin holds everything
  except billing changes and ownership (billing is granted per business, §33).
- **Permissions stay keyed by existing names**; new keys were added only where no
  equivalent existed (`business.*`, `members.*`, `billing.*`, `<module>.view`/`export`,
  `funding.data_room.*`).

## Enforcement, layer by layer

| Rule | Where |
|---|---|
| Who is in the business, with which role | `core.current_role_id()`, `core.has_business_permission()`, `core.effective_permissions()`; `core.has_permission()` keeps its signature and now resolves through them |
| Module data: tenant AND licensed AND permission | `core.licensed_business_ids()` / `write_licensed_business_ids()` — see the decision below |
| Shared core data (parties, documents, …) read-only for read-only roles | `core.user_write_business_ids()` in every core write policy (`20260926150200`) |
| Privilege ceiling, last owner, self-elevation | `core.can_assign_role()`, `core.can_grant_permissions()`, trigger `guard_last_owner`, the member/role functions in `20260926150100` |
| No direct membership writes | only the creator's first owner row may be inserted directly; everything else goes through SECURITY DEFINER functions |
| Route guard | `packages/core/src/db/middleware.ts`: licence, then the module's view permission (`no_permission` page, distinct from "not in your plan") |
| Navigation | `apps/web/app/(dashboard)/layout.tsx`: licensed AND view permission, from `core.my_business_access()` in one query |
| Server actions | existing `requirePermission()`; new `requireModulePermission()` (licence + permission, distinct errors) |
| Exports | `runBusinessExport()` requires the family's export permission (`discovery.export`, `crm.export`, …) |
| Billing | `billing.subscription.change` to buy/change/cancel; `billing.view` to see payments (RLS) |
| Data Room | upload/remove needs `funding.data_room.manage`; sharing needs `funding.data_room.share` |

## Decision: module-level RLS for operational roles

The spec asks module tables to enforce `tenant AND licensed AND permission`. Modules call
each other's contracts **with the signed-in user's session** (an Inventory invoice records
its GST tax determination; CRM reads stock; FSM reads tax rules). Requiring each module's
own view/write permission in RLS would make those flows fail for any role that isn't
granted every module — a sales manager could no longer create an invoice.

So the database enforces:

- **Read-only roles** (Viewer, or any custom role with only view/export permissions) see
  exactly the modules they may view, and can write nothing — module or core.
- **Operational roles** (any write permission) can reach licensed module data at the
  database level; *which action in which module* is enforced per action by
  `requirePermission()` / `requireModulePermission()`, the route guard and navigation, and
  the `has_permission()` checks already inside module policies and triggers.
- Cross-business isolation is always database-enforced: permissions are evaluated per
  business, so an admin in A who is a viewer in B is a viewer in B.

Tightening this further means moving cross-module contract writes to SECURITY DEFINER
functions module by module, a follow-up rather than something to change under every
module at once.

## Invitations

- 32 random bytes, sent once by email, stored as SHA-256 only; 7-day expiry; single use;
  re-inviting the same email revokes the previous link; rate-limited per business and
  inviter; bound to the invited email (another signed-in account can't read or accept it).
- Signed-out invitees: `/invite/<token>` → sign in or sign up, the token rides in a
  one-day httpOnly cookie, and `/dashboard` / `/onboarding` bring them back to accept.
  A new user still gets their own (empty) account; accepting adds only the invited
  business.

## Tests

- `scripts/test-core-rbac-rls.mjs` — the §55 matrix in the database (owner/admin/viewer/
  custom, no membership, suspended/removed, licence × permission, cross-business, ceiling,
  self-change, direct writes, invitations, last owner, ownership transfer).
- Existing RLS suites updated where a viewer previously could write.
- Unit tests for the service layer, export permission and route-level behaviour.

## Known follow-ups

- Discovery's own tables are still tenant-only in RLS (§37: Discovery is not
  restructured); Discovery pages are gated by `discovery.view` through the route guard and
  navigation.
- Export buttons are not yet hidden for users without the export permission (the server
  refuses them).
- `test-gst-tax-rules-rls.mjs` already failed on `main` before this work (unrelated
  uniqueness assertion).
