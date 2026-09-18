# WonderArk platform — progress tracker

<!-- GENERATED FILE — do not edit by hand. Run `npm run build:progress`. -->

Every story in every backlog under `docs/plan/`, and whether it is built. Generated
from the backlogs themselves plus the repository: this codebase cites a story's id in
the code, migration or test that implements it, so a story whose id appears outside
`docs/plan/` has been worked and one whose id appears nowhere has not. Where that
evidence does not apply — the short ids of the platform build-out epics, a story
deliberately deferred, one built before the citing convention — the status is curated
in `docs/progress-overrides.json`, with a note saying why. ❔ Unverified means the id
appears only in an audit or test-case document: somebody wrote about the story, but no
code cites it, so it is counted as outstanding rather than assumed shipped.

Regenerate after finishing a story: `npm run build:progress`. `npm test` fails if this
file is stale, so it cannot quietly drift out of date.

## Where the platform stands

| | Stories |
|---|---|
| ✅ Done | 269 |
| 🟡 In progress | 0 |
| ⏸️ Deferred | 1 |
| 🔁 Superseded | 30 |
| ❔ Unverified | 5 |
| ⛔ Blocked | 0 |
| ⬜ Not started | 86 |
| **Total** | **391** |

| Backlog | Done | Set aside | Remaining | Total |
|---|---|---|---|---|
| [Platform build-out](./plan/04-CLAUDE-CODE-BACKLOG.md) | 52 | 1 | 12 | 65 |
| [Platform Administration Portal](./plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md) | 79 | 0 | 31 | 110 |
| [Discovery — offering-centric upgrade](./plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md) | 51 | 0 | 7 | 58 |
| [Discovery — opportunity intelligence](./plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md) | 0 | 30 | 0 | 30 |
| [Compliance / Finance — global tax](./plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md) | 87 | 0 | 41 | 128 |

## What is left

91 stories are neither built nor deliberately set aside:

| ID | Story | Status | Note |
|---|---|---|---|
| `FIN-1` | Finance exceptions queue | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-2` | Backfill | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-3` | Activation wizard | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-4` | Finance invoice view | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-5` | Cash flow statement | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-6` | Operational reports | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-7` | Report drill-down | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-8` | Bank rules | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-9` | Dimensions | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-10` | Seed data | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-11` | End-to-end edge cases | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-12` | Explainable accounting, in reverse | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `PLATFORM-P0-10.4` | AI Feature Kill Switch | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `PLATFORM-P0-16.4` | Configuration History | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `PLATFORM-P1-01.1` | Configuration Export | ⬜ Not started | — |
| `PLATFORM-P1-01.2` | Configuration Import | ⬜ Not started | — |
| `PLATFORM-P1-01.3` | Secret Exclusion | ⬜ Not started | — |
| `PLATFORM-P1-02.2` | Temporary Entitlement | ⬜ Not started | — |
| `PLATFORM-P1-02.3` | Override Audit | ⬜ Not started | — |
| `PLATFORM-P1-04.2` | Trial Configuration | ⬜ Not started | — |
| `PLATFORM-P1-04.3` | Grace Period | ⬜ Not started | — |
| `PLATFORM-P1-04.4` | Cancellation Behavior | ⬜ Not started | — |
| `PLATFORM-P1-05.1` | Currency | ⬜ Not started | — |
| `PLATFORM-P1-05.2` | Billing Provider | ⬜ Not started | — |
| `PLATFORM-P1-05.3` | Tax on Subscription Billing | ⬜ Not started | — |
| `PLATFORM-P1-05.4` | Price Versioning | ⬜ Not started | — |
| `PLATFORM-P1-06.1` | API Policy | ⬜ Not started | — |
| `PLATFORM-P1-06.2` | API Key Management | ⬜ Not started | — |
| `PLATFORM-P1-06.3` | Webhook Policies | ⬜ Not started | — |
| `PLATFORM-P1-06.4` | API Usage Dashboard | ⬜ Not started | — |
| `PLATFORM-P1-07.1` | System Health | ⬜ Not started | — |
| `PLATFORM-P1-07.2` | Error Rate | ⬜ Not started | — |
| `PLATFORM-P1-07.3` | Queue Health | ⬜ Not started | — |
| `PLATFORM-P1-07.4` | Operational Alerts | ⬜ Not started | — |
| `PLATFORM-P1-08.1` | Platform Version | ⬜ Not started | — |
| `PLATFORM-P1-08.2` | Feature Rollout | ⬜ Not started | — |
| `PLATFORM-P1-08.3` | Rollback Flag | ⬜ Not started | — |
| `PLATFORM-P1-09.1` | Terms & Privacy Version | ⬜ Not started | — |
| `PLATFORM-P1-09.2` | Cookie / Consent Configuration | ⬜ Not started | — |
| `PLATFORM-P1-09.4` | Policy Acceptance Tracking | ⬜ Not started | — |
| `PLATFORM-P0-18.3` | Least Privilege | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `PLATFORM-P0-19.3` | Desktop Tables | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `PLATFORM-P0-19.5` | Professional Layout Rule | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `DISC-OFFER-P0-03.1` | Offering Context Selector | ⬜ Not started | — |
| `DISC-OFFER-P1-01.3` | Account Watchlist | ⬜ Not started | — |
| `DISC-OFFER-P1-01.4` | Grouped Opportunity Alerts | ⬜ Not started | — |
| `DISC-OFFER-P1-02.3` | Offering Performance Analysis | ⬜ Not started | — |
| `DISC-OFFER-P1-03.3` | Provider-Agnostic Data Contracts | ⬜ Not started | — |
| `DISC-OFFER-P1-04.3` | Offering-Specific Contact Relevance | ⬜ Not started | — |
| `DISC-OFFER-P1-05.4` | Offering Overview UX Polish | ⬜ Not started | — |
| `COMPLY-P1-05.1` | VAT Registration | ⬜ Not started | — |
| `COMPLY-P1-05.2` | VAT Return | ⬜ Not started | — |
| `COMPLY-P1-05.3` | EmaraTax Adapter | ⬜ Not started | — |
| `COMPLY-P1-05.4` | VAT Mismatch Review | ⬜ Not started | — |
| `COMPLY-P1-05.5` | Voluntary Disclosure | ⬜ Not started | — |
| `COMPLY-P1-05.6` | UAE E-Invoicing Readiness | ⬜ Not started | — |
| `COMPLY-P1-06.1` | ZATCA Registration Context | ⬜ Not started | — |
| `COMPLY-P1-06.2` | Fatoora Adapter | ⬜ Not started | — |
| `COMPLY-P1-06.3` | Structured Invoice Validation | ⬜ Not started | — |
| `COMPLY-P1-06.4` | Clearance/Reporting | ⬜ Not started | — |
| `COMPLY-P1-06.5` | QR/Security Evidence | ⬜ Not started | — |
| `COMPLY-P1-06.6` | Integration-Wave Tracking | ⬜ Not started | — |
| `COMPLY-P1-07.1` | Australia GST | ⬜ Not started | — |
| `COMPLY-P1-07.2` | BAS | ⬜ Not started | — |
| `COMPLY-P1-07.3` | Peppol eInvoicing | ⬜ Not started | — |
| `COMPLY-P1-07.4` | New Zealand GST | ⬜ Not started | — |
| `COMPLY-P1-07.5` | NZ Filing Frequency | ⬜ Not started | — |
| `COMPLY-P1-08.1` | Malaysia SST | ⬜ Not started | — |
| `COMPLY-P1-08.2` | Thailand VAT | ⬜ Not started | — |
| `COMPLY-P1-08.3` | Indonesia VAT/e-Faktur | ⬜ Not started | — |
| `COMPLY-P1-08.4` | Japan Consumption Tax/Qualified Invoice | ⬜ Not started | — |
| `COMPLY-P1-08.5` | South Korea VAT/e-Tax Invoice | ⬜ Not started | — |
| `COMPLY-P1-09.1` | Common Adapter Contract | ⬜ Not started | — |
| `COMPLY-P1-09.2` | Secure Credential Store | ⬜ Not started | — |
| `COMPLY-P1-09.3` | Submission Idempotency | ⬜ Not started | — |
| `COMPLY-P1-09.4` | Retry Handling | ⬜ Not started | — |
| `COMPLY-P1-09.5` | Integration Health | ⬜ Not started | — |
| `COMPLY-P1-10.1` | "What do I need to file?" | ⬜ Not started | — |
| `COMPLY-P1-10.2` | Explain My Tax | ⬜ Not started | — |
| `COMPLY-P1-10.3` | Explain a Mismatch | ⬜ Not started | — |
| `COMPLY-P1-10.4` | Filing Readiness Summary | ⬜ Not started | — |
| `COMPLY-P1-10.5` | Anomaly Detection | ⬜ Not started | — |
| `COMPLY-P1-10.6` | Compliance Research Assistant | ⬜ Not started | — |
| `COMPLY-P1-11.1` | Risk Register | ⬜ Not started | — |
| `COMPLY-P1-11.2` | Risk Severity | ⬜ Not started | — |
| `COMPLY-P1-11.3` | Risk Owner | ⬜ Not started | — |
| `COMPLY-P1-11.4` | Remediation Workflow | ⬜ Not started | — |
| `COMPLY-P1-12.2` | FSM Tax Readiness | ⬜ Not started | — |
| `COMPLY-P1-12.3` | CRM Customer Tax Context | ⬜ Not started | — |
| `COMPLY-P1-12.4` | Payment-to-Tax Reconciliation | ⬜ Not started | — |
| `COMPLY-P1-12.5` | Core Domain Events | ⬜ Not started | — |

## Platform build-out

Source: [`docs/plan/04-CLAUDE-CODE-BACKLOG.md`](./plan/04-CLAUDE-CODE-BACKLOG.md)

### Epic 0 — Approvals and audit [BLOCKER]

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `A-1` | Write docs/adr/0001-modular-platform.md capturing | ✅ Done | Epic 0 complete — `docs/NEXT-ACTIVITIES.md` |
| `A-2` | SP-0 source audit of stockpilot-ai-ops | ✅ Done | Epic 0 complete — `docs/NEXT-ACTIVITIES.md` |
| `A-3` | Baseline snapshot | ✅ Done | Epic 0 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 1 — Monorepo and module framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `P-1` | Convert the repo to npm workspaces | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-2` | packages/core | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-3` | Module manifest type + module-registry with all 5 modules declared | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-4` | Import-boundary enforcement | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-5` | Move discovery code into packages/module-discovery behind the boundary rules | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 2 — Core: tenancy, licensing, RBAC

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `C-1` | core schema + move/mirror accounts, account_members, businesses, products, workspaces resolution helpers into core; add  | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-2` | core.business_settings (gstin, state, gst_registration_type, currency, timezone, locale, fiscal_year_start), core.user_p | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-3` | core.modules, core.licenses, core.license_events; core.has_module(business_id, key) and core.has_module_write(...) | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-4` | License lifecycle service | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-5` | Business switcher + active-business resolution in proxy.ts; entitlements loaded once per request; unlicensed module rout | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-6` | Licenses admin UI | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-7` | core.permissions + core.role_permissions + requirePermission(); seed the Kickserv-derived permission matrix per module,  | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-8` | RLS + license test harness | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-9` | Performance check | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 3 — Core: shared domain

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `D-1` | core.parties, core.party_roles, core.party_contacts, core.party_supplier_attrs + queries/mutations + RLS + tests. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-2` | core.addresses (billing/shipping/service, parent, geo) + core.tax_identities. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-3` | Backfill | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-4` | core.item_categories, core.items, core.item_inventory_attrs, core.tax_rates. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-5` | core.number_sequences + core.next_number | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-6` | core.documents + core.document_lines | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-7` | core.payments + core.payment_allocations + balance/aging views. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-8` | core.tags + core.taggings (scopes work/contact), core.custom_field_defs + core.custom_field_values (entity + optional se | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-9` | core.domain_events + publisher + core.jobs-based drain loop (cron route), retries with backoff, no_consumer parking, rep | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-10` | core.audit_log + a write helper invoked by every state transition. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 4 — Inventory migration (details in 03-STOCKPILOT-MIGRATION.md)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `SP-3a` | inventory schema DDL | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-3b` | Port the procedural layer | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-4` | Compat views + INSTEAD OF triggers for the tables that merge into core (organizations→core.businesses, customers/supplie | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-7` | Port StockPilot's Next.js port | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-9` | Manifest, contract/index.ts (reserveStock, releaseStock, consumeStock, getAvailability, listWarehouses, upsertItem), eve | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |

### Epic 5 — FSM (details in 02-FSM-PRD.md)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `F-1` | fsm schema DDL | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-2` | Opportunities | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-3` | Estimates | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-4` | Public estimate page + send (email via Resend, already a dependency) + sent/viewed tracking + customer approve/decline → | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-5` | Jobs | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-6` | Scheduling | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-7` | Field execution | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-8` | Invoicing | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-9` | Reminders | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-10` | Customer Center | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-11` | Messages tab on jobs reading core.messages, participant notification rules. | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-12` | Reports | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-13` | Discovery → FSM handoff | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-14` | Inventory ↔ FSM integration | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-15` | FSM settings screens | ✅ Done | `docs/FSM-PROGRESS.md` |

### Epic 6 — Skeletons and convergence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `S-1` | crm module skeleton | ✅ Done | `docs/EPIC6-PROGRESS.md` |
| `S-2` | gst module skeleton | ✅ Done | `docs/EPIC6-PROGRESS.md` — "mostly done"; the remaining scope is listed there |
| `S-3` | core.threads + core.messages + core.message_templates; migrate public.messages / public.conversations onto them behind v | ✅ Done | `docs/EPIC6-PROGRESS.md` |
| `S-4` | Promote ai_runs, ai_provider_credentials, usage_events to core; all modules bill AI usage through one path. | ✅ Done | `docs/EPIC6-PROGRESS.md` |
| `S-5` | Platform dashboard assembled from module-contributed widgets via the registry. | ✅ Done | `docs/EPIC6-PROGRESS.md` |

### Epic 7 — Finance (details in docs/FINANCE-PROGRESS.md)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `FIN-1` | Finance exceptions queue | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-2` | Backfill | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-3` | Activation wizard | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-4` | Finance invoice view | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-5` | Cash flow statement | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-6` | Operational reports | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-7` | Report drill-down | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-8` | Bank rules | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-9` | Dimensions | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-10` | Seed data | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-11` | End-to-end edge cases | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-12` | Explainable accounting, in reverse | ⬜ Not started | `docs/FINANCE-PROGRESS.md` — surveyed 2026-09-18, not yet built |
| `FIN-13` | AI categorisation for unmatched bank lines | ⏸️ Deferred | Deliberate: Finance is deterministic arithmetic (CLAUDE.md principle 4). Only if wanted. |

## Platform Administration Portal

Source: [`docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md`](./plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md)

### SUPERADMIN Role

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-01.1` | Create SUPERADMIN Role | ✅ Done | `supabase/migrations/20260911004400_platform_superadmin.sql` |
| `PLATFORM-P0-01.2` | Platform Authorization | ✅ Done | `apps/web/app/platform/layout.tsx` +2 |
| `PLATFORM-P0-01.3` | Platform Session Context | ✅ Done | `apps/web/app/platform/layout.tsx` |
| `PLATFORM-P0-01.4` | No Tenant Context Required | ✅ Done | `supabase/migrations/20260911004400_platform_superadmin.sql` |

### Platform Dashboard

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-02.1` | Platform Overview | ✅ Done | `apps/web/app/platform/(protected)/page.tsx` +3 |
| `PLATFORM-P0-02.2` | Platform Configuration Health | ✅ Done | `apps/web/app/platform/(protected)/page.tsx` +3 |
| `PLATFORM-P0-02.3` | Recent Global Changes | ✅ Done | `apps/web/app/platform/(protected)/page.tsx` +1 |

### Branding & Look and Feel

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-03.1` | WonderArk Branding | ✅ Done | `apps/web/app/(auth)/login/page.tsx` +15 |
| `PLATFORM-P0-03.2` | Global Design Tokens | ✅ Done | `packages/core/src/admin/platform-branding.ts` +2 |
| `PLATFORM-P0-03.3` | Platform Login Branding | ✅ Done | `apps/web/app/(auth)/layout.tsx` +12 |
| `PLATFORM-P0-03.4` | Customer-Facing Branding Scope | ✅ Done | `packages/core/src/admin/platform-branding.ts` +9 |
| `PLATFORM-P0-03.5` | Preview Before Publish | ✅ Done | `apps/web/app/(auth)/layout.tsx` +14 |

### Subscription / Pricing Plans

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-04.1` | Plan Management | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/page.tsx` +15 |
| `PLATFORM-P0-04.2` | Plan Entitlements | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/feature-entitlements-section.tsx` +3 |
| `PLATFORM-P0-04.3` | Module Entitlements | ✅ Done | `apps/web/app/platform/(protected)/modules/module-registry-table.tsx` +12 |
| `PLATFORM-P0-04.4` | Feature-Level Entitlements | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/page.tsx` +10 |
| `PLATFORM-P0-04.5` | Quantity Limits | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/quantity-limits-section.tsx` +13 |
| `PLATFORM-P0-04.6` | Unlimited Support | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/quantity-limits-section.tsx` +11 |
| `PLATFORM-P0-04.7` | Plan Lifecycle | ✅ Done | `packages/core/src/admin/config-history.ts` +8 |

### Entitlement Engine

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-05.1` | Central Entitlement Service | ✅ Done | `packages/core/src/entitlements/feature-entitlement.ts` +7 |
| `PLATFORM-P0-05.2` | Entitlement Precedence | ✅ Done | `packages/core/src/entitlements/feature-entitlement.test.ts` +22 |
| `PLATFORM-P0-05.3` | Entitlement Evaluation | ✅ Done | `packages/core/src/entitlements/feature-entitlement.test.ts` +14 |
| `PLATFORM-P0-05.4` | Existing Licensing Integration | ✅ Done | `packages/core/src/admin/platform-plans.ts` +2 |

### Usage & Limits

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-06.1` | Usage Counters | ✅ Done | `packages/core/src/entitlements/limit-entitlement.test.ts` +9 |
| `PLATFORM-P0-06.2` | Usage Dashboard | ✅ Done | `packages/core/src/usage/dashboard.ts` +1 |
| `PLATFORM-P0-06.3` | Limit Enforcement | ✅ Done | `packages/core/src/components/limits/limit-reached-notice.tsx` +9 |
| `PLATFORM-P0-06.4` | Graceful Limit UX | ✅ Done | `packages/core/src/components/limits/limit-reached-notice.tsx` +4 |
| `PLATFORM-P0-06.5` | Soft vs Hard Limits | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/quantity-limits-section.tsx` +12 |

### Module Administration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-07.1` | Module Registry | ✅ Done | `apps/web/app/platform/(protected)/modules/module-registry-table.tsx` +16 |
| `PLATFORM-P0-07.2` | Platform-Wide Module Kill Switch | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/not-licensed/page.tsx` +22 |
| `PLATFORM-P0-07.3` | Module Maintenance Mode | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/not-licensed/page.tsx` +17 |

### Feature Flags

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-08.1` | Global Feature Flags | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +7 |
| `PLATFORM-P0-08.2` | Feature Flag Scope | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +7 |
| `PLATFORM-P0-08.3` | Kill Switches | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +5 |
| `PLATFORM-P0-08.4` | Feature Flag Audit | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +8 |

### Internal AI Provider & Keys

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-09.1` | Internal AI Provider Registry | ✅ Done | `apps/web/app/platform/(protected)/ai-providers/actions.ts` +11 |
| `PLATFORM-P0-09.2` | Secure API Key Storage | ✅ Done | `apps/web/app/platform/(protected)/ai-providers/actions.ts` +9 |
| `PLATFORM-P0-09.3` | Provider Routing | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/page.tsx` +11 |
| `PLATFORM-P0-09.4` | AI Feature Policies | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/actions.ts` +8 |
| `PLATFORM-P0-09.5` | AI Usage | ✅ Done | `apps/web/app/platform/(protected)/ai-usage/page.tsx` +2 |

### AI Safety / Cost Controls

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-10.1` | Platform AI Budget | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/page.tsx` +8 |
| `PLATFORM-P0-10.2` | AI Circuit Breaker | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/page.tsx` +3 |
| `PLATFORM-P0-10.3` | Provider Failure Fallback | ✅ Done | `supabase/migrations/20260912400000_platform_email_provider.sql` |
| `PLATFORM-P0-10.4` | AI Feature Kill Switch | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |

### Global Email / Notification Configuration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-11.1` | Email Provider | ✅ Done | `apps/web/app/platform/(protected)/email-provider/actions.ts` +12 |
| `PLATFORM-P0-11.2` | System Email Templates | ✅ Done | `apps/web/app/platform/(protected)/email-templates/actions.ts` +10 |
| `PLATFORM-P0-11.3` | Notification Policies | ✅ Done | `apps/web/app/platform/(protected)/notification-policies/actions.ts` +6 |

### Global Integrations

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-12.1` | Integration Registry | ✅ Done | `apps/web/app/platform/(protected)/integrations/integration-registry-table.tsx` +5 |
| `PLATFORM-P0-12.2` | Integration Status | ✅ Done | `apps/web/app/platform/(protected)/integrations/actions.ts` +6 |
| `PLATFORM-P0-12.3` | Integration Kill Switch | ✅ Done | `apps/web/app/platform/(protected)/integrations/actions.ts` +6 |
| `PLATFORM-P0-12.4` | Credential Separation | ✅ Done | `packages/core/src/admin/platform-integrations.ts` +4 |

### Country / Compliance Pack Administration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-13.1` | Country Registry | ✅ Done | `apps/web/app/platform/(protected)/compliance/country-dialog.tsx` +9 |
| `PLATFORM-P0-13.2` | Compliance Pack Availability | ✅ Done | `apps/web/app/platform/(protected)/compliance/compliance-pack-table.tsx` +7 |
| `PLATFORM-P0-13.3` | Rule Version | ✅ Done | `apps/web/app/platform/(protected)/compliance/page.tsx` +3 |
| `PLATFORM-P0-13.4` | Compliance Feature Flags | ✅ Done | `apps/web/app/platform/(protected)/compliance/compliance-pack-table.tsx` +8 |

### Platform Policies

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-14.1` | Global System Policies | ✅ Done | `apps/web/app/platform/(protected)/system-policies/actions.ts` +6 |
| `PLATFORM-P0-14.2` | Data Retention Policy | ✅ Done | `apps/web/app/platform/(protected)/system-policies/actions.ts` +6 |
| `PLATFORM-P0-14.3` | Rate Limits | ✅ Done | `apps/web/app/platform/(protected)/system-policies/actions.ts` +6 |

### Global Announcements / Maintenance

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-15.1` | Announcement Manager | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +7 |
| `PLATFORM-P0-15.2` | Audience | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +6 |
| `PLATFORM-P0-15.3` | Scheduled Announcement | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +6 |
| `PLATFORM-P0-15.4` | Maintenance Mode | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +5 |

### Platform Audit

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-16.1` | Immutable Platform Audit Log | ✅ Done | `apps/web/app/platform/(protected)/audit/page.tsx` +5 |
| `PLATFORM-P0-16.2` | High-Risk Action Audit | ✅ Done | `apps/web/app/platform/(protected)/ai-providers/provider-config-dialog.tsx` +7 |
| `PLATFORM-P0-16.3` | Audit Search | ✅ Done | `apps/web/app/platform/(protected)/audit/actions.ts` +8 |
| `PLATFORM-P0-16.4` | Configuration History | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |

### Configuration Versioning

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-17.1` | Version Configuration | ✅ Done | `apps/web/app/platform/(protected)/config-history/actions.ts` +12 |
| `PLATFORM-P0-17.2` | Draft vs Published | ✅ Done | `apps/web/app/platform/(protected)/config-history/page.tsx` +1 |
| `PLATFORM-P0-17.3` | Rollback | ✅ Done | `apps/web/app/platform/(protected)/config-history/actions.ts` +11 |

### Platform Settings Import/Export

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-01.1` | Configuration Export | ⬜ Not started | — |
| `PLATFORM-P1-01.2` | Configuration Import | ⬜ Not started | — |
| `PLATFORM-P1-01.3` | Secret Exclusion | ⬜ Not started | — |

### Business-Level Exceptions

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-02.1` | Business Override | ✅ Done | `packages/core/src/entitlements/feature-entitlement.ts` +2 |
| `PLATFORM-P1-02.2` | Temporary Entitlement | ⬜ Not started | — |
| `PLATFORM-P1-02.3` | Override Audit | ⬜ Not started | — |

### Customer Support Tools

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-03.1` | Customer Search | ✅ Done | `packages/core/src/usage/dashboard.ts` |
| `PLATFORM-P1-03.2` | Customer Configuration View | ✅ Done | `packages/core/src/usage/dashboard.ts` |
| `PLATFORM-P1-03.3` | Safe Impersonation | ✅ Done | `supabase/migrations/20260913480000_platform_audit_log.sql` |

### Subscription Lifecycle

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-04.1` | Plan Change Rules | ✅ Done | `packages/core/src/components/limits/limit-reached-notice.tsx` |
| `PLATFORM-P1-04.2` | Trial Configuration | ⬜ Not started | — |
| `PLATFORM-P1-04.3` | Grace Period | ⬜ Not started | — |
| `PLATFORM-P1-04.4` | Cancellation Behavior | ⬜ Not started | — |

### Platform Billing Configuration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-05.1` | Currency | ⬜ Not started | — |
| `PLATFORM-P1-05.2` | Billing Provider | ⬜ Not started | — |
| `PLATFORM-P1-05.3` | Tax on Subscription Billing | ⬜ Not started | — |
| `PLATFORM-P1-05.4` | Price Versioning | ⬜ Not started | — |

### Platform API Administration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-06.1` | API Policy | ⬜ Not started | — |
| `PLATFORM-P1-06.2` | API Key Management | ⬜ Not started | — |
| `PLATFORM-P1-06.3` | Webhook Policies | ⬜ Not started | — |
| `PLATFORM-P1-06.4` | API Usage Dashboard | ⬜ Not started | — |

### Observability & Operations

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-07.1` | System Health | ⬜ Not started | — |
| `PLATFORM-P1-07.2` | Error Rate | ⬜ Not started | — |
| `PLATFORM-P1-07.3` | Queue Health | ⬜ Not started | — |
| `PLATFORM-P1-07.4` | Operational Alerts | ⬜ Not started | — |

### Release Management

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-08.1` | Platform Version | ⬜ Not started | — |
| `PLATFORM-P1-08.2` | Feature Rollout | ⬜ Not started | — |
| `PLATFORM-P1-08.3` | Rollback Flag | ⬜ Not started | — |

### Legal / Policy Configuration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-09.1` | Terms & Privacy Version | ⬜ Not started | — |
| `PLATFORM-P1-09.2` | Cookie / Consent Configuration | ⬜ Not started | — |
| `PLATFORM-P1-09.3` | Legal Link Management | ✅ Done | `apps/web/app/platform/(protected)/branding/page.tsx` +1 |
| `PLATFORM-P1-09.4` | Policy Acceptance Tracking | ⬜ Not started | — |

### Platform Security Controls

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-18.1` | MFA Required for SUPERADMIN | ✅ Done | `apps/web/app/platform/(protected)/layout.tsx` +3 |
| `PLATFORM-P0-18.2` | Reauthentication for High-Risk Actions | ✅ Done | `apps/web/app/platform/impact-banner.tsx` +1 |
| `PLATFORM-P0-18.3` | Least Privilege | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `PLATFORM-P0-18.4` | Destructive Action Protection | ✅ Done | `apps/web/app/platform/impact-banner.tsx` +1 |

### Platform Administration UI

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-19.1` | Dedicated Admin Layout | ✅ Done | `apps/web/app/platform/layout.tsx` +2 |
| `PLATFORM-P0-19.2` | Global Impact Banner | ✅ Done | `apps/web/app/platform/impact-banner.tsx` |
| `PLATFORM-P0-19.3` | Desktop Tables | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |
| `PLATFORM-P0-19.4` | Responsive Mobile | ✅ Done | `apps/web/app/platform/platform-shell.tsx` |
| `PLATFORM-P0-19.5` | Professional Layout Rule | ❔ Unverified | Discussed in `docs/design/platform-admin-portal-audit.md`, but no code cites it — confirm before relying on this |

## Discovery — offering-centric upgrade

Source: [`docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md`](./plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md)

### DISC-OFFER-P0-01 — Business Offering Foundation

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-01.1` | Introduce Business Offering | ✅ Done | `packages/module-discovery/src/components/offerings/offering-form-dialog.tsx` +14 |
| `DISC-OFFER-P0-01.2` | Existing Product Compatibility | ✅ Done | `packages/module-discovery/src/lib/offerings/types.ts` +2 |
| `DISC-OFFER-P0-01.3` | Business Offering Create/Edit UI | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +9 |

### DISC-OFFER-P0-02 — Offering Setup & ICP

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-02.1` | Offering Setup Wizard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +4 |
| `DISC-OFFER-P0-02.2` | Offering ICP Builder | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +8 |
| `DISC-OFFER-P0-02.3` | Offering Buyer Persona Definition | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +7 |

### DISC-OFFER-P0-03 — Offering-Centric Discovery Workspace

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-03.1` | Offering Context Selector | ⬜ Not started | — |
| `DISC-OFFER-P0-03.2` | Offering Discovery Overview | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/page.tsx` +1 |
| `DISC-OFFER-P0-03.3` | Offering Navigation | ✅ Done | `packages/module-discovery/src/components/tenancy/product-nav.tsx` |

### DISC-OFFER-P0-04 — Offering Discovery Strategy

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-04.1` | Discovery Definition | ✅ Done | `packages/module-discovery/src/components/discovery-definitions/definition-form-dialog.tsx` +4 |
| `DISC-OFFER-P0-04.2` | Discovery Play | ✅ Done | `packages/module-discovery/src/components/discovery-definitions/definition-form-dialog.tsx` +3 |

### DISC-OFFER-P0-05 — Opportunity Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-05.1` | Discovery Opportunity Model | ✅ Done | `packages/module-discovery/src/lib/opportunities/outcome-funnel.ts` +3 |
| `DISC-OFFER-P0-05.2` | Opportunity Score | ✅ Done | `packages/module-discovery/src/lib/opportunities/scoring.ts` +5 |
| `DISC-OFFER-P0-05.3` | Multi-Signal Correlation | ✅ Done | `packages/module-discovery/src/components/opportunities/signal-table.tsx` +8 |
| `DISC-OFFER-P0-05.4` | Why Now | ✅ Done | `packages/module-discovery/src/lib/opportunities/mutations.ts` +5 |
| `DISC-OFFER-P0-05.5` | Negative Signals | ✅ Done | `packages/module-discovery/src/lib/negative-signals/detect.ts` +8 |

### DISC-OFFER-P0-06 — Evidence & Research

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-06.1` | Evidence-Backed Research | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]/page.tsx` +4 |
| `DISC-OFFER-P0-06.2` | Offering Research Brief | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]/page.tsx` +9 |
| `DISC-OFFER-P0-06.3` | Buyer/Person Intelligence | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]/page.tsx` +13 |

### DISC-OFFER-P0-07 — Action-Oriented Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-07.1` | Next Best Action | ✅ Done | `packages/module-discovery/src/lib/opportunities/mutations.ts` +5 |
| `DISC-OFFER-P0-07.2` | Today's Opportunities | ✅ Done | `packages/module-discovery/src/components/opportunities/opportunities-dashboard.tsx` +7 |
| `DISC-OFFER-P0-07.3` | Opportunity Detail | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/actions.ts` +2 |

### DISC-OFFER-P0-08 — CRM Handoff

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-08.1` | Offering-Aware Discovery → CRM Handoff | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/crm/customers/[partyId]/page.tsx` +9 |
| `DISC-OFFER-P0-08.2` | Existing Relationship Detection | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/page.tsx` +10 |
| `DISC-OFFER-P0-08.3` | Handoff Status | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/actions.ts` +8 |

### DISC-OFFER-P1-01 — Continuous Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-01.1` | Saved Offering Discovery | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/actions.ts` +10 |
| `DISC-OFFER-P1-01.2` | Continuous Monitoring | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/actions.ts` +3 |
| `DISC-OFFER-P1-01.3` | Account Watchlist | ⬜ Not started | — |
| `DISC-OFFER-P1-01.4` | Grouped Opportunity Alerts | ⬜ Not started | — |

### DISC-OFFER-P1-02 — Discovery Quality & Learning

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-02.1` | Prospect Feedback | ✅ Done | `packages/module-discovery/src/lib/offerings/definition-quality.ts` +7 |
| `DISC-OFFER-P1-02.2` | Discovery Outcome Tracking | ✅ Done | `packages/module-discovery/src/components/pipeline/save-and-run-downstream-button.tsx` |
| `DISC-OFFER-P1-02.3` | Offering Performance Analysis | ⬜ Not started | — |

### DISC-OFFER-P1-03 — AI Efficiency

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-03.1` | Progressive Intelligence | ✅ Done | `packages/module-discovery/src/components/offerings/offering-overview-summary.tsx` +2 |
| `DISC-OFFER-P1-03.2` | Research Cache | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/actions.ts` +3 |
| `DISC-OFFER-P1-03.3` | Provider-Agnostic Data Contracts | ⬜ Not started | — |

### DISC-OFFER-P1-04 — Multi-Offering Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-04.1` | Cross-Offering Account View | ✅ Done | `packages/module-discovery/src/components/opportunities/opportunity-detail.tsx` +4 |
| `DISC-OFFER-P1-04.2` | Offering Portfolio Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/page.tsx` +3 |
| `DISC-OFFER-P1-04.3` | Offering-Specific Contact Relevance | ⬜ Not started | — |

### DISC-OFFER-P1-05 — Search & Interaction UX

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-05.1` | Offering-Scoped Search | ✅ Done | `packages/module-discovery/src/components/pipeline/run-ai-discovery-panel.tsx` |
| `DISC-OFFER-P1-05.2` | Editable Opportunity Rows | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/page.tsx` +5 |
| `DISC-OFFER-P1-05.3` | Responsive Opportunity Workspace | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/actions.ts` +2 |
| `DISC-OFFER-P1-05.4` | Offering Overview UX Polish | ⬜ Not started | — |

### Product Decision

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-09.1` | Website URL Business Onboarding | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +10 |
| `DISC-OFFER-P0-09.2` | Website Crawl & Content Discovery | ✅ Done | `packages/module-discovery/src/components/website-onboarding/website-onboarding-panel.tsx` +16 |
| `DISC-OFFER-P0-09.3` | AI Offering Extraction | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +11 |
| `DISC-OFFER-P0-09.4` | Offering Review Before Activation | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +7 |

### P0 EPIC — One-Click Autonomous Offering Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-10.1` | Run AI Discovery CTA | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/run-ai-discovery/route.ts` +13 |
| `DISC-OFFER-P0-10.2` | Persistent Pipeline Stage Model | ✅ Done | `packages/module-discovery/src/components/pipeline/run-ai-discovery-panel.tsx` +10 |
| `DISC-OFFER-P0-10.3` | Pipeline Progress UI | ✅ Done | `packages/module-discovery/src/components/opportunities/top-opportunity-gate.tsx` +5 |

### P0 EPIC — Human Override at Any Stage

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-11.1` | Editable Pipeline Stages | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +4 |
| `DISC-OFFER-P0-11.2` | Run From This Stage | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +5 |
| `DISC-OFFER-P0-11.3` | Stage Dependency Graph | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +6 |

### P0 EPIC — Offering-Specific Website & External Research

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-12.1` | Offering-Specific Website Research | ✅ Done | `packages/module-discovery/src/lib/ai/understand-product.ts` +1 |
| `DISC-OFFER-P0-12.2` | External Opportunity Research | ✅ Done | `packages/module-discovery/src/components/opportunities/opportunity-detail.tsx` +5 |

### P0 EPIC — Structured Stage Contracts

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-13.1` | Structured Outputs | ✅ Done | `packages/module-discovery/src/lib/ai/schemas.ts` +6 |

### P0 EPIC — Run History and Audit

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-14.1` | Discovery Run History | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/history/[runId]/page.tsx` +13 |
| `DISC-OFFER-P0-14.2` | Versioned Stage Results | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/page.tsx` +13 |

### P0 EPIC — Final Human Action Gate

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-15.1` | Recommended Action Gate | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/actions.ts` +13 |

## Discovery — opportunity intelligence

Source: [`docs/plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md`](./plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md)

### P0 — Core Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.1` | Discovery Opportunity Domain Model | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.1`, which is what was built |
| `DISC-INTEL-01.2` | Signal Normalization Layer | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.1`, which is what was built |
| `DISC-INTEL-01.3` | Signal Freshness and Confidence | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.1`, which is what was built |
| `DISC-INTEL-01.4` | Multi-Signal Correlation Engine | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.3`, which is what was built |
| `DISC-INTEL-01.5` | Discovery Opportunity Score | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.2`, which is what was built |
| `DISC-INTEL-01.6` | Why Now Engine | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.4`, which is what was built |
| `DISC-INTEL-01.7` | Evidence-Backed AI Research | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-06.1`, which is what was built |
| `DISC-INTEL-01.8` | Prospect Research Brief | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-06.2`, which is what was built |
| `DISC-INTEL-01.9` | Buying Committee / Person Intelligence | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-06.3`, which is what was built |
| `DISC-INTEL-01.10` | Signal-to-Action Recommendation | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-07.1`, which is what was built |

### P0 — Discovery UX

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.11` | Today's Opportunities Dashboard | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-07.2`, which is what was built |
| `DISC-INTEL-01.12` | Responsive Opportunity Cards / Proto Table | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-05.3`, which is what was built |
| `DISC-INTEL-01.13` | Opportunity Detail View | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-07.3`, which is what was built |

### P1 — Continuous Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.14` | Saved Discovery Definition | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-01.1`, which is what was built |
| `DISC-INTEL-01.15` | Account Watchlist | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-01.3`, which is what was built |
| `DISC-INTEL-01.16` | Opportunity Alerts | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-01.4`, which is what was built |
| `DISC-INTEL-01.17` | Discovery Plays | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-04.2`, which is what was built |

### P1 — Negative Signals and Uncertainty

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.18` | Negative / Disqualifying Signals | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.5`, which is what was built |
| `DISC-INTEL-01.19` | Insufficient Evidence State | 🔁 Superseded | Backlog 08 was superseded by the offering-centric backlog; this story has no direct equivalent there — re-scope it if it is still wanted |

### P1 — Feedback / Learning

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.20` | Prospect Feedback | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.1`, which is what was built |
| `DISC-INTEL-01.21` | Discovery Learning Dataset | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.2`, which is what was built |
| `DISC-INTEL-01.22` | Controlled Feedback-Driven Adjustment | 🔁 Superseded | Backlog 08 was superseded by the offering-centric backlog; this story has no direct equivalent there — re-scope it if it is still wanted |

### P1 — AI Cost / Provider Architecture

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.23` | Progressive Intelligence Pipeline | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-03.1`, which is what was built |
| `DISC-INTEL-01.24` | AI Research Cache | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-03.2`, which is what was built |
| `DISC-INTEL-01.25` | Provider-Agnostic Data Contracts | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-03.3`, which is what was built |

### P1 — CRM Handoff

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.26` | Discovery → CRM Opportunity Handoff | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-08.1`, which is what was built |
| `DISC-INTEL-01.27` | Existing Customer / Relationship Detection | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-08.2`, which is what was built |
| `DISC-INTEL-01.28` | Discovery Opportunity Lifecycle | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-08.3`, which is what was built |

### P2 — Analytics

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.29` | Discovery Performance Dashboard | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.3`, which is what was built |
| `DISC-INTEL-01.30` | Opportunity Quality Analysis | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.3`, which is what was built |

## Compliance / Finance — global tax

Source: [`docs/plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md`](./plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md)

### COMPLY-P0-01 — Compliance Shell & Country Switch

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-01.1` | Rename GST UI to Compliance | ✅ Done | The module shipped as Compliance and has since been renamed again to Finance — `packages/module-registry/src/index.ts` |
| `COMPLY-P0-01.2` | Country Selector | ✅ Done | `packages/module-gst/src/components/compliance/country-bar.tsx` +7 |
| `COMPLY-P0-01.3` | Tax Regime Selector | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/actions.ts` +5 |
| `COMPLY-P0-01.4` | Context Persistence | ✅ Done | `scripts/test-gst-compliance-profile-rls.mjs` +2 |
| `COMPLY-P0-01.5` | Unsupported-Country UX | ✅ Done | `packages/module-gst/src/components/compliance/country-bar.tsx` +3 |

### COMPLY-P0-02 — Generic Tax Framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-02.1` | Tax Registration | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/registrations/actions.ts` +14 |
| `COMPLY-P0-02.2` | Tax Jurisdiction | ✅ Done | `packages/module-gst/src/lib/compliance/jurisdictions.ts` +7 |
| `COMPLY-P0-02.3` | Versioned Tax Rules | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/rules.ts` +21 |
| `COMPLY-P0-02.4` | Tax Treatments | ✅ Done | `packages/module-gst/src/lib/compliance/treatments.ts` +9 |
| `COMPLY-P0-02.5` | Tax Determination Snapshot | ✅ Done | `packages/module-gst/src/lib/gst-tax-determination/mutations.ts` +8 |

### COMPLY-P0-03 — Existing-Data Integration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-03.1` | Core Transaction Contract | ✅ Done | `packages/module-gst/src/lib/core-transactions/queries.ts` +11 |
| `COMPLY-P0-03.2` | Inventory Tax Context | ✅ Done | `packages/module-gst/src/lib/fsm-tax-context/queries.ts` +9 |
| `COMPLY-P0-03.3` | FSM Tax Context | ✅ Done | `packages/module-gst/src/lib/fsm-tax-context/queries.ts` +1 |
| `COMPLY-P0-03.4` | Party Tax Context | ✅ Done | `packages/module-gst/src/lib/einvoice-schema-validation/queries.ts` +13 |
| `COMPLY-P0-03.5` | No Duplicate Masters | ✅ Done | `scripts/lint-gst-no-duplicate-masters.mjs` +1 |

### COMPLY-P0-04 — India GST

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-04.1` | GSTIN Management | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/registrations/actions.ts` +19 |
| `COMPLY-P0-04.2` | GST Profile | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/registrations/actions.ts` +15 |
| `COMPLY-P0-04.3` | HSN/SAC | ✅ Done | `packages/module-gst/src/lib/information-returns/queries.ts` +5 |
| `COMPLY-P0-04.4` | Place of Supply | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/place-of-supply.ts` +11 |
| `COMPLY-P0-04.5` | GST Tax Determination | ✅ Done | `packages/module-gst/src/lib/eu-vat-determination/determine.ts` +11 |
| `COMPLY-P0-04.6` | GST Invoice Validation | ✅ Done | `packages/module-gst/src/lib/einvoice-schema-validation/queries.ts` +4 |
| `COMPLY-P0-04.7` | GST Rule Versioning | ✅ Done | `packages/module-gst/src/lib/einvoice-eligibility/threshold.ts` +14 |

### COMPLY-P0-05 — India E-Invoice

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-05.1` | E-Invoice Eligibility | ✅ Done | `packages/module-gst/src/lib/einvoice-eligibility/determine.ts` +20 |
| `COMPLY-P0-05.2` | Schema Validation | ✅ Done | `packages/module-gst/src/lib/einvoice-schema-validation/queries.ts` +2 |
| `COMPLY-P0-05.3` | IRP Adapter | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +18 |
| `COMPLY-P0-05.4` | IRN/QR Response | ✅ Done | `packages/module-gst/src/lib/einvoice-status/determine.ts` +14 |
| `COMPLY-P0-05.5` | Reporting Deadline Control | ✅ Done | `packages/module-gst/src/lib/einvoice-reporting-window/determine.ts` +12 |
| `COMPLY-P0-05.6` | E-Invoice Status | ✅ Done | `packages/module-gst/src/lib/einvoice-status/determine.ts` +8 |

### COMPLY-P0-06 — India E-Way Bill

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-06.1` | Eligibility Engine | ✅ Done | `packages/module-gst/src/lib/eway-bill-document-link/queries.ts` +10 |
| `COMPLY-P0-06.2` | Movement Data | ✅ Done | `packages/module-gst/src/lib/eway-bill-document-link/link.ts` +13 |
| `COMPLY-P0-06.3` | E-Way Adapter | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +15 |
| `COMPLY-P0-06.4` | Document Link | ✅ Done | `packages/module-gst/src/lib/eway-bill-document-link/link.ts` +5 |

### COMPLY-P0-07 — India Returns

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-07.1` | GSTR-1 Preparation | ✅ Done | `packages/module-gst/src/lib/returns/drilldown/reconciliation.test.ts` +18 |
| `COMPLY-P0-07.2` | GSTR-3B Preparation | ✅ Done | `packages/module-gst/src/lib/returns/drilldown/reconciliation.test.ts` +15 |
| `COMPLY-P0-07.3` | GSTR-9 Preparation | ✅ Done | `packages/module-gst/src/lib/returns/drilldown/reconciliation.test.ts` +6 |
| `COMPLY-P0-07.4` | Return Drill-Down | ✅ Done | `packages/module-gst/src/lib/filing/types.ts` +11 |
| `COMPLY-P0-07.5` | Return Review Workflow | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +14 |
| `COMPLY-P0-07.6` | Return Lock | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +11 |
| `COMPLY-P0-07.7` | Filing/Payment Status | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +10 |

### COMPLY-P0-08 — India Reconciliation & IMS

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-08.1` | GSTR-2B Fetch/Import | ✅ Done | `packages/module-gst/src/lib/government-responses/queries.ts` +19 |
| `COMPLY-P0-08.2` | Purchase-to-2B Matching | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/reconciliation/page.tsx` +9 |
| `COMPLY-P0-08.3` | Match Explanation | ✅ Done | `packages/module-gst/src/lib/reconciliation/explain.ts` +3 |
| `COMPLY-P0-08.4` | IMS Accept/Reject/Pending | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/reconciliation/page.tsx` +11 |
| `COMPLY-P0-08.5` | ITC Availability View | ✅ Done | `packages/module-gst/src/lib/exceptions/derive.ts` +4 |
| `COMPLY-P0-08.6` | Exception Queue | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/reconciliation/actions.ts` +12 |

### COMPLY-P0-09 — Compliance Calendar & Risk

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-09.1` | Filing Calendar | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +12 |
| `COMPLY-P0-09.2` | Payment Calendar | ✅ Done | `packages/module-gst/src/lib/calendar/due-dates.ts` +4 |
| `COMPLY-P0-09.3` | Reminder Engine | ✅ Done | `apps/web/app/api/cron/send-compliance-reminders/route.ts` +5 |
| `COMPLY-P0-09.4` | Overdue Detection | ✅ Done | `packages/module-gst/src/lib/calendar/overdue.ts` +3 |
| `COMPLY-P0-09.5` | Risk Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +7 |

### COMPLY-P0-10 — Evidence & Audit

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-10.1` | Evidence Repository | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/evidence/actions.ts` +8 |
| `COMPLY-P0-10.2` | Government Response Store | ✅ Done | `packages/module-gst/src/lib/einvoicing/queries.ts` +8 |
| `COMPLY-P0-10.3` | Audit Trail | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/audit-log/page.tsx` +2 |
| `COMPLY-P0-10.4` | Source Traceability | ✅ Done | `packages/module-gst/src/lib/einvoice-eligibility/types.ts` +4 |
| `COMPLY-P0-10.5` | Retention Rules | ✅ Done | `packages/module-gst/src/lib/evidence/mutations.ts` +7 |

### COMPLY-P0-11 — Compliance UI

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-11.1` | Overview Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +1 |
| `COMPLY-P0-11.2` | Desktop Table Presentation | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` |
| `COMPLY-P0-11.3` | Responsive Mobile Cards | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` |
| `COMPLY-P0-11.4` | Row-Level Actions | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +3 |
| `COMPLY-P0-11.5` | Clear Status Hierarchy | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +3 |

### COMPLY-P1-01 — EU VAT Framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-01.1` | EU VAT Core | ✅ Done | `packages/module-gst/src/lib/compliance/eu.ts` |
| `COMPLY-P1-01.2` | Member State Country Packs | ✅ Done | `packages/module-gst/src/lib/compliance/countries.ts` +5 |
| `COMPLY-P1-01.3` | Intra-EU VAT | ✅ Done | `packages/module-gst/src/lib/compliance/eu.ts` +6 |
| `COMPLY-P1-01.4` | OSS/IOSS | ✅ Done | `packages/module-gst/src/lib/compliance/eu.ts` +5 |
| `COMPLY-P1-01.5` | VAT ID Validation / VIES Where Supported | ✅ Done | `packages/module-gst/src/lib/eu-vat-determination/types.ts` +5 |
| `COMPLY-P1-01.6` | Country-Specific E-Invoicing | ✅ Done | `packages/module-gst/src/lib/einvoicing-be/adapter.ts` +11 |

### COMPLY-P1-02 — United States

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-02.1` | State/Local Jurisdictions | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/registration.ts` +13 |
| `COMPLY-P1-02.2` | Economic Nexus Tracker | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/registration.ts` +9 |
| `COMPLY-P1-02.3` | Physical Nexus Inputs | ✅ Done | `packages/module-gst/src/lib/us-nexus/obligations.ts` +5 |
| `COMPLY-P1-02.4` | Sales Tax Registration Obligations | ✅ Done | `packages/module-gst/src/lib/singapore-gst/registration.ts` +5 |
| `COMPLY-P1-02.5` | Product/Service Taxability | ✅ Done | `packages/module-gst/src/lib/exemption-certificates/types.ts` +16 |
| `COMPLY-P1-02.6` | Exemption Certificates | ✅ Done | `packages/module-gst/src/lib/exemption-certificates/mutations.ts` +9 |
| `COMPLY-P1-02.7` | Sales Tax Returns/Remittance | ✅ Done | `packages/module-gst/src/lib/compliance/us-states.ts` +10 |
| `COMPLY-P1-02.8` | 1099 Information Returns | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/registration.ts` +8 |

### COMPLY-P1-03 — Canada

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-03.1` | GST/HST | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/rules.ts` +6 |
| `COMPLY-P1-03.2` | Provincial PST/QST/RST | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +4 |
| `COMPLY-P1-03.3` | Place of Supply | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/place-of-supply.ts` |
| `COMPLY-P1-03.4` | Filing Periods | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/filing-frequency.ts` +6 |
| `COMPLY-P1-03.5` | CRA Filing Adapter | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +3 |

### COMPLY-P1-04 — Singapore

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-04.1` | GST Registration | ✅ Done | `packages/module-gst/src/lib/singapore-gst/registration.ts` +2 |
| `COMPLY-P1-04.2` | GST F5 | ✅ Done | `packages/module-gst/src/lib/singapore-gst/queries.ts` +5 |
| `COMPLY-P1-04.3` | InvoiceNow Eligibility | ✅ Done | `packages/module-gst/src/lib/einvoicing-sg/mandate.ts` +2 |
| `COMPLY-P1-04.4` | Peppol Identifier | ✅ Done | `packages/module-gst/src/lib/tax-registrations/sg-registration-profile.ts` |
| `COMPLY-P1-04.5` | InvoiceNow Adapter | ✅ Done | `packages/module-gst/src/lib/einvoicing-sg/adapter.ts` +5 |
| `COMPLY-P1-04.6` | Transmission Status | ✅ Done | `packages/module-gst/src/lib/einvoicing-sg/queries.ts` +5 |
| `COMPLY-P1-04.7` | Five-Year Record Retention | ✅ Done | `packages/module-gst/src/lib/retention/compute.ts` +4 |

### COMPLY-P1-05 — UAE

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-05.1` | VAT Registration | ⬜ Not started | — |
| `COMPLY-P1-05.2` | VAT Return | ⬜ Not started | — |
| `COMPLY-P1-05.3` | EmaraTax Adapter | ⬜ Not started | — |
| `COMPLY-P1-05.4` | VAT Mismatch Review | ⬜ Not started | — |
| `COMPLY-P1-05.5` | Voluntary Disclosure | ⬜ Not started | — |
| `COMPLY-P1-05.6` | UAE E-Invoicing Readiness | ⬜ Not started | — |

### COMPLY-P1-06 — Saudi Arabia

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-06.1` | ZATCA Registration Context | ⬜ Not started | — |
| `COMPLY-P1-06.2` | Fatoora Adapter | ⬜ Not started | — |
| `COMPLY-P1-06.3` | Structured Invoice Validation | ⬜ Not started | — |
| `COMPLY-P1-06.4` | Clearance/Reporting | ⬜ Not started | — |
| `COMPLY-P1-06.5` | QR/Security Evidence | ⬜ Not started | — |
| `COMPLY-P1-06.6` | Integration-Wave Tracking | ⬜ Not started | — |

### COMPLY-P1-07 — Australia / New Zealand

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-07.1` | Australia GST | ⬜ Not started | — |
| `COMPLY-P1-07.2` | BAS | ⬜ Not started | — |
| `COMPLY-P1-07.3` | Peppol eInvoicing | ⬜ Not started | — |
| `COMPLY-P1-07.4` | New Zealand GST | ⬜ Not started | — |
| `COMPLY-P1-07.5` | NZ Filing Frequency | ⬜ Not started | — |

### COMPLY-P1-08 — Asia

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-08.1` | Malaysia SST | ⬜ Not started | — |
| `COMPLY-P1-08.2` | Thailand VAT | ⬜ Not started | — |
| `COMPLY-P1-08.3` | Indonesia VAT/e-Faktur | ⬜ Not started | — |
| `COMPLY-P1-08.4` | Japan Consumption Tax/Qualified Invoice | ⬜ Not started | — |
| `COMPLY-P1-08.5` | South Korea VAT/e-Tax Invoice | ⬜ Not started | — |

### COMPLY-P1-09 — Government Integration Framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-09.1` | Common Adapter Contract | ⬜ Not started | — |
| `COMPLY-P1-09.2` | Secure Credential Store | ⬜ Not started | — |
| `COMPLY-P1-09.3` | Submission Idempotency | ⬜ Not started | — |
| `COMPLY-P1-09.4` | Retry Handling | ⬜ Not started | — |
| `COMPLY-P1-09.5` | Integration Health | ⬜ Not started | — |

### COMPLY-P1-10 — AI Compliance Assistant

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-10.1` | "What do I need to file?" | ⬜ Not started | — |
| `COMPLY-P1-10.2` | Explain My Tax | ⬜ Not started | — |
| `COMPLY-P1-10.3` | Explain a Mismatch | ⬜ Not started | — |
| `COMPLY-P1-10.4` | Filing Readiness Summary | ⬜ Not started | — |
| `COMPLY-P1-10.5` | Anomaly Detection | ⬜ Not started | — |
| `COMPLY-P1-10.6` | Compliance Research Assistant | ⬜ Not started | — |

### COMPLY-P1-11 — Compliance Risk Center

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-11.1` | Risk Register | ⬜ Not started | — |
| `COMPLY-P1-11.2` | Risk Severity | ⬜ Not started | — |
| `COMPLY-P1-11.3` | Risk Owner | ⬜ Not started | — |
| `COMPLY-P1-11.4` | Remediation Workflow | ⬜ Not started | — |

### COMPLY-P1-12 — Cross-Module Compliance Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-12.1` | Inventory Tax Readiness | ✅ Done | `packages/module-gst/src/lib/inventory-tax-context/queries.ts` |
| `COMPLY-P1-12.2` | FSM Tax Readiness | ⬜ Not started | — |
| `COMPLY-P1-12.3` | CRM Customer Tax Context | ⬜ Not started | — |
| `COMPLY-P1-12.4` | Payment-to-Tax Reconciliation | ⬜ Not started | — |
| `COMPLY-P1-12.5` | Core Domain Events | ⬜ Not started | — |
