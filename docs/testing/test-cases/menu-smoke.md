# Test cases: Menu / navigation smoke (all modules)

Purpose: every clickable menu item in every licensed module resolves to a real page
-- no 404, no unhandled server error. Derived directly and exhaustively from
`packages/module-registry/src/index.ts`, which `CLAUDE.md`/`00-MASTER-PLAN.md` §6
mandate as the single source of truth for navigation -- so this file's item list
should never drift from the registry; if the registry changes, regenerate the
affected module's section here in the same commit.

A matching automated test exists: `apps/web/tests/menu-routes.test.ts` checks route
existence on disk for every registry item (fast, no server/DB needed) and would have
caught both `fsm` failures below immediately. These documented cases go one step
further where a filesystem check can't: that the page actually **renders** (license
gate passes, no runtime error) for a real licensed business, not just that a
`page.tsx` file exists.

**Precondition shared by every case below unless stated otherwise:** logged in as a
user with a business that has the relevant module licensed, and click the item from
the sidebar (not by typing the URL) so the case also covers the link itself, not just
the destination.

## Known-failing right now (confirmed by direct inspection, 2026-09-08)

### TC-MENU-LIC-002: Sidebar shows unlicensed modules as normal, clickable menu items
**Priority:** P0 · **Status:** CONFIRMED FAILING — this is almost certainly what's
behind "CRM and GST menus lead to page not found," reported directly by the user.
**Root cause, confirmed two ways:**
1. **Code:** `apps/web/app/(dashboard)/layout.tsx` passes the full, unfiltered
   `moduleRegistry` straight to `DashboardChrome` → `DashboardShell` → `AppSidebar`
   (`modules={moduleRegistry}`, no license query involved). Grepping the entire shell
   component tree (`app-sidebar.tsx`, `app-topbar.tsx`, `module-selector.tsx`,
   `dashboard-shell.tsx`, `dashboard-chrome.tsx`) for `has_module`/license/entitlement
   logic turns up **zero** real filtering — only descriptive comments that assume it
   happens ("licensed modules," never backed by a check).
2. **Data:** queried the real dev database (`jazdtomcgqjxjueedmck`) directly —
   business **"Aroma Adorn"** (`6a68ff2b-e7b5-4ee1-9c06-7f05cd66c776`) has
   `crm`/`gst`/`inventory` license rows entirely absent (`null` status) and only
   `discovery`/`fsm` active. Its sidebar, per the code above, shows all 5 modules
   anyway.
**Steps:** Select "Aroma Adorn" (or any business with fewer than 5 modules
licensed), open the module switcher.
**Expected result (per `CLAUDE.md`'s own licensing-enforcement mandate — "UI built
from module-registry filtered by entitlements"):** Only `discovery` and `fsm`
appear in the sidebar/module switcher — unlicensed modules are not listed at all.
**Expected result if an unlicensed module's URL is reached anyway** (direct link,
bookmark, browser back/forward, or a stale link from before a license was
cancelled): never a bare "404 / Page Not Found" with no context. Instead, a clear,
on-brand page that tells the person what's going on and what to do next:
- Which module it is, by name (e.g. "CRM isn't part of your plan yet" — not a
  generic "not found").
- A one-line reason: not licensed / license cancelled / grace period ended (reuse
  `core.license_events`' actual status so this stays accurate rather than one
  static string for every case).
- A direct call-to-action link to `/dashboard/settings/licenses`, where they can
  see current entitlements and request/activate the module — not just "go back."
- If the module was previously licensed and is now in its 30-day grace window
  (ADR-9), say so explicitly and reassure that the data is intact and read-only
  during grace, not gone — this is exactly the situation someone here is most
  likely to worry about, and the page should proactively answer it.
This is a distinct UI state from a genuine 404 (a URL that never existed at all,
e.g. `TC-MENU-FSM-001`/`002` below) — the two should not look the same to the user,
since "you don't have this" and "this doesn't exist" call for different next actions.
**Actual result:** All 5 modules appear, including the 3 the business was never
licensed for. Clicking into any of them reaches a real route (build-verified — see
below) with no license check anywhere in the render path, so the actual downstream
behavior is undefined/inconsistent rather than a clean, deliberate block or the
informative page described above — this is the likely source of the "page not
found" symptom even though a literal `notFound()` call was not pinned to an exact
line without a live browser session.
**Note on the other 3 enforcement layers (`CLAUDE.md`'s 4-layer requirement):**
confirmed also missing for `crm`/`gst` specifically — `proxy.ts` has no license
logic at all (still the bare session-refresh passthrough, its own comment says
gating "lands in Epic 2's C-5," but C-5 per the commit log only did
active-business resolution, not the route guard half of its own title), and
`crm/page.tsx`/`gst/*/page.tsx` only call `getBusiness()` (existence check), never
`requireModule()`. RLS (`has_module()`, confirmed via `pg_get_functiondef` to
return a clean boolean, never throw) is the *only* one of the 4 layers actually
enforcing anything for these two modules today.

### TC-MENU-FSM-001: `fsm` → "Dashboard" (root nav item)
**Priority:** P0 · **Status:** CURRENTLY FAILING
**Steps:** With `fsm` licensed, click "Service" in the module switcher, then
"Dashboard" (the module's root/overview item, `slug: ""`).
**Expected result:** The FSM dashboard renders.
**Actual result:** 404 -- `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/fsm/page.tsx`
does not exist on disk. This is the module's own root route (what `/fsm` resolves
to) and the very first item in its nav -- the highest-visibility gap this audit found.

### TC-MENU-FSM-002: `fsm` → "Customers"
**Priority:** P0 · **Status:** CURRENTLY FAILING
**Steps:** With `fsm` licensed, click "Customers" in the Service module nav.
**Expected result:** An FSM-scoped customer list renders.
**Actual result:** 404 -- no `fsm/customers/` route folder exists at all (confirmed:
not present anywhere under `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/fsm/`),
despite the registry declaring this nav item under a "Customers" heading.

## Inventory (all confirmed present on disk -- verify runtime render only)

### TC-MENU-INV-001..013: each Inventory nav item renders
**Priority:** P0 · **Status:** route files confirmed present; runtime not yet click-tested
For each of the following, click it from the Inventory nav and confirm it renders
with no 404/500: **Dashboard** (`dashboard`), **Alerts** (`alerts`), **Audit Log**
(`audit-log`), **Products** (`products`), **Inventory** (`stock`), **Stock Transfers**
(`transfers`), **Warehouses** (`warehouses`), **Customers** (`customers`), **Sales
Orders** (`sales-orders`), **Sales Invoices** (`sales-invoices`), **Sales Returns**
(`sales-returns`), **Suppliers** (`suppliers`), **Purchase Orders** (`purchase-orders`),
**Team** (`team`), **API Keys** (`api-keys`).
**Expected result:** All 13 render without error for a business with `inventory` licensed.

## FSM (remaining items -- the two above are the known exceptions)

### TC-MENU-FSM-003..008: each remaining FSM nav item renders
**Priority:** P0 · **Status:** route files confirmed present; runtime not yet click-tested
**Opportunities** (`opportunities`), **Jobs** (`jobs`), **Schedule** (`schedule`),
**My Day** (`my-day`), **Invoices** (`invoices`), **Reports** (`reports`),
**Settings** (`settings`).
**Expected result:** All 7 render without error for a business with `fsm` licensed.
Note "My Day" (`Smartphone` icon) is explicitly the mobile/field view per the
registry comment context -- worth confirming it renders sensibly on an actual phone
width too, tying into `UX-AUDIT.md`'s mobile-responsiveness finding (#6).

## CRM (all confirmed present on disk)

### TC-MENU-CRM-001: `crm` → "Inbox" (root nav item)
**Priority:** P0 · **Status:** route file confirmed present (`crm/page.tsx` exists,
unlike fsm's equivalent).
**Steps:** Click "CRM" then "Inbox" (root item).
**Expected result:** Renders.

### TC-MENU-CRM-002: `crm` → "Channels"
**Priority:** P0 · **Status:** route confirmed present.

### TC-MENU-CRM-003: `crm` → "Routing Rules"
**Priority:** P0 · **Status:** route confirmed present.

## GST (all confirmed present on disk)

### TC-MENU-GST-001: `gst` → "GST Profile" (`profile`)
### TC-MENU-GST-002: `gst` → "e-Way Bill" (`eway-bill`)
### TC-MENU-GST-003: `gst` → "e-Invoicing" (`einvoicing`)
### TC-MENU-GST-004: `gst` → "GST Filing" (`filing`)
**Priority:** P0 (all four) · **Status:** route files confirmed present.
**Expected result:** All four render without error for a business with `gst` licensed.

## Discovery (dynamic nav -- different shape, same intent)

### TC-MENU-DISC-001: Product list renders for every product in a workspace
**Priority:** P0
**Feature:** Discovery's nav isn't the static registry list (its entry exists only
"so every module has *a* nav manifest," per the registry's own comment) -- it's
`app-sidebar.tsx` rendering the business's real product list.
**Steps:** With `discovery` licensed and 3+ products, expand Discovery in the sidebar.
**Expected result:** Every product listed navigates to that product's overview
without a 404 -- functionally the same guarantee as the other modules' static items,
just data-driven instead of registry-driven.

## Account / settings menu (not module-owned, but part of "every menu" in practice)

### TC-MENU-ACCT-001..006: each account-menu item renders
**Priority:** P1 · **Status:** route files confirmed present for all six.
**Profile** (`/dashboard/settings/profile`), **Usage** (`/dashboard/settings/usage`),
**Billing** (`/dashboard/settings/billing`), **Appearance**
(`/dashboard/settings/appearance`), **AI Provider** (`/dashboard/settings/ai-provider`),
**Admin** (`/dashboard/admin`) -- all linked from `sidebar-account-menu.tsx`.
**Expected result:** All six render without error.

### TC-MENU-ACCT-007: "Licenses" (linked from the module switcher, not the account menu)
**Priority:** P1 · **Status:** route confirmed present (`/dashboard/settings/licenses`).
**Steps:** Open the module switcher (`module-selector.tsx`), click "Licenses."
**Expected result:** Renders -- flagged separately since it's the one settings page
linked from a different UI element than the other six, easy to miss in a manual pass.

## Cross-cutting: licensing interaction with menu visibility

### TC-MENU-LIC-001: Unlicensed module's items don't render as dead links
**Priority:** P0 · **Status:** CONFIRMED FAILING — see TC-MENU-LIC-002 above for the
full root-cause writeup; this entry is the general form (any business, any
under-licensed module), TC-MENU-LIC-002 is the specific reproduction with real data.
**Steps:** With a module NOT licensed for the business, confirm its section doesn't
appear in the sidebar at all — and if reached directly by URL anyway, is blocked
cleanly (all 4 of `CLAUDE.md`'s enforcement layers should apply; only RLS currently does).
**Expected result:** No dead/greyed-out nav items for unlicensed modules; direct URL
access is blocked server-side, not just hidden client-side, and shown the same
informative not-licensed page described in TC-MENU-LIC-002 — module name, reason,
and a link to `/dashboard/settings/licenses` — never a bare 404.

## Maintenance note

This file and `apps/web/tests/menu-routes.test.ts` must stay in sync with
`module-registry`. When a story adds/removes/renames a nav item: update the registry,
update the automated test's `KNOWN_FAILING` set if applicable, add/remove the
corresponding `TC-MENU-*` case here, and update `INDEX.md`'s row for this file in the
same commit -- exactly the policy `TESTING_STRATEGY.md` §4 already describes.
