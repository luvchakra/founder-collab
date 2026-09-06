# Claude Code execution backlog

> **Revision 1.1 — read `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` first.** The StockPilot audit is complete and the programme is now greenfield (new repo + new Supabase project); Part C of that document lists the corrections to this file.

House rules from the existing `CLAUDE.md` still apply and are **not** superseded by this plan: one story at a time, read only the files the story touches, simplest thing that works, no speculative functionality, no new dependency without justification, tenant-isolation tests mandatory, dev Supabase project only, focused commits, typecheck + lint + tests green before moving on.

Three additions for this programme:
- **Every story names its schema.** A story may create/alter tables only in the schema it declares.
- **Every story that touches a module declares its allowed imports.** Violating the boundary lint is a failed story, not a warning.
- **No story merges without its RLS test** (tenant isolation *and*, for module tables, license gating).

Notation: `[BLOCKER]` must finish before anything downstream. Sizes are rough: S ≈ half a day, M ≈ 1–2 days, L ≈ 3–5 days of agent+review time.

---

## Epic 0 — Approvals and audit `[BLOCKER]`

| ID | Story | Size |
|---|---|---|
| `A-1` | Write `docs/adr/0001-modular-platform.md` capturing: monorepo + module packages, `core` schema, DB-backed `core.domain_events`, `business_id` as tenant for fsm/inventory/crm/gst, license-aware RLS. Patch `CLAUDE.md` and `docs/engineering-blueprint.md` §41 to match. **Human approval required before Epic 1.** | S |
| `A-2` | `SP-0` source audit of `stockpilot-ai-ops` (see `03-STOCKPILOT-MIGRATION.md` §4). Output: findings note + confirm-or-replan verdict on mechanisms M1–M4. | S |
| `A-3` | Baseline snapshot: export the current `co-founder-ai` dev DB schema + a seeded dataset, and record current test/typecheck/lint status. This is the "nothing regressed" reference for Epic 1. | S |

---

## Epic 1 — Monorepo and module framework

| ID | Story | Schema | Size |
|---|---|---|---|
| `P-1` | Convert the repo to npm workspaces: `apps/web`, `packages/core`, `packages/module-registry`. Move the existing Next.js app into `apps/web` with **zero behaviour change**. Build, lint, typecheck, tests all green. | — | M |
| `P-2` | `packages/core`: move `lib/supabase`, `lib/tenancy`, `lib/ai`, `lib/crypto`, `components/ui` into it; re-export shims so existing imports keep working during the transition. | — | M |
| `P-3` | Module manifest type + `module-registry` with all 5 modules declared (key, name, icon, nav items, route prefix, permissions, optional peers). Nav is rendered from the registry. | — | S |
| `P-4` | Import-boundary enforcement: `eslint-plugin-boundaries` (or dependency-cruiser) rules + a migration-schema lint script + CI wiring. Include a deliberately-failing fixture test proving the rule bites. | — | S |
| `P-5` | Move discovery code into `packages/module-discovery` behind the boundary rules. Still zero behaviour change vs `A-3` baseline. | — | L |

---

## Epic 2 — Core: tenancy, licensing, RBAC

| ID | Story | Schema | Size |
|---|---|---|---|
| `C-1` | `core` schema + move/mirror `accounts`, `account_members`, `businesses`, `products`, `workspaces` resolution helpers into `core`; add `core.user_business_ids()` following the exact `security definer` + `auth.uid()` pattern of the existing tenancy migration. Keep `public.*` tables in place; `core` helpers wrap them. | core | M |
| `C-2` | `core.business_settings` (gstin, state, gst_registration_type, currency, timezone, locale, fiscal_year_start), `core.user_profiles`, `core.employees`, `core.business_members`. | core | M |
| `C-3` | `core.modules`, `core.licenses`, `core.license_events`; `core.has_module(business_id, key)` and `core.has_module_write(...)` (stable, security definer, grace-period aware). Seed the 5 module rows. | core | M |
| `C-4` | License lifecycle service: activate, deactivate (30-day read-only grace), reactivate, expire; publishes `license.activated`/`license.deactivated`; idempotent per-module seed hook. | core | M |
| `C-5` | Business switcher + active-business resolution in `proxy.ts`; entitlements loaded once per request; unlicensed module routes return 404. | core | M |
| `C-6` | Licenses admin UI (account settings): the 5 modules as cards, add/remove, state, grace countdown, per-business toggles. | — | M |
| `C-7` | `core.permissions` + `core.role_permissions` + `requirePermission()`; seed the Kickserv-derived permission matrix per module, honouring the non-disableable views. | core | M |
| `C-8` | **RLS + license test harness:** reusable helpers asserting, per table, that cross-business access fails and that unlicensed read/write behave per state. Every later story reuses this. | — | M |
| `C-9` | Performance check: seed ~100k rows across a licensed module table and confirm the `tenant AND licensed` policy pattern doesn't regress plans vs plain tenant RLS. Adjust the helper (inline-ability) if it does. | — | S |

---

## Epic 3 — Core: shared domain

| ID | Story | Schema | Size |
|---|---|---|---|
| `D-1` | `core.parties`, `core.party_roles`, `core.party_contacts`, `core.party_supplier_attrs` + queries/mutations + RLS + tests. | core | M |
| `D-2` | `core.addresses` (billing/shipping/service, parent, geo) + `core.tax_identities`. | core | M |
| `D-3` | Backfill: `public.prospects` → `core.parties` (role `prospect`), `public.contacts` → `core.party_contacts`; add `party_id` to prospects; discovery reads/writes through core going forward. Idempotent, re-runnable, with a rollback note. | core+public | L |
| `D-4` | `core.item_categories`, `core.items`, `core.item_inventory_attrs`, `core.tax_rates`. | core | M |
| `D-5` | `core.number_sequences` + `core.next_number(business_id, scope)` — concurrency-safe (advisory lock or `for update`), fiscal-year aware, gap-free per GST expectations. Tests must include a concurrent-caller test. | core | M |
| `D-6` | `core.documents` + `core.document_lines`: doc_type check constraint, per-type partial indexes, line-level tax snapshot columns, `source_module`, `source_ref jsonb`, totals recomputation function. | core | L |
| `D-7` | `core.payments` + `core.payment_allocations` + balance/aging views. | core | M |
| `D-8` | `core.tags` + `core.taggings` (scopes `work`/`contact`), `core.custom_field_defs` + `core.custom_field_values` (entity + optional service-type scope), `core.attachments` (Storage-backed). | core | L |
| `D-9` | `core.domain_events` + publisher + `core.jobs`-based drain loop (cron route), retries with backoff, `no_consumer` parking, replay-on-license-activation. Include a poison-message test. | core | M |
| `D-10` | `core.audit_log` + a write helper invoked by every state transition. | core | S |

---

## Epic 4 — Inventory migration (details in `03-STOCKPILOT-MIGRATION.md`)

`06-DECISIONS-LOCKED.md` trims this epic — no data migration, StockPilot ported to Next.js in full. Epic 4 is, in full:

| ID | Story | Size |
|---|---|---|
| `SP-3a` | `inventory` schema DDL — tables + enums, column-identical to StockPilot's shape (`org_id` kept as the column name, FK repointed to `core.businesses`) | M |
| `SP-3b` | Port the procedural layer: inventory-state trigger, stock-transfer RPCs, status-transition permission enforcement, GST engine, GSTR1 invoicing logic — with tests | L |
| `SP-4` | Compat views + `INSTEAD OF` triggers for the tables that merge into `core` (`organizations`→`core.businesses`, `customers`/`suppliers`→`core.parties`, `products`→`core.items`, order/invoice/PO/return tables→`core.documents`), each with a round-trip write test | L |
| `SP-7` | Port StockPilot's Next.js port (05 §A.2): copy `src/components/ui/*` and `src/components/*` verbatim into `@cofounderai/core/ui` and `module-inventory`; copy `src/lib/*` (gst, format, product-import, spreadsheet, barcode-scan, einvoice, eway-bill) verbatim; rewrite `client.ts`/`client.server.ts`/`auth-middleware.ts`/`auth-attacher.ts`/`cron-auth.ts` against `@cofounderai/core`; rewrite `useOrg`→business-scoped session, `useAuth`→platform auth; convert the 5 `createServerFn` action files to Next.js server actions; convert the 19 `_authenticated/*.tsx` routes to `page.tsx` + client component; adopt `scripts/test-tenant-rls.mjs` as the tenant-isolation harness baseline; promote `public_api_v1` + `api-v1` lib to `core`. **Size: XL** — split into sub-stories per route group if it runs long: config/master-data routes, transactional routes, GST routes, admin/api routes | XL |
| `SP-9` | Manifest, `contract/index.ts` (`reserveStock`, `releaseStock`, `consumeStock`, `getAvailability`, `listWarehouses`, `upsertItem`), event publish/subscribe wiring | M |

---

## Epic 5 — FSM (details in `02-FSM-PRD.md`)

| ID | Story | Size |
|---|---|---|
| `F-1` | `fsm` schema DDL: settings, service types, job charge types, opportunities, jobs, events, event_assignees, time_entries, expenses, notes, signatures, recurring_templates, portal_tokens, work_requests + RLS + license gating + tenant tests. | L |
| `F-2` | Opportunities: create, list (board + table), detail, tags, custom fields, lost with reason. | L |
| `F-3` | Estimates: charge lines from `core.items` + ad-hoc, reorder, taxable, charge type, detailed/summary view, totals via `core.documents`. | L |
| `F-4` | Public estimate page + send (email via Resend, already a dependency) + sent/viewed tracking + customer approve/decline → job creation. | L |
| `F-5` | Jobs: board, detail tabs, status machine, start/stop/hold/complete/cancel/duplicate, convert back to opportunity, job number, history. | L |
| `F-6` | Scheduling: calendar day/week by technician, work/estimate/reminder events, assign/unassigned lane, drag reschedule, print work orders (bulk). | L |
| `F-7` | Field execution: `/fsm/my-day`, clock in/out, charges, expenses, notes, attachments (photo/video/PDF), signature capture, "on my way" notify. | L |
| `F-8` | Invoicing: generate on completion or on demand, edit, GST computation via `core`, public invoice page, send, mark paid/unpaid, record manual payment, partial payments, void via credit note, aging. | L |
| `F-9` | Reminders: internal reminder events with employee notification lead time; automatic customer reminders (default 48h, email + SMS, arrival window). | M |
| `F-10` | Customer Center (tokenised portal: estimates, invoices, upcoming work) + embeddable contact form → `fsm.work_requests` → opportunity. Rate-limited, no auth. | L |
| `F-11` | Messages tab on jobs reading `core.messages`, participant notification rules. | M |
| `F-12` | Reports: jobs completed, revenue by service/tag/charge type, customer balances, account aging, payments, timecards, productivity. | L |
| `F-13` | **Discovery → FSM handoff**: consume `prospect.won`, add `customer` role to the existing party (assert no duplicate party), create opportunity, backlinks both ways, replay parked events on license activation. | M |
| `F-14` | **Inventory ↔ FSM integration**: job parts reserve on schedule, consume on completion via the inventory contract; graceful non-stocked fallback when unlicensed; `stock.low` surfaced to the dispatcher. | M |
| `F-15` | FSM settings screens: service types, charge types, message templates, document settings, reminder config, numbering. | M |

---

## Epic 6 — Skeletons and convergence

| ID | Story | Size |
|---|---|---|
| `S-1` | `crm` module skeleton: package, manifest, license key, nav entry, `crm` schema with `channels`, `tickets`, `routing_rules` (structure only), placeholder screens behind the license. | M |
| `S-2` | `gst` module skeleton: package, manifest, license key, nav, adopt the migrated `gst.einvoices` / `eway_bills` tables, placeholder screens, and a stub consumer of `document.issued`. | M |
| `S-3` | `core.threads` + `core.messages` + `core.message_templates`; migrate `public.messages` / `public.conversations` onto them behind views; discovery, FSM and CRM all read one message store. | L |
| `S-4` | Promote `ai_runs`, `ai_provider_credentials`, `usage_events` to `core`; all modules bill AI usage through one path. | M |
| `S-5` | Platform dashboard assembled from module-contributed widgets via the registry. | M |

(`S-6`, the optional `public` → `discovery` schema rename, is deleted per `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` Part B.2 — there is no legacy `public` schema to rename in a greenfield build.)

---

## Definition of done (per story)

1. Migration files are in the single platform timeline and are reversible or explicitly documented as irreversible.
2. RLS on, tenant-isolation test written, license-gating test written where applicable.
3. Import boundaries respected; no cross-module internal imports.
4. No new entity that duplicates a concept already owned in the ownership map (`00-MASTER-PLAN.md` §5).
5. Typecheck, lint, tests green; focused commit; no unrelated refactors.
6. If the story revealed that this plan is wrong, the plan is updated in the same commit — the docs are the contract, and a silently-outdated contract is worse than no contract.

---

## Suggested kickoff prompt for Claude Code

> Read `docs/plan/00-MASTER-PLAN.md` §§1–7 and `docs/plan/04-CLAUDE-CODE-BACKLOG.md`. Do not write any application code yet. Execute story `A-1` only: write the ADR, and prepare (but do not commit) the proposed patches to `CLAUDE.md` and `docs/engineering-blueprint.md` §41. Report back with the ADR and the diffs for approval.
