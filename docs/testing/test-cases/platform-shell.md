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

### TC-SHELL-005: AI chat widget and alert bell are genuinely wired to real data
**Feature:** `03a7280` — "Wire real alert bell and AI chat widget into the platform shell."
**Priority:** P1 · **Story:** post-port polish
**Steps:**
1. Trigger a condition that should produce an alert (e.g. usage threshold, needs-action prospect).
2. Check the alert bell.
3. Ask the chat widget about current business/module state.
**Expected result:** Both reflect real, current data — not the ported placeholder/demo
content from either source repo.

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
