# Test cases: Platform shell (apps/web host, module-registry driven nav)

Covers cross-cutting, non-module-owned surface: `apps/web/app/(auth)/**`,
`(dashboard)/dashboard/settings/**`, `admin`, sidebar/topbar shell in
`packages/core/src/components/{navigation,shell,theme}`, and `module-registry`.
This is the area with the most UI churn in the git history (sidebar rebuilt several
times) — keep these cases current against whichever layout is actually live rather
than trusting past commits to still match.

### TC-SHELL-001: Sidebar/nav is built from `module-registry`, never hardcoded
**Feature:** `63ca159` — "Wire sidebar nav to the module registry, not hardcoded consts."
**Priority:** P0 · **Story:** post-registry fix
**Steps:**
1. Change a module's entry in `module-registry` (e.g. its display name or icon).
2. Reload the sidebar.
**Expected result:** Reflects the registry change immediately — if the sidebar still
shows the old value, something reintroduced a hardcoded list.

### TC-SHELL-002: Sidebar only shows licensed modules for the current business
**Feature:** Module-registry filtered by entitlements (CLAUDE.md's 4-layer licensing
enforcement, UI layer).
**Priority:** P0 · **Story:** C-5/C-6 + registry · **Status:** FIXED (task #25, this
platform session) — was CONFIRMED FAILING at the original 2026-09-08 execution pass
(see `menu-smoke.md` TC-MENU-LIC-002 for that root-cause writeup); re-verified this
pass by reading the current `apps/web/app/(dashboard)/layout.tsx`, which now imports
`listLicensedModuleKeysByBusiness` and passes `licensedModuleKeysByBusiness` down to
`DashboardChrome` alongside the full `moduleRegistry` for it to filter by — the
unfiltered-pass-through this case originally caught no longer exists. Leaving this
status update here rather than only in `menu-smoke.md`, since a reader landing on this
file first would otherwise still see a two-platform-sessions-stale "CONFIRMED FAILING."
**Steps:**
1. License only `discovery` and `fsm` for a business.
**Expected result:** Sidebar shows exactly those two module sections, not all five —
consistent with the route guard (TC-CORE-001) also blocking direct navigation to the
unlicensed ones, and showing the informative not-licensed page (module name, reason,
link to Settings → Licenses) rather than a bare 404 if one is reached anyway.

### TC-SHELL-003: Onboarding flow provisions a business with sane defaults
**Feature:** `925da73` — port onboarding flow.
**Priority:** P0 · **Story:** P-5 shell port
**Steps:**
1. Complete onboarding as a brand-new account.
**Expected result:** Business created, at least one module licensed per whatever the
onboarding flow promises, user lands on a working dashboard — no dead-end or partial state.

### TC-SHELL-004: Business switcher updates the active module scope correctly
**Feature:** Active-business resolution (C-5) + shell business switcher (`f4f6ff6`).
**Priority:** P0 · **Story:** C-5
**Steps:**
1. Switch businesses via the shell switcher while on a module page (e.g. inventory products).
**Expected result:** Navigates to the equivalent page under the new business's
context, not a stale view still scoped to the old business.

### TC-SHELL-005: AI chat widget and alert bell are genuinely wired to real data — and, as of item #13, every licensed module's own data, not just discovery's
**Feature:** `03a7280` — "Wire real alert bell and AI chat widget into the platform shell."
**Priority:** P1 · **Story:** post-port polish, extended by item #13 of a later UX pass
**Update (this pass):** the bell previously only ever showed `deriveAccountAlerts()`'s
own discovery-derived alerts. `apps/web/app/(dashboard)/layout.tsx#getOtherModuleAlerts`
now also calls each of inventory/fsm/crm/gst's own `contract/index.ts#getAlerts` (per
business, filtered to that business's actually-licensed modules first) and merges the
results in, re-sorted by severity — see each module's own test-case file
(`inventory.md` TC-INVENTORY-016, `fsm.md` TC-FSM-019, `gst.md` TC-GST-009) for the
per-module detail; `crm` has no `getAlerts` of its own yet (not part of this pass's
scope).
**Steps:**
1. Trigger a condition that should produce an alert (e.g. usage threshold, needs-action prospect).
2. Check the alert bell.
3. Ask the chat widget about current business/module state.
4. License a business for inventory/fsm/gst as well as discovery, each with at least
   one alert-worthy condition, and open the bell.
**Expected result:** Steps 1-3 reflect real, current data — not the ported
placeholder/demo content from either source repo. Step 4 shows alerts from every
licensed module in one merged, severity-sorted list, not only discovery's.

### TC-SHELL-006: Licenses admin UI accurately reflects and controls entitlements
**Feature:** C-6.
**Priority:** P0 · **Story:** C-6
**Steps:**
1. From the licenses admin UI, activate and then cancel a module license.
**Expected result:** Matches TC-CORE-001/002's backend behavior exactly — the UI
never shows a module as active when the backend has denied it, or vice versa. The
licenses page itself is also where every "not licensed"/"in grace" informative page
elsewhere in the app (TC-CORE-001/003, TC-MENU-LIC-001/002) links back to, so its own
copy should state plainly, per module: current status, grace-period end date if
applicable, and a one-click activate/reactivate action — this page is the resolution
for every blocked state described elsewhere in this doc, not just a status table.

### TC-SHELL-007: Settings pages (profile, appearance, AI provider, billing, usage) all function post-port
**Feature:** `535ed0c` — port account settings pages.
**Priority:** P1 · **Story:** P-5 shell port
**Steps:**
1. Exercise each settings page: update profile, change theme, connect/switch an AI
   provider, view billing, view usage.
**Expected result:** Each works independently; theme change (light/dark, per
CLAUDE.md's design non-negotiable — light by default) applies platform-wide, not
just within one module's pages.

### TC-SHELL-008: Design system consistency — no module brings its own look
**Feature:** CLAUDE.md non-negotiable #7 — shared design system, light theme, blue
accent, matching `docs/DESIGN.md`'s reference mockup.
**Priority:** P1 · **Story:** ongoing design guardrail
**Steps:**
1. Visually compare a screen from each of the five modules.
**Expected result:** Consistent shell chrome, colors, and component styling across
all — no leftover StockPilot teal/amber or `co-founder-ai` dark-violet theming
surfacing anywhere post-port.

### TC-SHELL-009: `lint:boundaries` actually fails on a real violation
**Feature:** `2e1018e` — "deliberately-failing fixture test for the boundary lint" (P-4).
**Priority:** P0 · **Story:** P-4
**Steps:**
1. Run `npm run lint:boundaries` against the existing fixture that's meant to fail.
**Expected result:** It fails, correctly — a regression here (the lint stops
catching violations) would silently reopen the door to cross-module coupling
everywhere else in this doc assumes is prevented.

### TC-SHELL-010: Every top-level route area has its own error boundary — no bare Next.js default error page
**Feature:** Error-message audit (task #70, this pass).
**Priority:** P0 · **Story:** error-message audit
**Background — a real gap found and fixed this session:** only one `error.tsx` existed
in the whole app, at `(dashboard)/dashboard/error.tsx` (using `module-discovery`'s
`AiErrorNotice`). There was no `error.tsx` for `(auth)/**` (login/signup/forgot-password/
reset-password), `onboarding/**`, or `p/**` — the platform's only unauthenticated,
customer-facing routes (public estimate/invoice/customer-center links) — and no
`global-error.tsx` at all (the boundary that catches an error thrown by the root layout
itself, above every other `error.tsx`). Any error in those areas fell through to
Next.js's bare default error page instead of the platform's own "Something went wrong"
treatment. Fixed by adding a new shared `packages/core/src/components/errors/error-notice.tsx`
(a generic version of `AiErrorNotice` with no AI-specific logic, appropriate for
non-discovery routes) and wiring up `apps/web/app/(auth)/error.tsx`,
`apps/web/app/onboarding/error.tsx`, `apps/web/app/p/error.tsx`, and
`apps/web/app/global-error.tsx` (which, per Next.js's own requirement for this one
file, renders its own complete `<html>/<body>` with zero external dependencies, since
triggering it means the real root layout didn't render at all).
**Steps:**
1. Force a thrown error inside a page/layout under each of: `(auth)`, `onboarding`,
   `p/[any token route]`, and the root layout itself (temporarily, in a dev
   environment).
**Expected result:** Each shows a styled "Something went wrong" notice with a "Try
again" button — never Next.js's default unstyled error page — matching the treatment
the dashboard shell already had.
**Automated coverage:** none yet (would need an integration test that actually throws
inside each route — no such harness exists in this repo); verified this pass via a full
`next build`, which compiles every route including these new boundaries without error,
plus reading each file to confirm correct props/behavior. Manual verification (visiting
each route with a forced error) has not been done live in a browser this pass.

### TC-SHELL-011: The module picker's lock icon means "not licensed" — never "temporarily inert because another module is pinned"
**Feature:** Item #8 of a UX pass — `packages/core/src/components/shell/module-selector.tsx`.
**Priority:** P2 · **Story:** this pass (regression)
**Correction:** before this fix, pinning one module to the drawer (`onTogglePin`) made
every *other* module row show a lock icon too, identical to a genuinely unlicensed
module's own icon — a founder had no way to tell "this is locked because I pinned
something else" apart from "this is locked because I haven't bought it." Fixed so the
lock renders only when `!module.licensed`; a licensed-but-pinned-away module instead
shows no trailing icon at all, relying on its own muted row styling to convey
"disabled for now."
**Steps:**
1. Pin a licensed module in the drawer.
2. Look at every other *licensed* module's row.
3. Look at an actually-unlicensed module's row, both pinned and unpinned states.
**Expected result:** Step 2 shows no lock icon on any of them (muted/disabled styling
only). Step 3 shows the lock icon in both states — licensing, not the pin, is the only
thing that ever produces it.
**Automated coverage:** none — pure rendering logic; would need a component-level test
this repo has no precedent for yet.

### TC-SHELL-012: Business name header has no redundant "BUSINESS" label or extra vertical space above it
**Feature:** Item #9 of a UX pass — `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/page.tsx`.
**Priority:** P3 · **Story:** this pass (cosmetic)
**Steps:**
1. Open any business's own detail page and look just above the business name.
**Expected result:** No "BUSINESS" label, and the breadcrumb/name/description block
sits in a single tightened `gap-3` group with no extra blank vertical space above the
name — purely visual, easy to silently regress if this page's layout is touched again
without checking this case.
**Automated coverage:** none — a pure layout/CSS check.

### TC-SHELL-013: Admin & settings hub's Business section: disable/enable and business-wide API keys both work from the same row
**Feature:** Items #7 and #17 of a UX pass —
`apps/web/app/(dashboard)/dashboard/settings/page.tsx`.
**Priority:** P1 · **Story:** this pass
**Steps:**
1. From `/dashboard/settings`, find a business's own row under "Business."
2. Click through to "API keys" (business-wide, not inventory-specific — see
   `core.md` TC-CORE-013).
3. Click "Disable" on a business, confirm the dialog, then "Re-enable."
4. Repeat step 3 while looking at the sidebar/topbar business switcher in another tab
   or after a refresh (see `core.md` TC-CORE-016 for the full backend-level case).
**Expected result:** Step 2 reaches the API-keys panel regardless of which modules
the business has licensed (it's core-owned data, not gated on `inventory`). Step 3's
confirmation dialog names exactly what disabling does (removed from the navbar,
nothing deleted) before committing. Step 4 confirms the switcher list updates
immediately after disabling/re-enabling.
**Automated coverage:** none — same rendered-UI gap as most of this section.

### TC-SHELL-014: Executive Dashboard (renamed from Control Center) reads clearly section by section
**Feature:** Item #17 (second occurrence) of a UX pass —
`apps/web/app/(dashboard)/dashboard/page.tsx`, the module picker's own shortcut label,
and every module's breadcrumb trail that used to say "Control Center."
**Priority:** P2 · **Story:** this pass
**Correction:** the page/shortcut/breadcrumbs previously all said "Control Center" —
renamed to "Executive Dashboard" everywhere at once (the h1, the module-selector's
top shortcut, `app-sidebar.tsx`'s own doc comment), with each of the "Overview,"
"Modules," and "Conversions" sections gaining a one-sentence description under its own
heading, and the "Needs attention" card gaining a `CardDescription`. `crm`/`gst`'s own
layouts (`crm/layout.tsx`, `gst/layout.tsx`) still literally said "Control Center" in
their breadcrumb trail before item #19 (second occurrence, see `crm.md`/`gst.md`
TC-GST-008) removed that crumb entirely — both fixes landed in the same pass.
**Steps:**
1. Open the module picker drawer and read its top shortcut.
2. Navigate to `/dashboard` and read the page heading and each section's own
   description text.
**Expected result:** "Executive Dashboard" everywhere a reader would have seen
"Control Center" before; "Overview"/"Modules"/"Conversions"/"Needs attention" each
have a short description explaining what that section actually shows, not just a bare
heading.
**Automated coverage:** none — pure copy/rendering check.

### TC-SHELL-015: Executive Dashboard's PDF download omits the settings/controls shortcut row
**Feature:** Item #18 (second occurrence) of a UX pass —
`apps/web/components/dashboard/download-pdf-button.tsx`, `print:hidden` styling.
**Priority:** P2 · **Story:** this pass
**Steps:**
1. Open `/dashboard` and click "Download PDF."
2. In the resulting print dialog's preview (or the saved PDF), check for the topbar,
   sidebar, the "Admin & settings / Licenses / Usage / Billing" shortcut row, and the
   "Download PDF" button itself.
3. Check for the "Needs attention"/"Overview"/"Modules"/"Conversions" report content.
**Expected result:** Step 2's four items are absent from the printed output
(`print:hidden` on the topbar and this specific shortcut row and button — the browser's
native Print-to-PDF flow, not a new PDF-rendering dependency). Step 3's actual report
content prints normally, unclipped.
**Automated coverage:** none — `window.print()`/browser print-preview behavior has no
automated harness in this repo.

### TC-SHELL-016: The sidebar's AI-credits percentage shows only while running on the platform's own included credit, never once BYOK is connected
**Feature:** Item #16 of a UX pass — see `discovery.md` TC-DISCOVERY-004 for the full
BYOK-vs-platform-key behavior; this case is the shell's own rendering half.
**Priority:** P2 · **Story:** this pass
**Steps:**
1. With no BYOK key connected for the account, open the sidebar drawer and look at the
   row above the avatar/profile.
2. Connect a BYOK key and repeat.
**Expected result:** Step 1 shows the "AI credits used X%" row (linking to
`/dashboard/settings/usage`). Step 2 shows nothing in that row at all — not a stale
0%/100%, the row is omitted entirely (`creditsUsedPercent={undefined}` from
`apps/web/app/(dashboard)/layout.tsx`, which now checks `getAiProviderConnection()`
before computing the percentage).
**Automated coverage:** none — pure rendering check, same gap as `discovery.md`
TC-DISCOVERY-004's own UI half.
