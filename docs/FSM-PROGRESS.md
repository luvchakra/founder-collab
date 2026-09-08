# FSM (Epic 5) build progress

Tracks story-by-story status for Epic 5 (`docs/plan/04-CLAUDE-CODE-BACKLOG.md`, full spec
in `docs/plan/02-FSM-PRD.md`). Unlike `docs/PORT-PROVENANCE.md`, FSM is built fresh, not
ported from `co-founder-ai`/`stockpilot-ai-ops` -- this doc exists because that one's
whole premise (source commit SHA per ported directory) doesn't apply here.

## Status

| Story | Status | Notes |
|---|---|---|
| F-1 | Done | `fsm` schema DDL |
| F-2 | Done | Opportunities |
| F-3 | Done | Estimates |
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

## F-2 -- Opportunities

`supabase/migrations/20260908020000_fsm_opportunities_permissions.sql` adds one new
permission key, `opportunities.edit` (module `fsm`), granted to `owner`/`admin` only --
no new FSM-specific role yet (CLAUDE.md principle 7 bans speculative functionality;
nothing in F-2 needs a role finer than owner/admin vs viewer). Reads are never
permission-gated beyond `fsm.opportunities`' own tenant-AND-licensed RLS (F-1) -- matches
`inventory`'s own precedent where even a viewer can read.

`packages/module-fsm/src/lib/{tenancy,tags,custom-fields,service-types,opportunities}/`
+ `components/opportunities/` + two new routes
(`apps/web/.../fsm/opportunities/{page.tsx,[opportunityId]/page.tsx}`, each with its own
`actions.ts`). Notable choices:
- `core.tags`/`core.taggings`/`core.custom_field_defs`/`core.custom_field_values` (D-8)
  are consumed directly, not recreated -- FSM's own `entity_type`/`taggable_type` values
  (`'opportunity'`) needed no schema change since D-8 left those columns as plain,
  unconstrained text.
- Creating an opportunity either picks an existing `core.parties` row or creates one
  inline; either way the party is given the `customer` role if it doesn't already have
  one (idempotent insert, matches the entity-ownership map's "winning a prospect ADDS the
  role, doesn't copy a record" -- this is the same mechanism, just triggered by a manual
  opportunity instead of a won prospect).
- The board view's columns are read-only (no drag) -- the PRD's own drag interaction is
  specific to Scheduling (F-6), not the opportunities pipeline; status only ever advances
  through an opportunity's own explicit actions.
- `reopenLostOpportunity()` (lost -> new) isn't itself a PRD-documented transition (the
  PRD's §4 state machine only documents `won -> new` as an explicit "undo", gated on the
  job having no events/charges -- not buildable until F-5's jobs land) -- added anyway as
  the obvious low-risk corollary of "nothing auto-advances to Lost, human intent
  required": undoing a mistaken Lost needs the same human-intent standard as making one.
- `won -> new`, `new|estimate_scheduled -> estimate_sent` (send an estimate), and
  `estimate_sent -> won` (customer approval) are NOT part of F-2 -- those depend on
  F-3/F-4's estimate flow and F-5's jobs, deliberately out of scope here.

Existing test `scripts/test-discovery-rls.mjs` hardcoded the exact size of
`core.permissions` (32) -- bumped to 33 and its own comment updated, the same kind of
update `stock_transfers.*`/`sales_returns.*` additions already required historically.

No new SQL-level test file: F-2 added no new SQL primitives beyond the one permission
key (already covered by the updated count assertion above) -- the tables it reads/writes
(`fsm.opportunities`, `core.parties`/`party_roles`, `core.tags`/`taggings`,
`core.custom_field_defs`/`values`) each already have their own dedicated RLS/behavior
test from F-1 and D-8. Instead, the actual application-level mutation flow (create with
an inline new customer, idempotent customer-role attach, default status, `has_permission`
check, add/read a tag, set/read a custom field value, mark lost with reason, reopen) was
live-verified end-to-end against the dev Supabase project inside one rolled-back
transaction (self-cleaning) as the authenticated business owner, with no assertion
failures.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db`
suite green (including the updated permission-count assertion); `npm run build
--workspace=apps/web` succeeds (both new routes compile and register); live end-to-end
verification against the dev Supabase project as described above.

## F-3 -- Estimates

Two small migrations. `20260908030000_core_document_lines_job_charge_type.sql` adds a
bare `job_charge_type_id uuid` column (no FK) to `core.document_lines` -- CLAUDE.md's
cross-schema-FK-only-into-`core` rule means a `core` table can't formally reference an
`fsm`-schema table, so this follows the same bare-uuid, app-validated pattern already used
by `inventory.alerts.entity_id` and `fsm.opportunities.source_prospect_id`.
`20260908040000_fsm_estimates_permissions.sql` adds `estimates.edit` (module `fsm`),
granted to `owner`/`admin` only -- a distinct key from `opportunities.edit` because
Kickserv's own permission matrix (PRD §12) separates "Job charges" from "Jobs" as
categories, so a future finer-grained role (e.g. an estimator) could get one without the
other.

`packages/module-fsm/src/lib/{job-charge-types,estimates}/` +
`components/estimates/estimate-builder.tsx`, wired into the existing opportunity detail
page/actions rather than a new route. Notable decisions:
- **One estimate per opportunity.** The PRD's "multiple estimate options (good/better/
  best)" is explicitly a SHOULD/LATER item, not MUST -- `getOrCreateEstimate()` finds or
  lazily creates a single `core.documents` row (`doc_type='estimate'`,
  `source_module='fsm'`, `source_ref={opportunity_id}`) the first time a charge line is
  added. Before that, the opportunity detail page shows the builder with no estimate yet
  (`estimate: Estimate | null`) rather than pre-creating an empty draft document for every
  opportunity.
- **Ad-hoc charges are inline `core.items` creation, not a separate concept.**
  `document_lines.item_id` is `NOT NULL` and shared with `inventory`, so "ad-hoc" (the
  PRD's own term) just means creating a new `core.items` row (`kind='service'`) on the
  fly rather than picking an existing catalog item -- matches the entity-ownership map's
  "Kickserv's Items, StockPilot's products, and FSM charge items are one `core.items`
  table."
- **Tax computed server-side**, reusing `@cofounderai/core/lib/gst.ts`'s
  `computeLineGst`/`aggregateGst`/`resolveStateCode` (the same functions
  `module-inventory`'s purchase-orders already use) from the business's own
  `core.business_settings` (seller gstin/state) and the customer's `core.tax_identities`
  (buyer gstin/state) -- never trusting a client-supplied tax amount for a financial
  document. Every add/update/delete of a charge line triggers a full recompute of that
  line's CGST/SGST/IGST split plus the estimate document's aggregated totals.
- **Reorder via up/down buttons**, not drag-and-drop -- satisfies the PRD's "reorderable
  by drag handle" requirement's actual effect (explicit, persisted ordering) without
  adding a new DnD dependency (CLAUDE.md principle 2).
- `inr` (the existing `Intl.NumberFormat` instance in `@cofounderai/core/lib/format.ts`,
  already used by `module-inventory`'s dashboard/products views) is reused for currency
  display -- no new `formatCurrency` export was added.

Existing test `scripts/test-discovery-rls.mjs` hardcoded the exact size of
`core.permissions` (33) -- bumped to 34 for `estimates.edit`, same recurring update
pattern as F-2.

No new SQL-level test file: the two migrations add a nullable column and two
permission-catalog rows, both already covered by the updated count assertion and by
`core.document_lines`' own pre-existing RLS test from D-6. The actual estimate-building
flow was live-verified end-to-end against the dev Supabase project inside one
self-cleaning (rolled-back) transaction as the authenticated business owner: create an
opportunity, lazily create its estimate, add an existing-catalog-item charge line and an
ad-hoc charge line, confirm the GST split is correct for an interstate (seller
Maharashtra, buyer Delhi -- IGST-only) customer, update a line's quantity and confirm the
recompute, reorder lines, delete a line and confirm the remaining total, and confirm the
`estimates.edit` permission-catalog wiring (key present, granted to exactly
owner+admin) -- no assertion failures, zero residue after rollback.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db`
suite green (including the updated permission-count assertion); `npm run build
--workspace=apps/web` succeeds; Supabase security advisor shows no new findings; live
end-to-end verification against the dev Supabase project as described above.
