# WonderArk — Multi-User / Multi-Business RBAC & Authorization

## 1. Objective

WonderArk must support multiple users accessing the same business with different application-level permissions.

A user may belong to multiple businesses and have a different role in each:

```text
Kunal
├── Meridian HomeTech → Owner
├── Acme Services     → Admin
└── Beta Consulting   → Finance Manager
```

Another user may be:

```text
Priya
├── Meridian HomeTech → Marketing Manager
└── Acme Services     → Viewer
```

The authorization decision must be:

```text
Authenticated user
    ↓
Business membership
    ↓
Business-specific role
    ↓
Role permissions
    ↓
Module license
    ↓
Resource/action rules
    ↓
ALLOW / DENY
```

Membership, role, permission and licensing are separate concepts.

---

# 2. Current repository foundation

The current `main` branch already contains:

- `core.accounts`
- `core.account_members`
- `core.businesses`
- `core.business_members`
- `core.user_profiles`
- `core.permissions`
- `core.role_permissions`
- `core.has_permission()`
- `core.user_admin_business_ids()`
- `core.licenses`
- `core.has_module()`
- `core.has_module_write()`

Current `core.business_members.role` includes:

```text
owner
admin
inventory_manager
procurement_manager
sales_manager
accountant
warehouse_operator
viewer
```

Current permission data is global and role based.

**Implementation rule:** extend this foundation. Do not replace it with a second authorization system and do not rewrite unrelated modules.

---

# 3. Core design

The final model is:

```text
auth.users
   │
   ├── core.user_profiles
   │
   └── core.business_members
            │
            ├── business_id
            ├── user_id
            └── role_id
                    │
                    ▼
              core.roles
                    │
                    ▼
          role_permission_grants
                    │
                    ▼
            core.permissions

Business
   │
   └── core.licenses
            │
            ▼
       Module access
```

A user does NOT have one global application role.

A role is evaluated in the context of the current business.

---

# 4. Required authorization rule

Final authorization:

```text
authenticated
AND member_of_business
AND membership_active
AND module_is_licensed
AND permission_is_granted
AND resource_rule_allows
```

Examples:

```text
Inventory licensed + inventory.view
→ can view Inventory

Inventory licensed + no inventory.edit
→ can view, cannot edit

inventory.edit + Inventory not licensed
→ cannot edit

No membership
→ cannot access business at all
```

The UI must never be the security boundary.

---

# 5. Canonical role model

Introduce a first-class role entity, only if an equivalent does not already exist.

Conceptual:

```sql
core.roles
```

Fields:

```text
id uuid primary key
business_id uuid nullable
key text
name text
description text
role_type text -- system | custom
is_system boolean
is_active boolean
created_at
updated_at
```

Interpretation:

```text
business_id IS NULL
→ system/platform-defined role

business_id IS NOT NULL
→ business-specific custom role
```

System roles preserve the existing roles.

Custom roles include:

```text
Marketing Manager
Finance Manager
Field Technician
Sales Representative
Fundraising Manager
Read Only Finance
```

---

# 6. Membership model

Extend `core.business_members` so the target model is conceptually:

```text
id
business_id
user_id
role_id
status
invited_at
invited_by
joined_at
created_at
updated_at
```

Status:

```text
invited
active
suspended
removed
```

Keep compatibility with the current `role` field during migration if existing consumers still require it.

Existing memberships must continue working without manual recreation.

Required constraint:

```text
unique(business_id, user_id)
```

---

# 7. One primary role per business

Initial release:

```text
one membership = one primary role
```

Do not introduce multi-role union unless required later.

A user can nevertheless have different roles across different businesses.

Example:

```text
User A / Business 1 → Admin
User A / Business 2 → Viewer
User A / Business 3 → Accountant
```

---

# 8. Role permissions

The existing `core.permissions` remains the canonical permission catalogue.

Add a role-ID-based grant table if needed:

```text
core.role_permission_grants
```

```text
role_id
permission_key
created_at
```

Primary key:

```text
(role_id, permission_key)
```

Existing `core.role_permissions` must continue working during migration. Do not break current module authorization.

---

# 9. Permission design

Permissions represent meaningful authorization boundaries, not every visual button.

Examples:

```text
business.view
business.edit
business.settings.manage

members.view
members.invite
members.edit
members.suspend
members.remove
members.roles.assign
members.roles.manage

discovery.view
discovery.products.manage
discovery.prospects.manage
discovery.pipeline.manage
discovery.export

marketing.view
marketing.strategy.manage
marketing.campaigns.manage
marketing.content.manage
marketing.assets.manage
marketing.seo.manage
marketing.analytics.view
marketing.export

funding.view
funding.profile.manage
funding.rounds.manage
funding.investors.manage
funding.outreach.manage
funding.data_room.view
funding.data_room.manage
funding.data_room.share
funding.diligence.manage
funding.analytics.view
funding.export

inventory.view
inventory.view_cost
inventory.edit

service.view
service.jobs.manage
service.schedule.manage

crm.view
crm_opportunities.manage
crm_messages.send

finance.view
finance.journals.manage
finance.invoices.manage
finance.payments.manage
finance.bank.manage
finance.reconciliation.manage
finance.gst.manage
finance.reports.view
finance.reports.export

billing.view
billing.manage
billing.subscription.change
billing.payment.manage
```

Before creating a permission, search `core.permissions` and reuse an existing equivalent.

Never casually rename existing permission keys.

---

# 10. Owner

Owner is the highest business role.

Owner can:

- manage business;
- invite users;
- remove users;
- suspend/reactivate users;
- create/edit/archive custom roles;
- assign roles;
- grant all business permissions;
- manage business settings;
- manage billing when business billing permissions allow it;
- transfer ownership.

Owner cannot grant platform-superadmin privileges or bypass platform security.

The final owner cannot be removed through normal member management.

---

# 11. Admin

Admin can:

- view members;
- invite users;
- assign roles;
- create custom roles;
- edit custom roles;
- suspend/reactivate users;
- manage operational settings for which the admin has permission.

Admin cannot:

- transfer ownership;
- assign owner;
- remove the final owner;
- grant permissions they do not themselves possess;
- elevate themselves.

---

# 12. Privilege ceiling

A user may assign only permissions that they are authorized to grant.

Example:

```text
Admin A has:
inventory.view
inventory.edit
crm.view
```

Admin A can create:

```text
Warehouse Viewer
→ inventory.view
```

but cannot create:

```text
Finance Administrator
→ finance.payments.manage
```

because Admin A does not possess that permission.

Owner may grant any business-level permission.

This rule must be enforced server-side, not only in the UI.

---

# 13. Custom roles

Admin selects:

```text
Settings
→ Users & Access
→ Roles & Permissions
→ Create Role
```

Form:

```text
Role name
Description

Business
[✓] View
[ ] Edit

Marketing
[✓] View
[✓] Campaigns
[✓] Content
[✓] Analytics
[ ] Export

Finance
[ ] View
[ ] Payments

[Cancel] [Create Role]
```

Role permissions must be read from `core.permissions`, not hard-coded separately in the frontend.

---

# 14. Role templates

Provide templates:

```text
Business Admin
Sales Manager
Marketing Manager
Finance Manager
Operations Manager
Field Technician
Accountant
Viewer
```

Templates are copied into the business.

Changing a template later must not silently modify existing custom roles.

System roles cannot be deleted by business administrators.

---

# 15. Role lifecycle

```text
Active
  ↓
Updated
  ↓
Archived
```

Do not hard-delete a role that is assigned to active members.

Preferred behavior:

```text
Archive blocked
→ "Reassign 4 users before archiving this role."
```

---

# 16. User invitation

Add:

```text
Settings
→ Users & Access
→ Users
→ Invite User
```

Form:

```text
Email
Name
Role
Optional message

[Send invitation]
```

Server creates:

```text
core.business_invitations
```

Conceptual fields:

```text
id
business_id
email
invited_name
role_id
invited_by
token_hash
expires_at
accepted_at
revoked_at
status
created_at
```

Statuses:

```text
pending
accepted
expired
revoked
```

Never store a raw invitation token.

---

# 17. Invitation flow

```text
Admin
 ↓
Invite
 ↓
Invitation email
 ↓
Existing user → login → accept
New user → signup → accept
 ↓
Create/activate business membership
 ↓
Assign selected role
 ↓
Audit event
```

An invitation is not an active membership until accepted.

---

# 18. Invitation security

Invitation tokens must be:

- cryptographically random;
- single-use;
- short-lived;
- stored only as a hash;
- invalid after acceptance;
- invalid after revocation;
- invalid after expiry.

Rate-limit invitations by business, actor and email.

Prevent multiple active invitations for the same business/email.

---

# 19. Existing-user vs new-user onboarding

Existing user:

```text
You've been invited to Meridian HomeTech.
Role: Marketing Manager

[Accept invitation]
```

New user:

```text
Create your WonderArk account
        ↓
Invitation detected
        ↓
Review business + role
        ↓
Accept
```

Inspect the existing `core.handle_new_user()` flow carefully. Normal standalone signup must retain current account-owner behavior.

Invitation signup must attach the new identity to the invited business without accidentally granting unrelated business access.

---

# 20. User management UI

Add to existing business settings:

```text
Settings
├── Business
├── Users & Access
│   ├── Users
│   ├── Roles & Permissions
│   └── Invitations
├── Licenses
└── Billing
```

Do not create a separate global user-management subsystem.

---

# 21. Users — desktop

```text
┌─────────────────────────────────────────────────────────────┐
│ Users & Access                              [Invite User]   │
│ Manage people who can access this business.                 │
├─────────────────────────────────────────────────────────────┤
│ Search...        Role ▾        Status ▾                      │
├─────────────────────────────────────────────────────────────┤
│ User          Role                 Status       Actions      │
│──────────────────────────────────────────────────────────────│
│ Kunal         Owner                Active       •••          │
│ Priya         Marketing Manager    Active       •••          │
│ Amit          Accountant           Active       •••          │
│ Rahul         Viewer               Suspended    •••          │
└─────────────────────────────────────────────────────────────┘
```

Actions:

```text
View
Change role
Suspend
Reactivate
Remove
```

---

# 22. Users — mobile

```text
Users & Access

[ + Invite User ]

Search users...

┌────────────────────────────┐
│ Priya Sharma               │
│ Marketing Manager          │
│ ● Active                   │
│                            │
│ [Manage]                   │
└────────────────────────────┘

┌────────────────────────────┐
│ Amit Shah                  │
│ Accountant                 │
│ ● Active                   │
│                            │
│ [Manage]                   │
└────────────────────────────┘
```

Use cards below `md`, consistent with WonderArk UI rules.

---

# 23. User detail

```text
Priya Sharma
priya@example.com

Current business
Meridian HomeTech

Role
Marketing Manager

Status
Active

Permissions
18 granted

Other businesses
• Acme Services — Viewer

[Change role]
[Suspend]
[Remove access]
```

Global identity information is separate from business authorization.

---

# 24. Role assignment UI

```text
Change role

Current role:
Viewer

New role:

○ Business Admin
  Full business management

● Marketing Manager
  Marketing execution and analytics

○ Sales Manager
  Prospects, pipeline and outreach

○ Accountant
  Finance operations

○ Viewer
  Read-only access

[View permissions]

[Cancel] [Confirm]
```

Before saving, show added/removed permissions.

---

# 25. Role permission editor

```text
Marketing Manager

Description
Manage marketing execution.

Discovery
☑ View
☑ Products
☑ Prospects

Marketing
☑ View
☑ Strategy
☑ Campaigns
☑ Content
☑ Assets
☑ SEO
☑ Analytics
☐ Export

Customer Acquisition
☑ View
☑ Prospects
☑ Pipeline

Funding
☐ View

Finance
☐ View

[Cancel] [Save Role]
```

High-risk permissions should be visibly marked.

---

# 26. Roles page

Desktop:

```text
Roles & Permissions                       [Create Role]

Role                  Type       Users      Permissions
--------------------------------------------------------
Owner                 System      1         All
Admin                 System      2         42
Sales Manager         System      4         14
Marketing Manager     Custom      2         18
Accountant            System      1         11
Viewer                System      7          4
```

Mobile uses cards.

---

# 27. Permission matrix

Provide a generated matrix:

```text
                         Owner Admin Sales Accountant Viewer
Users / Invite             ✓     ✓     -       -        -
Roles / Manage             ✓     ✓     -       -        -
Inventory / Edit           ✓     ✓     ✓       -        -
Finance / Edit             ✓     ✓     -       ✓        -
Finance / Payments         ✓     ✓     -       ✓        -
Exports                    ✓     ✓     ✓       ✓        -
```

This must be generated from actual permission records.

---

# 28. Business switcher

Existing business switcher should show role:

```text
Your businesses

Meridian HomeTech
Owner

Acme Services
Admin

Beta Consulting
Viewer
```

Only businesses for which the user has membership may appear.

Switching business changes the authorization context.

---

# 29. URL and server authorization

For:

```text
/business/acme/inventory/products
```

server must verify:

```text
authenticated
AND belongs to Acme
AND inventory licensed
AND inventory.view
```

Never trust a browser-supplied `businessId`.

Never rely on hidden UI buttons for authorization.

---

# 30. Navigation gating

Navigation visibility:

```text
module licensed
AND permission.view
```

Mutation visibility:

```text
operation permission
```

Example:

```text
inventory.view
but not inventory.edit
```

User sees Inventory and records, but not edit controls.

Server still enforces the same rule.

---

# 31. License vs permission messaging

If no license:

```text
Inventory isn't included in your current plan.
[View plans]
```

If licensed but unauthorized:

```text
You don't have permission to access Inventory.
Contact your business administrator.
```

Do not conflate these cases.

---

# 32. Export authorization

Integrate with the universal CSV/Excel export architecture.

Example:

```text
inventory.view
+ no inventory.export
= can view, cannot export
```

Every export endpoint must check authorization server-side.

Do not merely hide Export buttons.

---

# 33. Billing authorization

Introduce/reuse:

```text
billing.view
billing.manage
billing.subscription.change
billing.payment.manage
```

Owner receives business billing authority.

Admin receives only permissions granted by the business policy.

Viewer must not see billing management controls.

---

# 34. Funding / Data Room authorization

Recommended:

```text
funding.data_room.view
funding.data_room.upload
funding.data_room.manage
funding.data_room.share
funding.data_room.download
```

Data-room sharing and download are sensitive actions and must be audited.

---

# 35. Marketing authorization

Recommended:

```text
marketing.view
marketing.strategy.manage
marketing.campaigns.manage
marketing.content.manage
marketing.assets.manage
marketing.seo.manage
marketing.analytics.view
marketing.export
```

---

# 36. Funding authorization

Recommended:

```text
funding.view
funding.profile.manage
funding.readiness.manage
funding.rounds.manage
funding.investors.manage
funding.outreach.manage
funding.data_room.view
funding.data_room.manage
funding.data_room.share
funding.diligence.manage
funding.analytics.view
funding.export
```

---

# 37. Discovery protection

The current Discovery implementation is protected.

Do NOT:

- move Discovery routes;
- rename Discovery routes;
- reorganize existing Discovery menus;
- migrate existing Discovery tables;
- rewrite existing Discovery workflows;
- change existing AI prompts.

Only add authorization adapters/checks where strictly necessary.

---

# 38. Finance authorization

Use existing permission keys when available.

Target granularity:

```text
finance.view
finance.journals.manage
finance.invoices.manage
finance.payments.manage
finance.bank.manage
finance.reconciliation.manage
finance.gst.manage
finance.reports.view
finance.reports.export
```

Do not duplicate an existing equivalent permission.

---

# 39. Security-definer authorization functions

The current repository already uses `SECURITY DEFINER` helpers to avoid RLS recursion.

Extend this pattern carefully.

Recommended helpers:

```text
core.user_role_for_business(business_id)
core.effective_permissions(business_id)
core.can_assign_role(business_id, role_id)
core.has_business_permission(business_id, permission_key)
```

Functions must:

- use `auth.uid()`;
- explicitly scope by business;
- use a safe `search_path`;
- restrict execute grants;
- never accept arbitrary SQL;
- avoid exposing membership rows across tenants.

---

# 40. Effective permission API

Add an application helper:

```ts
getEffectivePermissions(businessId)
```

and retain:

```ts
hasPermission(businessId, permissionKey)
requirePermission(businessId, permissionKey)
```

where compatible.

Recommended server helper:

```ts
requireModulePermission(
  businessId,
  moduleKey,
  permissionKey
)
```

This should enforce both license and permission.

---

# 41. Role assignment authorization

Conceptually:

```text
if actor == owner:
    allow

else:
    target role permissions
    must be subset of actor's grantable permissions

    target role cannot be owner
```

This must execute in a transaction.

Do not trust a client-supplied role ID.

---

# 42. Role mutation transaction

Creating/updating a role:

```text
authenticate
→ verify business membership
→ verify role-management permission
→ validate requested permissions
→ enforce grant ceiling
→ update role
→ replace permission grants atomically
→ audit
```

If anything fails, roll back.

---

# 43. Membership mutation transaction

Invitation acceptance:

```text
validate token
→ validate invitation status
→ validate role
→ validate business
→ create/activate membership
→ mark invitation accepted
→ audit
→ publish event
```

Protect against double acceptance.

---

# 44. Last-owner protection

Never allow:

```text
remove only owner
```

or:

```text
change only owner to non-owner
```

unless a dedicated ownership-transfer workflow is used.

Ownership transfer:

```text
current owner authentication
→ target must already be active member
→ explicit confirmation
→ new owner
→ old owner becomes admin
→ audit
```

---

# 45. Suspension

Suspended member:

```text
membership retained
role retained
access denied
```

Reactivation:

```text
membership active
role restored
```

Removal:

```text
membership no longer active
historical audit retained
```

Never delete the global user identity.

---

# 46. Session behavior

Do not place permanent business permissions into long-lived JWT claims.

Authorization must be re-evaluated on protected server operations.

If a user is removed or downgraded while logged in:

```text
next protected request
→ new authorization decision
→ denied where appropriate
```

---

# 47. Audit requirements

Use existing `core.audit_log`.

Events:

```text
member.invited
member.invitation_accepted
member.role_changed
member.suspended
member.reactivated
member.removed
role.created
role.updated
role.archived
role.permissions_changed
ownership.transfer_started
ownership.transferred
```

Record:

```text
actor
business
target
old role/permissions
new role/permissions
timestamp
reason when applicable
```

Never log:

- invitation tokens;
- password/reset tokens;
- payment credentials;
- provider secrets.

---

# 48. Cross-business isolation

Mandatory scenario:

```text
User:
Business A = Admin
Business B = Viewer
```

When operating in A:

```text
can edit according to Admin
```

When operating in B:

```text
only Viewer permissions
```

The user must never inherit A's permissions into B.

---

# 49. Database/RLS requirements

All membership, roles and invitation tables must have RLS.

RLS must enforce:

```text
tenant membership
AND
permission
```

Module tables continue to enforce:

```text
tenant
AND
licensed
AND
permission
```

Do not weaken current license RLS.

Direct database access tests are mandatory.

---

# 50. Required indexes

Ensure indexes exist for:

```text
business_members(business_id, user_id)
business_members(user_id, business_id)
roles(business_id)
role_permission_grants(role_id, permission_key)
business_invitations(business_id, status)
business_invitations(email, status)
```

Reuse existing indexes rather than creating duplicates.

---

# 51. Required constraints

```text
unique(business_id, user_id)
unique(business_id, normalized_role_key)
one active invitation per business + normalized email
```

Email normalization:

```text
trim + lowercase
```

Role keys are stable identifiers; display names remain editable.

---

# 52. Notifications

Reuse existing notification infrastructure.

Member:

```text
You were invited to Meridian HomeTech.
Your role was changed to Accountant.
Your access was suspended.
Your access was removed.
```

Admin:

```text
Priya accepted your invitation.
Amit's role was changed.
```

Use existing email/background-job infrastructure rather than sending mail directly from database triggers.

---

# 53. Employees are separate

Keep:

```text
core.employees
```

separate from:

```text
core.business_members
```

A technician can be:

```text
authenticated user
+
business member
+
employee
```

Do not create duplicate identities.

---

# 54. Platform Admin separation

Platform Admin is not the same as business Admin.

Business role:

```text
admin
```

must never imply:

```text
platform admin
```

Platform permissions remain separate, e.g.:

```text
platform.admin
platform.billing.manage
platform.plans.manage
platform.users.support
```

Business users cannot grant platform permissions.

---

# 55. Testing matrix

Mandatory tests:

```text
Owner → all business permissions
Admin → only granted permissions
Viewer → read-only
Custom role → exact grants
No membership → denied
Suspended → denied
Removed → denied
Licensed + no permission → denied
Permission + no license → denied

Business A admin + Business B viewer
→ permissions remain isolated

Admin assigns owner
→ denied

Admin grants permission they don't have
→ denied

Viewer changes own role
→ denied

User changes business_id in request
→ denied

Duplicate invitation acceptance
→ one membership

Expired invitation
→ denied

Revoked invitation
→ denied
```

---

# 56. E2E — existing user invitation

```text
Admin
→ Users & Access
→ Invite
→ existing email
→ select Sales Manager
→ send
→ user accepts
→ business appears in switcher
→ Sales Manager permissions apply
```

---

# 57. E2E — new user invitation

```text
Admin
→ invite new email
→ invitation email
→ signup
→ accept invitation
→ business membership active
→ assigned role visible
```

---

# 58. E2E — custom role

```text
Admin
→ Create Role
→ Marketing Manager
→ grant Marketing permissions
→ save
→ invite user
→ assign role
→ user sees Marketing
→ user cannot access Finance
```

---

# 59. E2E — role revocation

```text
Admin
→ remove marketing.campaigns.manage
→ save
→ user can still view
→ create/edit campaign denied
```

---

# 60. E2E — multiple businesses

```text
User:
A = Admin
B = Viewer

Switch A
→ edit allowed

Switch B
→ edit denied
```

---

# 61. Implementation phases

## Phase A — Foundation

- RBAC-01 inspect current auth/RLS
- RBAC-02 canonical roles
- RBAC-03 map existing roles
- RBAC-04 role permission grants
- RBAC-05 effective permission resolution
- RBAC-06 role-assignment ceiling

## Phase B — Users

- RBAC-07 invitations
- RBAC-08 invitation acceptance
- RBAC-09 active/suspended/removed status
- RBAC-10 role assignment
- RBAC-11 multi-business membership UI

## Phase C — Role management

- RBAC-12 Roles page
- RBAC-13 custom role creation
- RBAC-14 permission editor
- RBAC-15 role templates
- RBAC-16 role comparison
- RBAC-17 role archive/reassignment

## Phase D — Authorization integration

- RBAC-18 server guards
- RBAC-19 RLS enforcement
- RBAC-20 license × permission enforcement
- RBAC-21 export authorization
- RBAC-22 billing authorization
- RBAC-23 Funding/Data Room authorization
- RBAC-24 Discovery authorization adapters without restructuring Discovery

## Phase E — UX

- RBAC-25 Users & Access navigation
- RBAC-26 Users desktop/mobile
- RBAC-27 Invite flow
- RBAC-28 User details / role change
- RBAC-29 Roles desktop/mobile
- RBAC-30 Permission editor
- RBAC-31 business switcher role display

## Phase F — Security and regression

- RBAC-32 audit
- RBAC-33 privilege escalation tests
- RBAC-34 cross-business tests
- RBAC-35 RLS tests
- RBAC-36 invitation security
- RBAC-37 multi-business E2E
- RBAC-38 full regression

---


# 61a. Story index

Machine-readable index of §61's stories for `npm run build:progress`; code and tests cite
these ids (e.g. `RBAC-05`) as evidence of implementation. Mockups: `15-rbac-mockups.png`.

| Story | Title |
|---|---|
| `RBAC-01` | Inspect current auth/RLS |
| `RBAC-02` | Canonical roles |
| `RBAC-03` | Map existing roles |
| `RBAC-04` | Role permission grants |
| `RBAC-05` | Effective permission resolution |
| `RBAC-06` | Role-assignment ceiling |
| `RBAC-07` | Invitations |
| `RBAC-08` | Invitation acceptance |
| `RBAC-09` | Active/suspended/removed status |
| `RBAC-10` | Role assignment |
| `RBAC-11` | Multi-business membership UI |
| `RBAC-12` | Roles page |
| `RBAC-13` | Custom role creation |
| `RBAC-14` | Permission editor |
| `RBAC-15` | Role templates |
| `RBAC-16` | Role comparison |
| `RBAC-17` | Role archive/reassignment |
| `RBAC-18` | Server guards |
| `RBAC-19` | RLS enforcement |
| `RBAC-20` | License × permission enforcement |
| `RBAC-21` | Export authorization |
| `RBAC-22` | Billing authorization |
| `RBAC-23` | Funding/Data Room authorization |
| `RBAC-24` | Discovery authorization adapters without restructuring Discovery |
| `RBAC-25` | Users & Access navigation |
| `RBAC-26` | Users desktop/mobile |
| `RBAC-27` | Invite flow |
| `RBAC-28` | User details / role change |
| `RBAC-29` | Roles desktop/mobile |
| `RBAC-30` | Permission editor UI |
| `RBAC-31` | Business switcher role display |
| `RBAC-32` | Audit |
| `RBAC-33` | Privilege escalation tests |
| `RBAC-34` | Cross-business tests |
| `RBAC-35` | RLS tests |
| `RBAC-36` | Invitation security |
| `RBAC-37` | Multi-business E2E |
| `RBAC-38` | Full regression |
| `RBAC-39` | Module-scoped RLS with declared cross-module hand-offs (post-launch hardening; docs/design/rbac.md) |

---

# 62. Claude Code execution protocol

For every story:

1. Pull latest `main`.
2. Inspect current auth, membership, permission and RLS implementation.
3. Search for existing tables/functions before creating anything.
4. Add corrective migrations; do not edit already-applied migrations.
5. Preserve existing permission keys.
6. Preserve existing Discovery implementation.
7. Preserve existing license semantics.
8. Add focused unit/RLS/E2E tests.
9. Run typecheck, lint and relevant tests.
10. Run the full regression suite before major checkpoints.
11. Update the project progress tracker.
12. Commit focused changes.
13. Push according to repository workflow.
14. Continue autonomously.

Do not refactor unrelated functionality.

---

# 63. Definition of done

WonderArk is complete when:

```text
One business
→ multiple users
→ different roles
→ granular permissions
→ invitations
→ role management
→ suspension/removal
→ audit

One user
→ multiple businesses
→ independent role per business

Role permission
×
Module license
→
final access decision

Admin
→ can create users
→ can assign allowed roles
→ can create custom roles
→ cannot elevate themselves
→ cannot grant permissions beyond their authority

Owner
→ full business authority
→ protected ownership transfer

RLS
→ prevents cross-tenant access

Server authorization
→ prevents API/action bypass

Existing Discovery
→ remains structurally unchanged
```

---

# 64. Final architecture

```text
                         AUTH USER
                            │
                     USER PROFILE
                            │
              ┌─────────────┴─────────────┐
              │                           │
         BUSINESS A                  BUSINESS B
              │                           │
        MEMBERSHIP                    MEMBERSHIP
              │                           │
          ROLE: ADMIN                 ROLE: VIEWER
              │                           │
       ROLE PERMISSIONS             ROLE PERMISSIONS
              │                           │
              └─────────────┬─────────────┘
                            │
                     PERMISSION CHECK
                            │
                     MODULE LICENSE
                            │
                   RESOURCE-LEVEL RULE
                            │
                         ALLOW
```

**Core principle:**

> Identity determines who the user is. Business membership determines where the user is operating. The business-specific role determines what they may do. Module licensing determines what the business owns. Resource rules determine what records/actions are applicable. RLS and server-side authorization enforce the final decision.
