# Next activities — post Epic 5 (FSM) review

**Status as of this document:** Epics 0–4 (approvals/audit, monorepo framework, core
tenancy/licensing/RBAC, core shared domain, StockPilot/inventory port) and Epic 5 (FSM)
are complete except one explicitly blocked story. This document surveys
`docs/plan/04-CLAUDE-CODE-BACKLOG.md` against what's actually in the repo
(`docs/FSM-PROGRESS.md`, `docs/PORT-PROVENANCE.md`, and direct inspection) and lists
everything that's left, in the order the backlog itself prescribes. **Nothing in this
document has been implemented — it's a planning artifact for review.**

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
| GST/inventory (Epic 4) | `purchase_orders_instead_of_insert()`/`sales_orders_instead_of_insert()` compat-view triggers silently drop posted tax-amount fields (a pre-existing compat-view completeness gap, not something either the API layer or UI mutations caused) | `docs/PORT-PROVENANCE.md`, `SP-7` (public_api_v1 section) |
| Inventory onboarding | No auto-created first warehouse when an `inventory` license activates (StockPilot's own onboarding flow was deliberately not ported to avoid a second business-creation path) | `docs/PORT-PROVENANCE.md` |
| Supabase advisor findings | Several pre-existing `rls_enabled_no_policy` (`core.api_rate_limit_counters`, `demo_seed_batches`/`records` in `core` and `inventory`, `discovery.interest_signups`) and 47 `function_search_path_mutable` warnings on `inventory`'s compat-view triggers — never touched because they're outside every story's own scope, not because they're safe to ignore forever | Every `docs/FSM-PROGRESS.md` verification section from F-8 onward |
| Auth hardening | "Leaked Password Protection Disabled" (Supabase Auth setting) — a project-config toggle, not application code | Same advisor runs |

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
