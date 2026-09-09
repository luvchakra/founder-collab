# Next activities — post Epic 5 (FSM) review

**Status as of this document:** Epics 0–4 (approvals/audit, monorepo framework, core
tenancy/licensing/RBAC, core shared domain, StockPilot/inventory port) and Epic 5 (FSM)
are complete except one explicitly blocked story. This document surveys
`docs/plan/04-CLAUDE-CODE-BACKLOG.md` against what's actually in the repo
(`docs/FSM-PROGRESS.md`, `docs/PORT-PROVENANCE.md`, and direct inspection) and lists
everything that's left, in the order the backlog itself prescribes. **Nothing in this
document has been implemented — it's a planning artifact for review.**

**Update (2026-09-08):** §§1–2 below are now historical — Epic 6 is complete (S-1
through S-5, see `docs/EPIC6-PROGRESS.md`) and `F-11` shipped as part of it. The GST/
inventory compat-view gap in §3's table has also since been fixed (noted inline). §6 and
§7, appended the same day, are new pending activities from two uploaded review documents
(a UX audit and a set of manual test-case documents) — neither has been actioned yet
beyond what's noted in each section.

---

## 1. Immediately next: finish Epic 6 (Skeletons and convergence)

Per `04-CLAUDE-CODE-BACKLOG.md`, Epic 6 is the last epic in the plan and is entirely
unstarted (one story, `S-4`'s prerequisite table, is partially in place under a
different owner — see below). Recommended order, since later stories in this epic
depend on earlier ones:

### S-3 — `core.threads` + `core.messages` + `core.message_templates` (size L) — do this first
This is the **highest-leverage item left**: it unblocks two already-known gaps at once.
- `F-11` (FSM Messages tab) has been sitting **Blocked** since F-1, documented in
  `docs/FSM-PROGRESS.md`'s "Known blockers" section, for exactly this reason.
- `F-15`'s settings screen documented "message templates" as unbuildable for the same
  reason (no `core.message_templates` table exists — confirmed by grep, not assumed).
- Discovery and CRM (once CRM exists, see S-1) would also read from this one store per
  the backlog's own framing ("discovery, FSM and CRM all read one message store").
- Scope per the backlog: migrate `public.messages`/`public.conversations` (discovery's
  current message tables) onto the new `core` tables behind compat views, so discovery
  keeps working unchanged while FSM and CRM get a real message store to read from.

### S-1 — `crm` module skeleton (size M)
Package, manifest, license key, nav entry, `crm` schema with `channels`/`tickets`/
`routing_rules` (structure only), placeholder screens behind the license. No
`packages/module-crm` exists at all today.

### S-2 — `gst` module skeleton, remaining scope (size M)
The `gst` module package, license, and nav already exist and are more built-out than a
"skeleton" (GST Profile, e-Way Bill, e-Invoicing credential forms, and GST Filing
reports are all real, per `docs/PORT-PROVENANCE.md`). What's still explicitly open from
this story and later GST-related notes in the same doc:
- **A `document.issued` consumer.** FSM (F-8) and inventory both publish
  `document.issued`; nothing subscribes to it yet, so every one of those events sits
  unprocessed. This is S-2's own literal spec line ("a stub consumer of
  `document.issued`").
- **`eway_bills`/`einvoices` generation-history tables** and the actual "generate a
  bill/IRN from a sales order" workflow (the credential forms exist; the generate/cancel
  actions and history tables behind them do not).
- **Print/CSV-export/e-way-bill/e-invoice panels on Sales Invoices** — deferred during
  the inventory port (`SP-7e`/`SP-7f`), still open.
- **Barcode/QR scanning** — deferred throughout the inventory port, never picked up.

### S-4 — Promote `ai_runs`/`ai_provider_credentials`/`usage_events` to `core` (size M)
Confirmed still living only in the `discovery` schema (`20260906100000_discovery_schema.sql`),
not promoted. Needed before any other module (FSM, CRM, GST) can bill its own AI usage
through one shared path, per the backlog's own framing.

### S-5 — Platform dashboard from module-contributed widgets (size M)
Confirmed **not built**: `apps/web/app/(dashboard)/dashboard/page.tsx` today is a
discovery-specific KPI page (conversion funnel, credit usage), not a
registry-assembled, per-module widget dashboard. This is naturally the last Epic 6 story
— it depends on every module having something worth contributing.

**A wrinkle worth deciding before S-5 (or before any further nav work in any module):**
`packages/module-registry/src/index.ts` is still the *placeholder* registry the file's
own comment describes — each module has only a single `{ label: "Overview", href: "/x" }`
nav entry, and the real per-module navigation actually rendered in the sidebar today
(`SERVICE_NAV`, `INVENTORY_NAV`, `GST_NAV`) is hardcoded separately in
`packages/core/src/components/shell/app-sidebar.tsx`, not sourced from each module's own
`manifest.ts` (which `module-fsm` and `module-inventory` both now have, per `F-1`/`SP-9`,
but which nothing actually reads). Wiring the sidebar to consume real manifests is
implied by `P-3`'s original spec ("Nav is rendered from the registry") but was never
finished. Worth a decision: fold this into `S-5`, or treat it as its own small story
before `S-5` so the dashboard-widget work doesn't inherit the same shortcut.

---

## 2. The one blocked FSM story

### F-11 — Messages tab on jobs (size M)
Cannot start until `S-3` lands. Once it does: read `core.messages` for a job's thread,
enforce the messaging permission for staff/techs (admins see everything per the PRD),
and wire participant notification (creator, estimate/invoice sender, assigned worker).

---

## 3. Deferred items inside epics already marked "done"

These aren't blocking anything and aren't on the critical path, but they're real,
documented gaps worth a deliberate decision (build later vs. explicitly drop) rather
than leaving indefinitely implicit:

| Area | Gap | Where documented |
|---|---|---|
| FSM settings (F-15) | Company logo + document footer branding — no upload/storage infra exists for it yet | `docs/FSM-PROGRESS.md` §F-15 |
| FSM reminders (F-9) | No per-employee "notification lead time" column; both reminder kinds share one business-wide `reminder_lead_hours` | `docs/FSM-PROGRESS.md` §F-9 |
| FSM invoicing (F-8) / customer center (F-10) | No online payment link (explicit PRD SHOULD/LATER item) | `docs/FSM-PROGRESS.md` §F-8/F-10 |
| FSM ↔ inventory (F-14) | Single-warehouse assumption (first active warehouse only); a job with no originating estimate has no "parts" source at all | `docs/FSM-PROGRESS.md` §F-14 |
| GST/inventory (Epic 4) | ~~`purchase_orders_instead_of_insert()`/`sales_orders_instead_of_insert()` compat-view triggers silently drop posted tax-amount fields~~ — **Fixed 2026-09-08**, `supabase/migrations/20260908150000_inventory_compat_view_tax_fields_fix.sql` | `docs/PORT-PROVENANCE.md`, `SP-7` (public_api_v1 section) |
| Inventory onboarding | No auto-created first warehouse when an `inventory` license activates (StockPilot's own onboarding flow was deliberately not ported to avoid a second business-creation path) | `docs/PORT-PROVENANCE.md` |
| Supabase advisor findings | Several pre-existing `rls_enabled_no_policy` (`core.api_rate_limit_counters`, `core.number_sequences`, `demo_seed_batches`/`records` in `core` and `inventory`, `discovery.interest_signups`), 47 `function_search_path_mutable` warnings on `inventory`'s compat-view triggers, and `public.rls_auto_enable()` being callable by `anon`/`authenticated` as `SECURITY DEFINER` (noticed 2026-09-09, re-running `get_advisors` after an unrelated migration) — never touched because they're outside every story's own scope, not because they're safe to ignore forever | Every `docs/FSM-PROGRESS.md` verification section from F-8 onward; `docs/testing/EXECUTION-2026-09-08.md` finding 3's own verification |
| Auth hardening | "Leaked Password Protection Disabled" (Supabase Auth setting) — a project-config toggle, not application code | Same advisor runs |
| Licensing (ADR-9) | ~~`expireGracePeriods()` exists and is correct but nothing calls it~~ — **Fixed 2026-09-08**: `apps/web/app/api/cron/expire-licenses/route.ts` (same shared-secret auth as `drain-events`/`send-reminders`) calls it daily, wired into `vercel.json`'s `crons`. `scripts/test-core-license-lifecycle.mjs` (new, in `test:db`) covers the full active→grace→expired→reactivated cycle end to end, including the exact backdated-`grace_ends_at` fixture `TC-CORE-003` itself calls for | `docs/testing/EXECUTION-2026-09-08.md` finding 1, from `TC-CORE-003` |
| FSM ↔ inventory (F-14) | ~~`cancelJob()` never releases stock `reserveJobParts()` reserved on scheduling~~ — **Fixed 2026-09-09**: new `releaseJobParts()` mirrors `consumeJobParts()`'s own release step, called from `cancelJob()`. Live-verified the exact RPC mechanism against dev (rolled-back transaction). **Follow-up still open:** no dedicated automated test at the fsm-integration level yet — the RPC itself is covered generically by `test-inventory-procedural.mjs`, but not this specific job-cancellation call path | `docs/testing/EXECUTION-2026-09-08.md` finding 2, from `TC-FSM-011` |
| GST credentials | ~~`gst.eway_bill_credentials`/`einvoice_credentials`'s `gsp_password`/`client_secret` were plaintext (access-control-only)~~ — **Fixed 2026-09-09**: renamed to `encrypted_gsp_password`/`encrypted_client_secret`, encrypted the same AES-256-GCM way BYOK's `encrypted_api_key` already was (`encryptApiKey()`/`decryptGspSecrets()`). New unit test + updated RLS test + live-applied to dev, no new advisor findings | `docs/testing/EXECUTION-2026-09-08.md` finding 3, from `TC-GST-001` |
| Licensing enforcement (architecture doc) | `requireModule()`, named by `CLAUDE.md` as one of licensing's four required enforcement layers, doesn't exist anywhere in the codebase — ordinary in-module writes rely on RLS alone, with no app-layer license check of their own | `docs/testing/EXECUTION-2026-09-08.md` finding 4, from `TC-CORE-001` |
| Platform shell — sidebar entitlement filtering | ~~`apps/web/app/(dashboard)/layout.tsx` passed the raw, unfiltered `moduleRegistry` into the shell~~ — **Fixed 2026-09-08** (the sidebar/switcher-visibility half only; see the next row for the still-open "informative page on direct access" half): `core/licensing/queries.ts`'s new `listLicensedModuleKeysByBusiness()` (batched, RLS-scoped) feeds `DashboardChrome`, which now filters `modules` by the active business's active-or-grace licenses before it ever reaches `AppSidebar`/`module-selector.tsx`. `scripts/test-core-licensed-modules-by-business.mjs` (in `test:db`) covers the new batched-query tenant isolation; live-confirmed against the real "Aroma Adorn" business (`discovery`+`fsm` only). `proxy.ts`'s route guard still returns a bare 404 for direct/typed access to an unlicensed route — unchanged by this fix | `docs/testing/EXECUTION-2026-09-08.md` finding 5, from `TC-SHELL-002`/`TC-MENU-LIC-001`/`TC-MENU-LIC-002` |
| FSM — two nav items 404 | ~~`fsm`'s own root/"Dashboard" nav item and its "Customers" item had no route on disk at all~~ — **Fixed 2026-09-08**: `fsm/page.tsx` is now a real dispatcher dashboard (today's schedule, unassigned queue, jobs in progress, overdue invoices, estimates awaiting response — all five PRD §5 widgets); `fsm/customers/page.tsx` lists `core.parties` holding the `customer` role, per PRD §5's own spec. `menu-routes.test.ts`'s `KNOWN_FAILING` set removed — all 31 tests assert for real now | `docs/testing/EXECUTION-2026-09-08.md` finding 6, from `TC-MENU-FSM-001`/`TC-MENU-FSM-002` |
| Platform shell — "not licensed" UX (new requirement, not built) | Reaching an unlicensed/cancelled/grace-expired module (via the sidebar bug above, a direct link, bookmark, or stale link) currently hits an undefined/bare-404 state. Test cases refined 2026-09-08 (uploaded revision) now spec a specific informative page instead: names the module, states the reason (not licensed / cancelled / grace period, sourced from `core.license_events`' real status), and links to `/dashboard/settings/licenses` to activate/reactivate — distinct from a genuine "this route never existed" 404. The licenses settings page itself should also state per-module status/grace-end-date/one-click activate clearly, since every one of these pages links back to it | `docs/testing/test-cases/{core,menu-smoke,platform-shell}.md` (`TC-CORE-001`/`002`/`003`, `TC-MENU-LIC-001`/`002`, `TC-SHELL-002`/`006`) |
| GST/inventory (Epic 4/S-2) | Print/CSV-export panels on Sales Invoices — still open from the original credentials-schema slice's own deferral, independent of GST itself | `docs/EPIC6-PROGRESS.md` §S-2 "Deferred" |
| Inventory (Epic 4) | Barcode/QR *scanning* (camera-integration) — SHOULD/LATER tier, never picked up; distinct from barcode/QR *label generation* and CSV *import*, both of which already exist (`components/products/barcode-label-dialog.tsx`, `lib/products/csv.ts`) | `docs/EPIC6-PROGRESS.md` §S-2 "Deferred" |

---

## 4. Documentation hygiene (no code, just doc accuracy)

- **`docs/PORT-PROVENANCE.md`'s network note is stale.** It records that this session's
  environment couldn't reach the `jazdtomcgqjxjueedmck` Supabase project as of
  2026-09-06 and that the `discovery` schema migration had "never been applied to it."
  That's no longer true — every FSM story (F-8 through F-15) in this session applied
  migrations to and live-verified against that exact project successfully. The note
  should be corrected or removed so a future reader doesn't distrust a project that's
  actually live and working.
- `docs/FSM-PROGRESS.md`'s Epic 5 summary (just added) is accurate as of F-15; keep it
  current as F-11 eventually unblocks.

---

## 5. Suggested sequencing if this is approved as-is

1. `S-3` (`core.threads`/`messages`/`message_templates`) — unblocks F-11 and FSM's
   message-templates settings gap in one story.
2. `F-11` (Messages tab) — small, immediately unblocked by #1.
3. Decide + resolve the module-registry/manifest-vs-hardcoded-nav question (small, or
   fold into #5).
4. `S-2` remaining scope (`document.issued` consumer + generation-history tables) — a
   real functional gap in a module already partly built, cheaper to close now than
   after more stories build on top of the current placeholder GST screens.
5. `S-1` (crm skeleton) — independent, can run in parallel with #4.
6. `S-4` (promote AI usage tables to `core`) — independent, no urgency, but unblocks any
   future module wanting to bill AI usage through one path.
7. `S-5` (platform dashboard) — last, since it wants every module to have something to
   contribute.
8. Revisit the deferred items in §3 as their own small follow-up stories, prioritized by
   whoever is deciding product priority (they're not architecturally blocking anything).

Fix the stale doc note (§4) whenever convenient — it costs nothing and has no
dependencies.

---

## 6. Pending: UX audit findings (uploaded 2026-09-08, not yet actioned)

An external static-analysis UX audit (`docs/UX-AUDIT.md`-shaped upload, not yet copied
into this repo) reviewed `main` against `docs/DESIGN.md`'s own spec — grep-verified
counts, not a rendered-browser walkthrough. Nothing below has been built; this is a
tracking entry per the user's explicit "add these as pending activities" request, not a
decision to build them next. Original recommended order preserved.

**P0 — trust and safety, platform-wide:**
1. Destructive actions (void/cancel/delete — 29 files) almost never confirm first; only
   `delete-demo-data-button.tsx` uses the existing `AlertDialog` primitive.
2. `sonner.tsx` (toast) is vendored in `packages/core/src/components/ui/` but `toast()`
   is called zero times anywhere and no `<Toaster />` is mounted.
3. Auth flows (`auth-form.tsx`, `reset-password-form.tsx`, `forgot-password-form.tsx`)
   use raw `type="submit"` with no pending/spinner state, despite `submit-button.tsx`
   already existing in `core` for this.
4. `fsm` is internally inconsistent on the pending-state pattern: 7 of ~14 form
   components (including the money-handling `invoice-editor.tsx`/`estimate-builder.tsx`)
   still use raw `type="submit"`.
5. No `loading.tsx` exists anywhere under `inventory`, `fsm`, `crm`, or `gst` routes
   (10 exist, all under `discovery`/account settings).

**P1 — usability at platform scale:**
6. Mobile responsiveness is thin everywhere (14–32% of `.tsx` files per module use any
   `sm:`/`md:`/`lg:` breakpoint) — flagged as worth a dedicated per-module pass, not
   incidental fixes; largest single effort in this list.
7. Global search (specified in `DESIGN.md`'s topbar spec) was never built; `command.tsx`
   (cmdk) is vendored and unused. Needs a decision — build it, or update `DESIGN.md`.
8. `Breadcrumb` is used in only 4 files despite a commit message suggesting platform-wide
   intent.
9. `skeleton.tsx` is vendored but used in only 9 files platform-wide.
10. `AppTopbar` deliberately diverges from `DESIGN.md`'s avatar/name/email spec (moved to
    the sidebar drawer instead, per an inline code comment) — the doc should be updated
    to match reality, or the shell brought back in line with it.

**P2 — polish:**
11. Only 81 `aria-label` occurrences across ~475 `.tsx` files, thin relative to
    `DESIGN.md`'s own dense-table/icon-only-action-button spec — worth an audit pass on
    `inventory`/`fsm` table row actions specifically.
12. `crm`'s 3 view components use raw `type="submit"` and no `AlertDialog`/toast —
    expected for a still-skeleton module, flagged so it adopts platform patterns from its
    next story rather than needing a retrofit later.
13. Sidebar and stage-tab components have been rebuilt repeatedly (6+ commits each) —
    worth consolidating into one documented canonical component.

**Suggested order (from the audit itself, not re-decided here):** P0 items 1–2 first
(they're platform-wide primitives everything else benefits from), then 3–5, then P1's
mobile pass (6) scoped as its own story per module.

## 7. Test-case documents (uploaded 2026-09-08, four revisions, landed into the repo)

A sequence of uploads provided manually-written, story-traced feature/workflow
test-case markdown documents, authored against commit `4226905` (this repo's own `S-1`
commit, since advanced), each revising/extending the last:
- **Rev 1-2:** `docs/testing/TESTING_STRATEGY.md` +
  `docs/testing/test-cases/{INDEX,core,crm,discovery,fsm,gst,inventory,platform-shell}.md`
  (rev 2 added `docs/UX-AUDIT.md`, tracked separately in §6) — additive to, not a
  duplicate of, the existing `scripts/test-*-rls.mjs` suite.
- **Rev 3:** added `docs/testing/test-cases/menu-smoke.md` + a real automated test,
  `apps/web/tests/menu-routes.test.ts` — and reported 3 confirmed-failing menu items
  (now in §3's table above: the sidebar license-filter bug and 2 `fsm` 404s).
- **Rev 4:** refined `TC-CORE-001/002/003`, `TC-MENU-LIC-001/002`, and
  `TC-SHELL-002/006` to spec an informative "not licensed" page instead of a bare
  404/undefined state — a new, not-yet-built UX requirement, now in §3's table above.

**Status: landed.** All of `docs/testing/TESTING_STRATEGY.md`,
`docs/testing/test-cases/*.md` (including `menu-smoke.md`), and
`apps/web/tests/menu-routes.test.ts` are committed into the repo and wired into
`npm test --workspaces` (the new test: 29 passed, 2 expected-fail, confirming the two
`fsm` 404s live). Execution results, including the two corrections rev 3 forced onto
this session's own first pass, are in `docs/testing/EXECUTION-2026-09-08.md`. What's
still genuinely pending (not yet built/fixed) from all four revisions is tracked in §3's
table, not here.

## 8. Pending: UI/UX uniformity, settings panel, beautification, responsive design (uploaded 2026-09-09)

A sixth upload, `docs/UI-UX-UNIFORMITY.md` (landed into the repo same commit as this
section), is a companion to the §6 audit — four new angles it didn't cover. Directly
responsive to the user's own explicit ask this session ("make the layout uniform...
give subtle colour differences where required"). Status per item:

- **§1a/1b (currency/date formatting inconsistency, P0, mechanical) — actioned this
  session**, see the commit that lands alongside this doc: consolidated onto the
  shared `inr`/`formatDate` from `core/lib/format.ts` everywhere a component had its
  own `Intl.NumberFormat`/date-options object.
- **§1e (stale "co-founder-ai" copy in Appearance settings) — actioned this session**,
  same commit: corrected to the platform's actual name.
- **§1c (no shared `EmptyState` component)** — not built. Real fix, but a new
  primitive + incremental migration across ~15 call sites, deferred rather than
  rushed.
- **§1d (3 hardcoded hex colors bypassing the design-token system)** — not fixed;
  `packages/core/src/components/ui/chart.tsx`, `module-fsm`'s `signature-pad.tsx`,
  `module-discovery`'s `fsm-handoff-panel.tsx`.
- **§2 (a real Display/Settings preferences panel** — density, date/number locale,
  reduce-motion, sidebar default state, default landing module, backed by a new
  `core.user_preferences` table) — not built; a genuine new feature, not a bug fix,
  needs its own story-sized effort.
- **§3 (beautification: icon-button sizing consistency, one status-color mapping
  platform-wide, header rhythm)** — not actioned; needs a visual audit pass, not just
  a grep-driven fix.
- **§4 (responsive: card-view fallback for dense tables, tablet-width sidebar
  behavior, touch-target sizing, form field stacking, `fsm`'s field/My-Day screens as
  the priority target)** — not actioned; the audit's own suggested order puts this
  after §1/§2, and it's the largest remaining effort in either UX document.

Tracking only — items not explicitly called out above as "actioned this session" have
not been built.
