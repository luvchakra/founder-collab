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

## Historical: confirmed-failing at the 2026-09-08 execution pass, since fixed

The two items in this section were CONFIRMED FAILING when this file was first written
(2026-09-08 execution pass) and are kept here, marked FIXED, as a record of what was
found and how — not because either is still broken. Re-verified this pass (task #74)
by reading the current code rather than trusting the historical write-up to still hold;
see each item's own "Re-verified" note for exactly what was checked.

### TC-MENU-LIC-002: Sidebar shows unlicensed modules as normal, clickable menu items
**Priority:** P0 · **Status:** FIXED (task #25) — was CONFIRMED FAILING; this is
almost certainly what was behind "CRM and GST menus lead to page not found," reported
directly by the user at the time.
**Re-verified this pass:** `apps/web/app/(dashboard)/layout.tsx` now imports
`listLicensedModuleKeysByBusiness` and passes the result down to `DashboardChrome`
alongside the full `moduleRegistry`, which is where the actual per-business filtering
happens — the unfiltered `modules={moduleRegistry}` pass-through this finding
originally caught is gone. Separately, the root cause's second half (below) — no
direct-URL guard for a reached-anyway unlicensed route — is also now handled: see the
corrected "Note on the other 3 enforcement layers" below.
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
**Note on the other 3 enforcement layers (`CLAUDE.md`'s 4-layer requirement) — corrected
this pass:** the original write-up said `proxy.ts` had no license logic at all and RLS
was the only one of the 4 layers enforcing anything for `crm`/`gst`. That was true of
`proxy.ts`'s own body, but missed that the actual route guard lives one level down, in
`updateSession()` (`packages/core/src/db/middleware.ts`, which `proxy.ts` calls
directly) — it queries `core.licenses` for the active business, and rewrites any
request under an unlicensed/grace-expired module's route prefix to
`/dashboard/businesses/[businessId]/not-licensed` with `module`/`reason`/`graceEndsAt`
params, which is exactly the informative page TC-CORE-001/003 and TC-MENU-LIC-001 below
describe — confirmed by reading `middleware.ts` directly (`findUnlicensedModuleForRoute`
and the `NextResponse.rewrite(url)` call), not inferred from the page component's own
existence. So the route guard IS live for `crm`/`gst` (and every other module) today;
`crm/page.tsx`/`gst/*/page.tsx` calling only `getBusiness()` rather than also calling
`requireModule()` themselves is real (server-action-layer defense-in-depth, CLAUDE.md's
3rd layer, is still thinner here than the route guard or RLS), but it's no longer true
that direct URL access to an unlicensed module goes completely unblocked.

### TC-MENU-FSM-001: `fsm` → "Dashboard" (root nav item)
**Priority:** P0 · **Status:** FIXED (task #26) — was CURRENTLY FAILING.
**Steps:** With `fsm` licensed, click "Service" in the module switcher, then
"Dashboard" (the module's root/overview item, `slug: ""`).
**Expected result:** The FSM dashboard renders.
**Re-verified this pass:** `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/fsm/page.tsx`
exists on disk now (confirmed via `ls`) — this file's original write-up recorded it as
missing; kept here as the historical record of that gap, not a currently-open one.

### TC-MENU-FSM-002: `fsm` → "Customers"
**Priority:** P0 · **Status:** FIXED (task #26) — was CURRENTLY FAILING.
**Steps:** With `fsm` licensed, click "Customers" in the Service module nav.
**Expected result:** An FSM-scoped customer list renders.
**Re-verified this pass:** `fsm/customers/page.tsx` exists on disk now (confirmed via
`ls`), under the route folder this write-up originally found completely absent.

## Inventory (all confirmed present on disk -- verify runtime render only)

### TC-MENU-INV-001..013: each Inventory nav item renders
**Priority:** P0 · **Status:** route files confirmed present; runtime not yet click-tested
For each of the following, click it from the Inventory nav and confirm it renders
with no 404/500: **Dashboard** (`dashboard`), **Alerts** (`alerts`), **Audit Log**
(`audit-log`), **Products** (`products`), **Inventory** (`stock`), **Stock Transfers**
(`transfers`), **Warehouses** (`warehouses`), **Customers** (`customers`), **Sales
Orders** (`sales-orders`), **Sales Invoices** (`sales-invoices`), **Sales Returns**
(`sales-returns`), **Suppliers** (`suppliers`), **Purchase Orders** (`purchase-orders`),
**Team** (`team`).
**Expected result:** All 12 render without error for a business with `inventory` licensed.
**API Keys moved out from under this nav this pass** (item #7 of a UX/API pass) to its
own business-wide `admin/api-keys` route, reachable from the Admin & settings hub
instead -- `core.api_keys` was never actually inventory-specific (see that page's own
doc comment); it now covers fsm/crm/gst resources too, not just inventory's.

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
**Update (this pass):** the Routing Rules page now also has a per-rule "Conditions"
column (known-vs-new sender, business hours) and its create form gained matching
fields — see `crm.md` TC-CRM-001 for the actual matching behavior; this case only
confirms the page itself still renders.

### TC-MENU-CRM-004: `crm` → Channels page now also shows a "Connected accounts" panel
**Priority:** P1 · **Status:** built this pass (`docs/design/crm-module-design.md`
Part A, A1) -- not a new registry nav item (still reached via the existing
"Channels" item), but a materially new section on that same page worth its own
render-smoke case.
**Steps:** With `crm` licensed, click "Channels," and confirm the "Connected
accounts" section (connect form + accounts table) renders below the existing
channels table.
**Expected result:** Renders without error, whether or not any channel exists yet
to connect an account to (the connect form itself is hidden with an explanatory
message until at least one channel exists).

### TC-MENU-CRM-005: Customer 360 (`crm/customers/[partyId]`) -- dynamic, reached from a ticket, not a static nav item
**Priority:** P1 · **Status:** built this pass (`docs/design/crm-module-design.md`
Part B, B1) -- same "dynamic nav, same intent" framing as `TC-MENU-DISC-001`: this
route has no entry in `module-registry`'s own nav array at all, it's a link that
appears on a ticket row once that ticket has resolved a `party_id`.
**Steps:** With `crm` licensed and an inbound-webhook-created ticket, click "Customer
360" from that ticket's own row in the Inbox.
**Expected result:** Renders the Customer 360 panel for that ticket's party, `404`s
if the URL's `partyId` belongs to a different business than the URL's `businessId`
(the page's own `party.business_id !== businessId` check) -- see `crm.md`
TC-CRM-009 for the panel's own content behavior.

## GST (all confirmed present on disk)

### TC-MENU-GST-001: `gst` → "GST Profile" (`profile`)
### TC-MENU-GST-002: `gst` → "e-Way Bill" (`eway-bill`)
### TC-MENU-GST-003: `gst` → "e-Invoicing" (`einvoicing`)
### TC-MENU-GST-004: `gst` → "GST Filing" (`filing`)
**Priority:** P0 (all four) · **Status:** route files confirmed present.
**Expected result:** All four render without error for a business with `gst` licensed.

## Discovery (dynamic nav -- different shape, same intent)

### TC-MENU-DISC-001: Product list renders for every product in a workspace, under a two-group Overview/Products structure
**Priority:** P0
**Feature:** Discovery's nav isn't the static registry list (its entry exists only
"so every module has *a* nav manifest," per the registry's own comment) -- it's
`app-sidebar.tsx` rendering the business's real product list.
**Update (this pass — item #3 of a UX pass):** restructured from one bare
"Dashboard" link followed by an unlabeled product list into two proper groups: an
"Overview" heading holding "Dashboard" (the business-level page, discovery-specific
content), and a separate "Products" heading holding the product list itself —
matching every other module's own two-heading nav shape (e.g. `gst`'s "Overview" +
"GST" groups) instead of standing out as the one inconsistent case.
**Steps:** With `discovery` licensed and 3+ products, expand Discovery in the sidebar
and confirm both group headings appear.
**Expected result:** "Overview" contains exactly "Dashboard"; "Products" lists every
product, each navigating to that product's overview without a 404 -- functionally
the same guarantee as the other modules' static items, just data-driven instead of
registry-driven.

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

### TC-MENU-ACCT-008: The module switcher's own "Admin" shortcut is a *different* page than the account menu's "Admin" item -- don't confuse the two
**Priority:** P1 · **Status:** route confirmed present (`/dashboard/settings`).
**Feature:** Two genuinely separate surfaces share the label "Admin" in this app: the
account menu's item (TC-MENU-ACCT-001..006 above) links to `/dashboard/admin`, the
platform-admin demo-seed tool gated by `PLATFORM_ADMIN_EMAILS`; the module switcher's
own bottom shortcut (`module-selector.tsx`) links to `/dashboard/settings`, the
"Admin & settings" hub every account member can reach (Account links + a Business
section per business, including the disable/enable and API-keys items this pass
added -- see `platform-shell.md` TC-SHELL-013). Documenting the distinction
explicitly since both are labeled "Admin" and it would be easy to write one test case
believing it covers both.
**Steps:** Open the module switcher's own dropdown and click its bottom "Admin" row.
**Expected result:** Renders `/dashboard/settings` (Executive Dashboard's own
`Settings2` icon page), not `/dashboard/admin` -- reachable by every account member,
not gated by `PLATFORM_ADMIN_EMAILS`.

## Cross-cutting: licensing interaction with menu visibility

### TC-MENU-LIC-001: Unlicensed module's items don't render as dead links
**Priority:** P0 · **Status:** FIXED (same task #25 fix, same underlying mechanism) —
was CONFIRMED FAILING; see TC-MENU-LIC-002 above for the full root-cause writeup, this
entry is the general form (any business, any under-licensed module), TC-MENU-LIC-002
is the specific reproduction with real data.
**Steps:** With a module NOT licensed for the business, confirm its section doesn't
appear in the sidebar at all — and if reached directly by URL anyway, is blocked cleanly.
**Expected result:** No dead/greyed-out nav items for unlicensed modules; direct URL
access is blocked server-side, not just hidden client-side, and shown the same
informative not-licensed page described in TC-MENU-LIC-002 — module name, reason,
and a link to `/dashboard/settings/licenses` — never a bare 404.
**Re-verified this pass:** both halves hold — sidebar filtering via
`listLicensedModuleKeysByBusiness` (TC-MENU-LIC-002) and the direct-URL route guard via
`updateSession()`'s rewrite to `/not-licensed` (this file's corrected "Note on the
other 3 enforcement layers" above). Not yet re-verified live in a browser this pass
(no live Supabase session in this sandbox) — confirmed by reading the actual guard
code and its call sites, which is a real check, but running it end to end in a browser
against live license data remains the strictly stronger verification the original
2026-09-08 pass did and this one didn't repeat.

## Maintenance note

This file and `apps/web/tests/menu-routes.test.ts` must stay in sync with
`module-registry`. When a story adds/removes/renames a nav item: update the registry,
update the automated test's `KNOWN_FAILING` set if applicable, add/remove the
corresponding `TC-MENU-*` case here, and update `INDEX.md`'s row for this file in the
same commit -- exactly the policy `TESTING_STRATEGY.md` §4 already describes.
