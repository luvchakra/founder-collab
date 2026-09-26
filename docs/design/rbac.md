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
| Module data: tenant AND licensed AND permission | `core.licensed_business_ids()` / `write_licensed_business_ids()` — see "Module RLS" below |
| Shared core data (parties, documents, …) read-only for read-only roles | `core.user_write_business_ids()` in every core write policy (`20260926150200`) |
| Privilege ceiling, last owner, self-elevation | `core.can_assign_role()`, `core.can_grant_permissions()`, trigger `guard_last_owner`, the member/role functions in `20260926150100` |
| No direct membership writes | only the creator's first owner row may be inserted directly; everything else goes through SECURITY DEFINER functions |
| Route guard | `packages/core/src/db/middleware.ts`: licence, then the module's view permission (`no_permission` page, distinct from "not in your plan") |
| Navigation | `apps/web/app/(dashboard)/layout.tsx`: licensed AND view permission, from `core.my_business_access()` in one query |
| Server actions | existing `requirePermission()`; new `requireModulePermission()` (licence + permission, distinct errors) |
| Exports | `runBusinessExport()` requires the family's export permission (`discovery.export`, `crm.export`, …) |
| Billing | `billing.subscription.change` to buy/change/cancel; `billing.view` to see payments (RLS) |
| Data Room | upload/remove needs `funding.data_room.manage`; sharing needs `funding.data_room.share` |

## Module RLS: per-module, with declared hand-offs (RBAC-39)

The first cut of RBAC let any role holding a write permission reach every licensed
module's tables, leaving *which module* to the app's per-action checks. That is not a
security boundary: the Supabase API is public, so a CRM-only role could read or change
Inventory rows with its own session. Since `20260927050000..050400` the database enforces
the module boundary for every role:

| | Rule | Helper |
|---|---|---|
| Read module M | licence active (or in grace) AND (M's view permission OR any permission in M) | `core.licensed_business_ids(M)` |
| Write module M | licence active AND a permission in M beyond view/export (owner always) | `core.write_licensed_business_ids(M)`, `core.has_module_write_permission()` |
| Discovery core tables | read as above; write needs `discovery.manage` (new) | `discovery.readable_*()` / `discovery.writable_*()` |

Discovery's offering-centric tables were tenant-only until now (no licence, no
permission); their policies were rewritten in place to the helpers above.

**Cross-module hand-offs** are the only writes that cross a module boundary. Each is an
additive policy on exactly the tables the hand-off touches, keyed to the permission of the
module that *initiates* it (`core.handoff_business_ids(module, permission, write)`):

| Hand-off | Initiating permission | Target tables |
|---|---|---|
| CRM → Service: FSM quote, assessment, accept quote → job | `crm_opportunities.manage` | `fsm.opportunities` (insert/update/select), `fsm.assessments`, `fsm.jobs` (insert/select) |
| Discovery → Service: won prospect → service opportunity | `discovery.manage` | `fsm.opportunities` (insert/select), `fsm.jobs` (select) |
| Discovery → CRM: promote prospect, log reply, existing-customer check | `discovery.manage` | `crm.lead` (insert/select), `crm.conversation`/`conversation_participant`/`interaction` (insert/update/select), `crm.opportunity` (select) |
| CRM → Discovery: ticket → prospect | `leads.manage` | `discovery.prospects` (insert/select), offerings and workspaces (select) |
| Inventory → Discovery: item mirrored as offering | `inventory.edit` | `discovery.products` (insert/update/select) |
| Service → Inventory: reserve / release / consume parts | `jobs.edit` | `inventory.stock_movements` (insert/select), `inventory.stock_levels` (select) |

Hand-off writes follow the target module's licence (grace is read-only, ADR-9). Every
other cross-module *read* degrades exactly as an unlicensed module does (ADR-10): a
sales manager without `service.view` sees no job history in Customer 360.

Role fixes in the same change: Accountant gains every Finance operation except activation
(it could view Finance but post nothing); `discovery.manage` goes to Admin and Sales
Manager and their templates. Tested in `scripts/test-rbac-module-scoping-rls.mjs`.

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

- A user whose role lacks a module's write permission gets a generic error if they try a
  write the UI still offers (the database refuses it); hiding those controls per permission
  is a UI follow-up.
- Export buttons are not yet hidden for users without the export permission (the server
  refuses them).
- `test-gst-tax-rules-rls.mjs` already failed on `main` before this work (unrelated
  uniqueness assertion).
