# FSM (Epic 5) build progress

Tracks story-by-story status for Epic 5 (`docs/plan/04-CLAUDE-CODE-BACKLOG.md`, full spec
in `docs/plan/02-FSM-PRD.md`). Unlike `docs/PORT-PROVENANCE.md`, FSM is built fresh, not
ported from `co-founder-ai`/`stockpilot-ai-ops` -- this doc exists because that one's
whole premise (source commit SHA per ported directory) doesn't apply here.

## Status

| Story | Status | Notes |
|---|---|---|
| F-1 | Done | `fsm` schema DDL |
| F-2 | Not started | Opportunities |
| F-3 | Not started | Estimates |
| F-4 | Not started | Public estimate page + send + approve/decline |
| F-5 | Not started | Jobs |
| F-6 | Not started | Scheduling |
| F-7 | Not started | Field execution |
| F-8 | Not started | Invoicing |
| F-9 | Not started | Reminders |
| F-10 | Not started | Customer Center + contact form |
| F-11 | **Blocked** | Messages tab on jobs -- see "Known blockers" below |
| F-12 | Not started | Reports |
| F-13 | Not started | Discovery -> FSM handoff |
| F-14 | Not started | Inventory <-> FSM integration |
| F-15 | Not started | FSM settings screens |

## Known blockers

**F-11 (Messages tab) blocked on S-3.** F-11's own spec says "reading `core.messages`" --
but `core.messages`/`core.threads`/`core.message_templates` are story `S-3`
(`docs/plan/04-CLAUDE-CODE-BACKLOG.md`), scheduled in **Epic 6** (after Epic 5 in the
backlog's own ordering) and not yet built. Per the entity-ownership map
(`00-MASTER-PLAN.md` §5) and CLAUDE.md non-negotiable #5 ("if the concept already has a
canonical home in `core`, use it — don't create a parallel one"), F-11 will not be
satisfied with a parallel `fsm`-only messages table. Deferred until S-3 lands.

## F-1 -- `fsm` schema DDL

`supabase/migrations/20260908010000_fsm_schema.sql`. Fourteen tables per PRD §3
(`service_types`, `job_charge_types`, `settings`, `opportunities`, `jobs`, `events`,
`event_assignees`, `time_entries`, `expenses`, `notes`, `signatures`,
`recurring_templates`, `portal_tokens`, `work_requests`), all `tenant AND licensed` RLS
(ADR-4/ADR-8), all with a dedicated cross-tenant reference-enforcement trigger for every
FK that could smuggle another tenant's row in (mirrors `inventory.enforce_warehouse_
business_id()`/`enforce_item_business_id()`, SP-3a).

Deliberate choices worth recording:
- Every table carries its own `business_id`, including ones the PRD's own schema sketch
  omits it from (`event_assignees`) -- keeps the same direct `tenant AND licensed` RLS
  pattern everywhere, no derived-via-join RLS anywhere in this schema.
- Status/kind/source columns are real Postgres enums (matching `inventory`'s own
  precedent for module-owned, non-cross-extended vocabularies), not `text + check` like
  `core.documents.status` (which needs cross-module extension FSM's own columns don't).
- FSM's invoices/credit notes reuse `inventory`'s existing `core.number_sequences` scopes
  (`'invoice'`/`'INV'`, `'credit_note'`/`'CN'`) rather than a separate FSM-prefixed
  series -- GST requires one continuous invoice number sequence per business regardless
  of which module issued it. New scopes for FSM-only document kinds: `'job'`/`'JOB'`,
  `'opportunity'`/`'OPP'`, `'estimate'`/`'EST'`.
- `source_prospect_id`/`marketing_source_id` on `fsm.opportunities` are bare `uuid`
  columns with no FK constraint (discovery lives in another module's schema; CLAUDE.md
  non-negotiable #1 restricts cross-schema FKs to `core` only) -- same precedent as
  `inventory.alerts.entity_id`. Resolved/validated in application code by F-13.
- `packages/module-fsm` skeleton created (package.json/tsconfig/db wrappers/manifest.ts),
  matching `module-inventory`'s own SP-7a/SP-9 pattern.
- Sidebar: added `SERVICE_NAV` to `packages/core/src/components/shell/app-sidebar.tsx`
  covering every route in PRD §5 (Dashboard, Opportunities, Jobs, Schedule, My Day,
  Invoices, Customers, Reports, Settings), all under the module-registry's existing
  `fsm` entry (`name: "Service"`) -- one "Service" module menu, not a top-level "FSM"
  label, per this epic's own explicit nav requirement. Routes 404 until each F-story
  lands, same "link now, build later" pattern `INVENTORY_NAV` established.
- Live-caught and fixed two real production-parity gaps before finalizing (found by
  running `get_advisors` against the dev project, same rigor the admin-seeder and SP-9
  work this session already established):
  1. `fsm` was missing from PostgREST's `pgrst.db_schemas` exposed-schemas list on the
     `authenticator` role (the same gap `20260907150000_gst_credentials_schema.sql`'s own
     comment documents for `gst`) -- fixed both live (`ALTER ROLE`) and in the migration
     file itself (guarded by `if exists` so the local test harness, which has no
     `authenticator` role, is unaffected).
  2. The 11 per-table cross-tenant-enforcement trigger dispatcher functions
     (`fsm.enforce_opportunities_refs()` etc.) were missing `security definer set
     search_path`, unlike `inventory`'s own equivalent dispatchers -- fixed in the
     migration file and live via `ALTER FUNCTION`, confirmed clean on a second
     `get_advisors` run.

New test: `scripts/test-fsm-rls.mjs` (wired into `test:db`) -- no-license/grace/active
license-gating, the `opportunities` lost-reason and `events` job-or-opportunity check
constraints, `time_entries`' one-open-entry-per-employee constraint and generated
`duration_minutes` column, tenant isolation across two licensed businesses, and five
representative cross-tenant reference-smuggling triggers (party_id on opportunities,
service_type_id on jobs, job_id on time_entries, employee_id on event_assignees in both
directions).

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db`
suite green; live-applied to the dev Supabase project (`jazdtomcgqjxjueedmck`) and
confirmed clean on Supabase's own security advisor.
