# E2E Test Inventory

Status: generated 2026-10-01 from the repository at `main` (`bcd3602f`) plus this branch's
fixes. **The repository is authoritative** -- the route appendix below is produced from
`apps/web/app/**/page.tsx`, not from planning documents. Companion documents:
[E2E_TEST_PLAN.md](E2E_TEST_PLAN.md) (how it is tested), [E2E_TEST_RESULTS.md](E2E_TEST_RESULTS.md)
(what happened), [E2E_DEFECTS.md](E2E_DEFECTS.md), [E2E_COVERAGE_GAPS.md](E2E_COVERAGE_GAPS.md).

## What exists

| Surface | Count | Where |
|---|---:|---|
| Page routes | 196 | `apps/web/app/**/page.tsx` |
| Route handlers (API) | 31 | `apps/web/app/**/route.ts` -- billing (3), cron (10), webhooks (7), exports (2), v1 API (3), auth/invite/portal (3), Discovery streaming (3) |
| Server-action files / exported actions | 103 / 478 | `apps/web/app/**/actions.ts` |
| Supabase migrations | 259 | `supabase/migrations/` -- schemas `core`, `discovery`, `inventory`, `fsm`, `crm`, `gst`, `platform` |
| PostgREST-exposed relations | 255 (176 carry `business_id`/`workspace_id`) | read live from PostgREST's own OpenAPI document by `e2e/security/support.ts` |
| Storage buckets | 5 | `attachments`, `knowledge-files`, `exports` (private); `avatars`, `business-logos` (public) |
| AI call sites | ~27 | `packages/module-discovery/src/lib/ai/*`, `packages/module-crm/src/lib/ai/*`; prompts in `src/prompts/**` |
| System roles | 8 | owner, admin, inventory_manager, procurement_manager, sales_manager, accountant, warehouse_operator, viewer (+ custom roles per business) |
| Licensable modules | 5 | `discovery`, `inventory`, `fsm` (Service), `crm`, `gst` (Finance) |

Authentication is Supabase Auth (email + password; magic/reset links via `/auth/callback`);
sessions are cookies refreshed in `packages/core/src/db/middleware.ts` (called from
`apps/web/proxy.ts`). Platform administration additionally requires a `platform.admins` row
(`requireSuperadmin()`) and an MFA (aal2) session.

## Feature inventory

Columns follow the brief: route(s) · API/server surface · role/permission · licence ·
prerequisite data · happy path · validation · failure · authorization · tenant isolation ·
mobile · **E2E coverage** (spec files; "API" = direct PostgREST/route-handler test,
"UI" = browser). Coverage marked *smoke* means the page is rendered and crash-checked, not
every interaction driven.

| Module / feature | Routes | Server surface | Permission (viewer→owner) | Licence | Prereq data | Happy path | Validation | Failure | AuthZ | Tenant isolation | Mobile | E2E coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Authentication** | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` | Supabase Auth, `proxy.ts` | -- | -- | confirmed user | login → `/dashboard` | empty/invalid email, short password | wrong password, tampered cookie, expired session | protected routes redirect | n/a | yes | UI: `unauthenticated/auth.spec.ts`, `multi-user/cross-tenant-ui.spec.ts` (AUTH-01..04), keyboard login (`quality.spec.ts`) |
| **Onboarding / business** | `/onboarding`, `/dashboard`, `/<slug>/business`, `website-onboarding` | `createBusiness*`, `updateBusiness`, logo upload | owner/admin | discovery (seeded on create) | account | create business, rename, logo | blank name, bad URL, logo type/size | logo storage missing (DEF-008) | members only | `core.businesses` RLS | yes | UI smoke + logo journey (`quality.spec.ts`); fixtures exercise the RLS create path |
| **Tenancy & membership** | `/<slug>/admin/users`, `/invite/[token]` | `inviteMember`, `acceptInvitation`, `changeMemberRole` | `members.*` | -- | 2+ members | invite → accept | invalid email | revoked/expired invite | owner/admin only; no self-promotion | `business_members` RLS | yes | API: SEC-ESC (`rbac-licensing.spec.ts`); UI: `authenticated/rbac.spec.ts` |
| **Roles & permissions** | `/<slug>/admin/roles`, `/roles/new`, `/roles/[roleId]` | `createRole`, `updateRole`, `archiveRole`, `core.has_permission` | `roles.manage` | -- | -- | create/archive custom role | name, permission set | -- | viewer cannot grant/mint | role must belong to business | yes | UI `rbac.spec.ts`; API SEC-RBAC, SEC-ESC |
| **API keys** | `/<slug>/admin/api-keys`, `/api/v1/*` | `core.api_keys`, `api-v1/auth.server.ts` | `api_keys.manage` | per resource | key | list/create via key | bad resource/id | missing/forged key | key scopes | key bound to business | -- | API: SEC-HTTP-05 (refusals only) |
| **Licensing / subscription** | `/<slug>/billing/*`, `/dashboard/settings/licenses`, `/<slug>/not-licensed` | `startCheckout`, billing webhooks, `/api/cron/expire-licenses`, `activateLicense` | `billing.manage` | -- | plan catalogue | plan → checkout → webhook → licence | invalid body | forged/duplicate webhook, client-side "success" | tenant cannot write `core.licenses` | per business | yes | API: SEC-LIC, SEC-HTTP-02/03; UI: `billing.spec.ts`, SEC-LIC-UI |
| **Discovery -- overview/business/offerings** | `/<slug>/discovery/dashboard`, `/discovery/offerings/[productId]/*` (15 routes) | `createProduct`, `run-ai-discovery`, `discover-products`, website crawl | `discovery.*` | discovery | business, offering | offering → ICP → prospects → research → opportunities | blank name, URL normalisation | AI/provider failure (unit-tested) | inventory hand-off may view offerings | `workspace_id` RLS | yes | UI: `discovery.spec.ts`, `discovery-flows.spec.ts`, `dashboard-nav.spec.ts`; API sweep |
| **Discovery -- prospects / research / signals / pipeline / conversion / history** | `.../prospects`, `/prospects/[id]`, `/prospects/import`, `/discover`, `/opportunities`, `/history`, `/conversions`, `/watchlist`, `/performance`, `/usage` | AI research, import (CSV/XLSX/PDF/DOCX) | `discovery.*`, `leads.manage` | discovery | offering | import → research → stage | import format | malformed AI output (unit), injected content (DEF-005) | -- | workspace RLS; prospect id substitution | yes | UI smoke (`discovery.spec.ts`, `exports.spec.ts`); API SEC-TI-03 (prospect id); prompt-injection unit tests |
| **Marketing** | `/discovery/marketing/*` (9 routes) | campaigns, content, assets, strategy, analytics | `marketing.*` | discovery | business | campaign draft→planned→active→paused→completed→archived; content idea→…→published | start date before activation, required fields | invalid transition | `marketing.view` vs edit | business RLS | yes | UI: `marketing.spec.ts`, `discovery-flows.spec.ts` (Marketing flows) |
| **Funding** | `/discovery/funding/*` (13 routes) | profile, readiness, rounds, investors, outreach, data room, due diligence | `funding.*` | discovery | business | round → investor → pipeline → commit; data-room share; diligence | currency required, source-backed findings need a link | -- | data room token scoped | business RLS; `/p/dr/[token]` | yes | UI: `funding.spec.ts`, `discovery-flows.spec.ts` (Funding flows); HTTP: guessed data-room token (SEC-HTTP-05) |
| **Inventory** | `/<slug>/inventory/*` (14 routes) | products, stock, warehouses, POs, SOs, invoices, returns, transfers, suppliers, alerts, audit | `inventory.*`, `purchase_orders.*`, `stock_transfers.*` | inventory | items | product → stock → order → invoice | qty/price | negative stock (DB tests) | inventory_manager scoped | business RLS | yes | UI: `inventory.spec.ts`, `dashboard-nav.spec.ts` (smoke); DB: `test-inventory-*.mjs` |
| **Service (FSM)** | `/<slug>/service/*` (13 routes) | jobs, schedule, my-day, opportunities, estimates, invoices, customers, assessments, reports | `service.*`, `estimates.edit`, `invoices.*` | fsm | party | opportunity → estimate → job → invoice → payment | charges, email on file | -- | estimates/invoices permission | job/invoice id substitution | yes (DEF-007) | UI: `service.spec.ts` (+ board/table); API SEC-TI-03 (jobs); DB `test-fsm-*.mjs` |
| **CRM** | `/<slug>/crm/*` (16 routes) | leads, opportunities, conversations, follow-ups, reviews, channels, WhatsApp, routing | `crm.*`, `leads.manage`, `channel_connections.manage` | crm | parties | lead → opportunity → won/lost | -- | inbound webhook forged | channel management | business RLS | yes | UI: `crm.spec.ts`; HTTP: SEC-HTTP-02 (Meta/WhatsApp) |
| **Finance (gst)** | `/<slug>/finance/*` (34 routes) | accounts, journal, banking, bills, invoices, payables/receivables, GST ledger, filing, e-invoicing, e-way bill, reports | `gst.*`, `finance.view` | gst | activation | activate → post → statements | balanced journal | GSP not configured | accountant scoped | business RLS; **DEF-002** | yes | UI: `finance.spec.ts`; API sweep (found DEF-002); DB `test-gst-*.mjs`, `test-finance-*.mjs` |
| **Exports** | `/api/exports/[exportId]`, `/api/exports/jobs/[jobId]/download` | 60+ adapters, `export_jobs` | `*.export` | per adapter | rows | CSV/XLSX download | format/scope | unknown adapter/job | export permission | slug substitution | -- | HTTP: SEC-HTTP-04; INPUT CSV escaping; UI `exports.spec.ts` |
| **Attachments / storage** | (component-level) | Storage buckets | members | -- | -- | upload/download/sign | type/size (logo only) | missing object | -- | first path segment = tenant | -- | API: SEC-STO (`storage.spec.ts`) |
| **Webhooks & cron** | `/api/webhooks/*` (7), `/api/cron/*` (10) | signature / shared secret | -- | -- | -- | (provider deliveries) | signature | forged, replayed, unsigned | fail closed when unset | per payload | -- | HTTP: SEC-HTTP-01/02 (refusal paths only) |
| **Public portals** | `/p/e/[token]`, `/p/i/[token]`, `/p/center/[token]`, `/p/dr/[token]`, `/p/request/[slug]` | hashed tokens | anonymous | -- | sent document | open estimate/invoice | -- | guessed/expired token | token only | token bound to document | yes | HTTP: SEC-HTTP-05 (guessed tokens) |
| **Platform administration** | `/platform/*` (25 routes), `/platform/mfa` | `requireSuperadmin`, `platform.*` RLS | superadmin + aal2 | never licensed | admin row | modules, plans, billing, AI, branding, compliance… | per form | -- | non-admins redirected even at aal2 | n/a | -- | UI: SEC-PLAT (non-admin refusal incl. self-enrolled TOTP); **admin happy paths not run** (see gaps) |
| **AI features** | offering discovery, ICP, research, outreach drafting, reply classification, chat, CRM summaries | `lib/ai/*`, `core.ai_runs` | per feature | per module | provider key | generate → review | Zod schemas | provider down, malformed output | model never authorises | tenant-scoped context | -- | Unit: module vitest suites + `prompts/injection.test.ts`; **live model calls not run** (see gaps) |
| **Help / public site** | `/`, `/pricing`, `/privacy`, `/terms`, `/help`, `/help/[slug]` | static | anonymous | -- | -- | read | -- | -- | -- | -- | yes | UI: `unauthenticated/*.spec.ts`, `help.spec.ts` |

## Route appendix (generated)

<!-- 103/196 page routes visited by at least one spec -->

Coverage here is a heuristic: a route counts as visited when some spec file references its
last two path segments. It under-counts routes reached by clicking (not by URL) and
over-counts nothing material; treat **none** as "no spec navigates here by URL".

### Account dashboard & settings

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/dashboard` | authenticated, e2e/auth.setup.ts, multi-user, support, unauthenticated |
| `/dashboard/admin` | **none** |
| `/dashboard/settings` | authenticated, multi-user |
| `/dashboard/settings/ai-provider` | **none** |
| `/dashboard/settings/appearance` | **none** |
| `/dashboard/settings/billing` | authenticated |
| `/dashboard/settings/licenses` | authenticated |
| `/dashboard/settings/profile` | **none** |
| `/dashboard/settings/usage` | authenticated |

### Authentication

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/forgot-password` | unauthenticated |
| `/forgot-password/check-email` | unauthenticated |
| `/login` | authenticated, e2e/auth.setup.ts, multi-user, unauthenticated |
| `/reset-password` | authenticated, unauthenticated |
| `/signup` | authenticated, unauthenticated |
| `/signup/check-email` | unauthenticated |

### Business shell

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>` | **none** |
| `/<slug>/dashboard` | authenticated, e2e/auth.setup.ts, multi-user, support, unauthenticated |
| `/<slug>/not-licensed` | **none** |

### CRM

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/crm` | authenticated, multi-user |
| `/<slug>/crm/analytics` | **none** |
| `/<slug>/crm/channels` | authenticated |
| `/<slug>/crm/conversations` | authenticated |
| `/<slug>/crm/customers/[partyId]` | multi-user |
| `/<slug>/crm/dashboard` | authenticated |
| `/<slug>/crm/exceptions` | **none** |
| `/<slug>/crm/follow-ups` | authenticated |
| `/<slug>/crm/leads` | authenticated, multi-user |
| `/<slug>/crm/lost-business` | authenticated |
| `/<slug>/crm/opportunities` | authenticated |
| `/<slug>/crm/opportunities/[opportunityId]` | authenticated |
| `/<slug>/crm/reactivation` | **none** |
| `/<slug>/crm/reviews` | **none** |
| `/<slug>/crm/routing-rules` | authenticated |
| `/<slug>/crm/whatsapp` | **none** |

### Discovery

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/business` | authenticated, multi-user |
| `/<slug>/discovery/dashboard` | authenticated, multi-user, support |
| `/<slug>/discovery/offerings/[productId]` | authenticated, multi-user, support |
| `/<slug>/discovery/offerings/[productId]/conversions` | **none** |
| `/<slug>/discovery/offerings/[productId]/discovery` | **none** |
| `/<slug>/discovery/offerings/[productId]/history` | **none** |
| `/<slug>/discovery/offerings/[productId]/history/[runId]` | **none** |
| `/<slug>/discovery/offerings/[productId]/icp` | **none** |
| `/<slug>/discovery/offerings/[productId]/opportunities` | **none** |
| `/<slug>/discovery/offerings/[productId]/opportunities/[opportunityId]` | **none** |
| `/<slug>/discovery/offerings/[productId]/performance` | **none** |
| `/<slug>/discovery/offerings/[productId]/prospects` | **none** |
| `/<slug>/discovery/offerings/[productId]/prospects/[prospectId]` | **none** |
| `/<slug>/discovery/offerings/[productId]/prospects/discover` | **none** |
| `/<slug>/discovery/offerings/[productId]/prospects/import` | **none** |
| `/<slug>/discovery/offerings/[productId]/usage` | **none** |
| `/<slug>/discovery/offerings/[productId]/watchlist` | **none** |

### Discovery — Funding

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/discovery/funding` | authenticated, multi-user |
| `/<slug>/discovery/funding/analytics` | **none** |
| `/<slug>/discovery/funding/data-room` | **none** |
| `/<slug>/discovery/funding/due-diligence` | **none** |
| `/<slug>/discovery/funding/due-diligence/[itemId]` | **none** |
| `/<slug>/discovery/funding/investors` | authenticated |
| `/<slug>/discovery/funding/investors/[investorId]` | authenticated |
| `/<slug>/discovery/funding/outreach` | **none** |
| `/<slug>/discovery/funding/outreach/[outreachId]` | **none** |
| `/<slug>/discovery/funding/outreach/new` | authenticated |
| `/<slug>/discovery/funding/profile` | **none** |
| `/<slug>/discovery/funding/readiness` | **none** |
| `/<slug>/discovery/funding/rounds` | **none** |
| `/<slug>/discovery/funding/rounds/[roundId]` | **none** |

### Discovery — Marketing

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/discovery/marketing` | authenticated, multi-user |
| `/<slug>/discovery/marketing/analytics` | **none** |
| `/<slug>/discovery/marketing/assets` | **none** |
| `/<slug>/discovery/marketing/campaigns` | authenticated |
| `/<slug>/discovery/marketing/campaigns/[campaignId]` | authenticated |
| `/<slug>/discovery/marketing/campaigns/[campaignId]/edit` | **none** |
| `/<slug>/discovery/marketing/campaigns/new` | authenticated |
| `/<slug>/discovery/marketing/content` | **none** |
| `/<slug>/discovery/marketing/content/[contentId]` | **none** |
| `/<slug>/discovery/marketing/content/new` | authenticated |
| `/<slug>/discovery/marketing/strategy` | **none** |
| `/<slug>/discovery/marketing/website-seo` | **none** |

### Finance (gst)

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/finance/accounts` | multi-user |
| `/<slug>/finance/accounts/[accountId]` | multi-user |
| `/<slug>/finance/activate` | **none** |
| `/<slug>/finance/audit-log` | **none** |
| `/<slug>/finance/backfill` | **none** |
| `/<slug>/finance/banking` | **none** |
| `/<slug>/finance/banking/[bankAccountId]` | **none** |
| `/<slug>/finance/banking/rules` | **none** |
| `/<slug>/finance/bills` | **none** |
| `/<slug>/finance/budget` | **none** |
| `/<slug>/finance/dashboard` | authenticated |
| `/<slug>/finance/dimensions` | **none** |
| `/<slug>/finance/documents/[documentId]` | multi-user |
| `/<slug>/finance/einvoicing` | **none** |
| `/<slug>/finance/evidence` | **none** |
| `/<slug>/finance/eway-bill` | **none** |
| `/<slug>/finance/exceptions` | **none** |
| `/<slug>/finance/expenses` | **none** |
| `/<slug>/finance/filing` | authenticated |
| `/<slug>/finance/filing-readiness` | **none** |
| `/<slug>/finance/gst-ledger` | **none** |
| `/<slug>/finance/invoices` | **none** |
| `/<slug>/finance/journal` | **none** |
| `/<slug>/finance/journal/[entryId]` | **none** |
| `/<slug>/finance/journal/new` | **none** |
| `/<slug>/finance/operational-reports` | **none** |
| `/<slug>/finance/payables` | **none** |
| `/<slug>/finance/periods` | **none** |
| `/<slug>/finance/profile` | authenticated |
| `/<slug>/finance/receivables` | **none** |
| `/<slug>/finance/reconciliation` | authenticated |
| `/<slug>/finance/recurring` | **none** |
| `/<slug>/finance/registrations` | authenticated |
| `/<slug>/finance/reports` | **none** |

### Help

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/help` | authenticated, unauthenticated |
| `/help/[slug]` | authenticated, unauthenticated |

### Inventory

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/inventory/alerts` | **none** |
| `/<slug>/inventory/audit-log` | **none** |
| `/<slug>/inventory/customers` | **none** |
| `/<slug>/inventory/dashboard` | authenticated |
| `/<slug>/inventory/products` | authenticated, multi-user |
| `/<slug>/inventory/products/import` | **none** |
| `/<slug>/inventory/purchase-orders` | authenticated |
| `/<slug>/inventory/sales-invoices` | **none** |
| `/<slug>/inventory/sales-orders` | authenticated |
| `/<slug>/inventory/sales-returns` | **none** |
| `/<slug>/inventory/stock` | **none** |
| `/<slug>/inventory/suppliers` | **none** |
| `/<slug>/inventory/transfers` | **none** |
| `/<slug>/inventory/warehouses` | authenticated |

### Invitations

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/invite/[token]` | multi-user, unauthenticated |

### Onboarding

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/onboarding` | **none** |

### Platform administration

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/platform` | authenticated, multi-user |
| `/platform/ai-feature-policies` | multi-user |
| `/platform/ai-providers` | multi-user |
| `/platform/ai-routing` | multi-user |
| `/platform/ai-usage` | multi-user |
| `/platform/announcements` | multi-user |
| `/platform/audit` | multi-user |
| `/platform/billing` | multi-user |
| `/platform/billing/events` | multi-user |
| `/platform/billing/payments` | authenticated, multi-user |
| `/platform/billing/providers` | multi-user |
| `/platform/billing/subscriptions` | multi-user |
| `/platform/billing/subscriptions/[id]` | multi-user |
| `/platform/branding` | multi-user |
| `/platform/branding/preview` | **none** |
| `/platform/compliance` | multi-user |
| `/platform/compliance/packs/[id]` | **none** |
| `/platform/config-history` | multi-user |
| `/platform/email-provider` | multi-user |
| `/platform/email-templates` | multi-user |
| `/platform/feature-flags` | multi-user |
| `/platform/integrations` | multi-user |
| `/platform/modules` | multi-user |
| `/platform/notification-policies` | multi-user |
| `/platform/plans` | multi-user |
| `/platform/plans/[id]/entitlements` | **none** |
| `/platform/system-policies` | multi-user |
| `/platform/mfa` | multi-user |

### Public portals (token)

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/p/center/[token]` | multi-user |
| `/p/e/[token]` | multi-user |
| `/p/i/[token]` | multi-user |
| `/p/request/<slug>` | **none** |

### Public site

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/` | **none** |
| `/pricing` | unauthenticated |
| `/privacy` | unauthenticated |
| `/terms` | unauthenticated |

### Service (fsm)

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/service` | authenticated, multi-user |
| `/<slug>/service/assessments/[assessmentId]` | **none** |
| `/<slug>/service/customers` | multi-user |
| `/<slug>/service/invoices` | authenticated, multi-user |
| `/<slug>/service/invoices/[invoiceId]` | authenticated, multi-user |
| `/<slug>/service/jobs` | authenticated, multi-user |
| `/<slug>/service/jobs/[jobId]` | authenticated, multi-user |
| `/<slug>/service/my-day` | **none** |
| `/<slug>/service/opportunities` | authenticated |
| `/<slug>/service/opportunities/[opportunityId]` | authenticated |
| `/<slug>/service/reports` | **none** |
| `/<slug>/service/schedule` | authenticated |
| `/<slug>/service/settings` | **none** |

### Subscription & billing

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/billing` | authenticated, multi-user, unauthenticated |
| `/<slug>/billing/cancel` | **none** |
| `/<slug>/billing/change` | **none** |
| `/<slug>/billing/failed` | **none** |
| `/<slug>/billing/payments` | authenticated, multi-user |
| `/<slug>/billing/plans` | authenticated |
| `/<slug>/billing/review` | **none** |
| `/<slug>/billing/success` | authenticated |

### Usage

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/usage` | authenticated |

### Users, roles & API keys

| Route | E2E coverage (spec folders that visit it) |
|---|---|
| `/<slug>/admin/api-keys` | authenticated |
| `/<slug>/admin/roles` | authenticated, multi-user |
| `/<slug>/admin/roles/[roleId]` | authenticated, multi-user |
| `/<slug>/admin/roles/new` | authenticated, multi-user |
| `/<slug>/admin/team` | authenticated |
| `/<slug>/admin/users` | authenticated, multi-user |
| `/<slug>/admin/users/[memberId]` | authenticated, multi-user |
| `/<slug>/admin/users/activity` | **none** |
| `/<slug>/admin/users/invitations` | **none** |
