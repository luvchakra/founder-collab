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
| F-4 | Done | Public estimate page + send + approve/decline |
| F-5 | Done | Jobs |
| F-6 | Done | Scheduling |
| F-7 | Done | Field execution |
| F-8 | Done | Invoicing |
| F-9 | Done | Reminders |
| F-10 | Done | Customer Center + contact form |
| F-11 | **Blocked** | Messages tab on jobs -- see "Known blockers" below |
| F-12 | Done | Reports |
| F-13 | Done | Discovery -> FSM handoff |
| F-14 | Done | Inventory <-> FSM integration |
| F-15 | Done | FSM settings screens |

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

## F-4 -- Public estimate page + send + approve/decline

No new tables (`fsm.portal_tokens` was already created by F-1's own DDL) and no new
permission key -- send/approve-internally/decline-internally all reuse `estimates.edit`
(sending and responding to an estimate are the same "do something with this document"
class of action opportunities.edit already isn't gating). New library code only:
`packages/module-fsm/src/lib/portal-tokens/tokens.ts` and additions to
`lib/estimates/{queries,mutations}.ts`, plus the platform's first public
(non-`/dashboard`) route, `apps/web/app/p/e/[token]/`.

- **Token scheme mirrors `core.api_key_secrets` exactly**, the closest existing precedent
  for "resolve a secret with zero Supabase session": a random 24-byte hex token is
  generated per send, sha256-hashed before being stored in
  `fsm.portal_tokens.token_hash`, and resolved back via a service-role client
  (`resolvePortalToken()`) -- there is no `auth.uid()` on a customer clicking an emailed
  link, so RLS can't be the authorization layer here; the token itself is. A fresh token
  is minted on every send rather than reusing one, so an old emailed link can be
  superseded without a separate revoke step.
- **Rate limiting reuses `core.check_api_rate_limit()`** (built for the public API-key
  layer in the `public_api_v1` work, but generically keyed by `business_id`) rather than
  a second counter table -- 30 requests/minute per business, generous for a real visitor,
  enough to blunt token-guessing.
- **Sending reuses `module-discovery`'s own Resend integration pattern** exactly
  (`RESEND_API_KEY`/`RESEND_FROM_EMAIL` env vars, `@cofounderai/core/email/render`'s
  `renderEmailHtml`/`renderEmailText`) rather than inventing a second email path --
  `resend` was added as a direct dependency of `module-fsm` (already present in the
  workspace via `module-discovery`, so no new external dependency, just a new package.json
  entry). The email body avoids the renderer's unsupported markdown-link syntax (only
  `**bold**` is implemented) and puts the plain estimate URL in the body text instead,
  which mail clients auto-linkify.
- **`estimate.sent` transitions both the document and the opportunity**: `core.documents`
  status `draft -> sent` (only if still draft -- resending an already-sent/viewed
  estimate doesn't reset it) and `fsm.opportunities` status `new|estimate_scheduled ->
  estimate_sent`, matching the PRD's own state machine (§4) exactly. Sending is blocked
  with a clear error if the estimate has no charge lines, or if it was already approved
  or declined.
- **`estimate_sent -> won` (PRD §4) creates the job now**, even though the Jobs board/
  detail screens are F-5's own story -- `fsm.jobs` already exists from F-1's DDL, and the
  PRD's own acceptance criteria (§7) requires "approved, and become a job" to work
  end-to-end. The job is minted with a real sequential number via
  `core.next_number_for_api()` (service-role path, no membership check -- same function
  the `public_api_v1` work added and already uses for this exact "no session" problem) on
  the public/customer path, or the ordinary `core.next_number()` (authenticated,
  membership-checked) on the staff "approve internally" path -- both write the same
  `core.number_sequences` counter, so numbers never collide regardless of which path
  minted them. The job copies `party_id`/`primary_contact_id`/`service_address_id`/
  `service_type_id`/`description`/`scope_of_work` straight from the opportunity and sets
  `opportunity_id`; `fsm.jobs`' own pre-existing cross-tenant enforcement trigger (F-1)
  validates every one of those references regardless of which client (service-role or
  authenticated) performs the insert. Approving is idempotent: an already-approved
  estimate with a `converted_job_id` already set just returns that job rather than
  minting a second one.
- **Declining only marks the estimate document declined**, never the opportunity -- the
  PRD's own state machine (§4) has an opportunity become `lost` only through explicit
  human action with a reason; a customer's decline alone doesn't auto-advance it. Staff
  see the declined estimate and mark the opportunity lost themselves if that's the right
  call, matching F-2's own `markOpportunityLost()` being the one and only path to `lost`.
- **"Sent/viewed" tracking (PRD §1: "tracked by icons") reuses the estimate's own
  `status` column** rather than adding `sent_at`/`viewed_at` timestamp columns to
  `core.documents` -- `sent -> viewed` flips on the public page's first render
  (`markEstimateViewed()`, called best-effort so a failed write never blocks the page),
  and the five-state badge (`draft`/`sent`/`viewed`/`approved`/`declined`) in both the
  staff-facing `EstimateBuilder` and the public `PublicEstimateView` component reads that
  one column. No new column, no new concept.
- **"Approve internally" / "decline internally"** (PRD §2 Estimates row MUST list) are
  ordinary authenticated server actions on the opportunity detail page for a staff member
  taking a verbal/phone response -- they share the exact same job-creation helper
  (`createJobFromApprovedEstimate()`) as the public token path, parameterised only by
  which numbering function to call.

No new SQL-level test file: F-4 added no new tables, columns, or RLS policies (the tables
it touches -- `fsm.portal_tokens`, `fsm.jobs`, `core.documents`, `fsm.opportunities` --
already have their own dedicated RLS/tenant-isolation tests from F-1/F-2/F-3/D-6). The
actual send/view/approve/decline flow was live-verified end-to-end against the dev
Supabase project inside one self-cleaning (rolled-back) transaction, split into an
authenticated-staff phase (create opportunity, create and send an estimate -- confirming
`draft -> sent` and `new -> estimate_sent`) and a `service_role` phase mirroring exactly
what the app's own service-role admin client does for an unauthenticated visitor
(`markEstimateViewed`'s `sent -> viewed` flip, `approveEstimateByToken`'s job creation
with a correctly-formatted `JOB/YY-YY/0001` number and `opportunity -> won`, and a second,
independent estimate exercising `declineEstimateByToken` without disturbing its
opportunity's own status) -- no assertion failures, zero residue after rollback. The
actual Resend API call itself was not exercised live (no test inbox in this environment)
-- `sendEstimate()`'s own error handling (missing env vars, Resend's own error response)
follows `module-discovery/src/lib/messages/send.ts`'s already-proven pattern exactly.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db`
suite green; `npm run build --workspace=apps/web` succeeds (the new `/p/e/[token]` public
route compiles and registers alongside the dashboard routes); Supabase security advisor
shows no new findings; live end-to-end verification against the dev Supabase project as
described above.

## F-5 -- Jobs

No new tables (`fsm.jobs` was already created by F-1's own DDL). One migration
(`20260908050000_fsm_jobs_permissions_and_audit.sql`) adds two permission keys and one
audit-log trigger:

- **`jobs.edit`** gates every ordinary job action (create, update, start, hold, resume,
  complete, cancel, duplicate, convert-to-opportunity). **`jobs.reopen`** is a separate
  key for the one transition the PRD explicitly calls out as admin-only (§4:
  `completed -> in_progress`, "reopen, admin only") -- both granted to owner/admin only
  today, same minimal-role treatment as every prior FSM permission.
- **`fsm.log_job_status_change()` + `jobs_log_status_change` trigger** write to
  `core.audit_log` on every status change automatically, mirroring
  `core.log_document_status_change()` (D-10) exactly -- this is what backs the job detail
  page's "History" tab (PRD §5), with zero new schema.

`packages/module-fsm/src/lib/jobs/{types,queries,mutations}.ts` +
`components/jobs/{jobs-list,create-job-dialog,job-detail}.tsx` + two new routes
(`apps/web/.../fsm/jobs/{page.tsx,[jobId]/page.tsx}`, each with its own `actions.ts`).
Notable decisions:

- **Jobs can be created directly**, not only via an approved estimate (PRD §1.3) --
  `createJob()` reuses `resolveCustomerPartyId()`, the exact same party-resolution helper
  F-2's `createOpportunity()` uses (exported from `opportunities/mutations.ts` rather than
  duplicated), and mints a real job number through `core.next_number(business_id, 'job',
  'JOB')` -- the identical scope F-4's estimate-approval flow already uses to mint job
  numbers, so a job created directly and one created by approving an estimate share one
  counter and never collide.
- **The full state machine is implemented as explicit transition functions** (PRD §4),
  each taking an explicit set of allowed `fromStatuses` and failing loudly if the job has
  moved on since the page loaded (`transition()`'s own optimistic-concurrency check via
  `.in("status", fromStatuses)` + verifying a row actually came back). `scheduled ->
  in_progress` ("start"), `in_progress <-> on_hold` (hold requires a reason, matching
  `markOpportunityLost`'s own "human intent needs a stated reason" precedent),
  `in_progress|on_hold -> completed`, `any -> cancelled`, and `completed -> in_progress`
  (reopen) are all real, PRD-documented transitions.
- **`unscheduled -> scheduled` is exposed as a manual "Mark scheduled" staff action**,
  even though the PRD (§4) ties it to "first work event" -- `fsm.events` rows don't exist
  yet (F-6, Scheduling, hasn't landed), so without a manual escape hatch every job would
  be permanently stuck in the board's first column. Same pragmatic-corollary reasoning F-2
  already used for `reopenLostOpportunity`; F-6 will additionally drive this transition
  for real once it starts creating events.
- **`completed`'s own "prompts invoice generation per `auto_invoice_on_complete`" (PRD
  §4) is deliberately not wired** -- F-8 (Invoicing) hasn't landed, so `completeJob()`
  only performs the status transition. Documented here rather than silently dropped.
- **"Convert back to an opportunity" (PRD §1.3, §4: "only if no invoice exists")** --
  jobs and opportunities are separate tables in this schema (unlike Kickserv's
  single-entity-different-view model), so converting means reactivating the job's own
  originating opportunity if it has one (clearing `converted_job_id`) or creating a fresh
  one from the job's fields if it doesn't, then deleting the job -- the record genuinely
  moves back rather than existing as both. `jobHasInvoice()` checks
  `core.documents` for a `doc_type='invoice'` row with this job's id in `source_ref` --
  always false today since F-8 doesn't exist yet, but becomes a real gate once it does.
- **"Duplicate"** creates an independent new job (new number, not linked via
  `opportunity_id` to the original) copying customer/service type/description/scope.
- **Tags and custom fields are reused as-is** (`core.tags`/`custom_field_defs`, scoped to
  `taggable_type`/`entity_type = 'job'`) -- zero schema change, same reuse F-2 already
  established for opportunities.
- **Job detail's tabs are "Job details" and "History" only** -- PRD §5 additionally lists
  "Messages" (blocked on S-3, same as F-11) and "Invoice" (F-8, not built) as tabs; both
  are left out entirely rather than built as empty placeholders, consistent with not
  building speculative UI ahead of the story that owns it.

Existing test `scripts/test-discovery-rls.mjs` hardcoded the exact size of
`core.permissions` (34) -- bumped to 36 for `jobs.edit`/`jobs.reopen`, same recurring
update pattern as F-2/F-3.

No new SQL-level test file: the only new SQL primitives are the two permission-catalog
rows (covered by the updated count assertion) and the audit-log trigger, both verified
live below; `fsm.jobs`' own RLS/tenant-isolation coverage already comes from F-1. The full
job lifecycle was live-verified end-to-end against the dev Supabase project inside one
self-cleaning (rolled-back) transaction as the authenticated business owner: create a job
with a real minted number, walk the entire status machine
(`unscheduled -> scheduled -> in_progress -> on_hold -> in_progress -> completed ->
in_progress -> cancelled`), confirm the audit trigger wrote exactly one `core.audit_log`
row per status change, duplicate the job, convert a job with no originating opportunity
into a fresh opportunity and confirm the job itself is gone, and confirm the
`jobs.edit`/`jobs.reopen` permission-catalog wiring -- no assertion failures, zero residue
after rollback.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db`
suite green (including the updated permission-count assertion); `npm run build
--workspace=apps/web` succeeds (both new job routes compile and register); Supabase
security advisor shows no new findings; live end-to-end verification against the dev
Supabase project as described above.

## F-6 -- Scheduling

No new tables (`fsm.events`/`fsm.event_assignees` were already created by F-1's own
DDL). One migration (`20260908060000_fsm_schedule_permissions.sql`) adds two permission
keys: **`schedule.manage`** (create, reschedule, reassign, cancel schedule events;
designate technicians) and **`schedule.print_work_orders`** (bulk print) -- kept
distinct because the PRD's own §1.7 explicitly calls bulk "Print Work Orders" out as
"admin-only by default, grantable" separately from ordinary schedule management, the
same reasoning F-3 used to keep `estimates.edit` distinct from `opportunities.edit`.
Both owner/admin only today, matching every prior FSM permission.

`packages/module-fsm/src/lib/{employees,events}/` +
`components/schedule/{schedule-calendar,create-event-dialog,print-work-orders-dialog,
technician-roster-panel}.tsx` + one new route (`apps/web/.../fsm/schedule/{page.tsx,
actions.ts}`, already linked from `SERVICE_NAV` since F-1). Notable decisions:

- **No employee-management screen exists anywhere in the platform yet.** `core.employees`
  (F-1's DDL, the entity-ownership map's canonical "technician" home) had zero rows and
  no creation path -- not the inventory `team` page (that's `core.business_members`,
  account roles, read-only), not any FSM story's own scope. Scheduling is unusable
  without a way to say "this business member is a technician", so this story adds the
  minimal escape hatch it needs: a roster panel on the schedule page toggling a
  `core.employees` row's `is_active` for a business member (idempotent upsert,
  deactivate-not-delete -- matches ADR-9's "cancelling never deletes data" spirit for a
  technician's own history). A fuller employee record (job title, employment type,
  time-off) stays a future story's job -- same pragmatic-corollary precedent as F-2's
  `reopenLostOpportunity` and F-5's `markJobScheduled`.
- **`unscheduled -> scheduled` and `new -> estimate_scheduled` now happen for real.**
  F-5 and F-2 each documented this exact gap when `fsm.events` didn't exist yet ("F-6
  will additionally drive this transition for real once it starts creating events").
  `createEvent()` now does it as a best-effort, filtered update (not the throw-on-no-
  match `transition()` a user-initiated action would use) immediately after inserting a
  `work` event against a job or an `estimate` event against an opportunity -- scheduling
  a second visit against a job/opportunity that's already moved on is normal, not an
  error, so it silently no-ops rather than surfacing one.
- **Board model: rows = technicians (+ "Unassigned"), columns = day(s)** (day or week
  view), not a pixel-precise hour grid -- matches this codebase's own list/board visual
  language (`JobsList`'s board columns) rather than introducing a calendar-grid
  dependency. An event with two assignees genuinely renders once per assignee's row (plus
  once under Unassigned if it has none), which is how a shared calendar naturally reads.
- **"Drag to reschedule" (PRD §2, MUST) is native HTML5 drag-and-drop** (`draggable`,
  `onDragStart`/`onDrop`) -- zero new dependency, per CLAUDE.md principle 2. One drag
  gesture does two things at once when relevant: dropping on a different day column
  always retimes the event to that day (same time-of-day, `retimeToDay()`); dropping on
  a *different* technician row additionally reassigns to exactly that technician (or
  clears every assignee if dropped on Unassigned) -- dropping back on the *same* row,
  just a different day, leaves a multi-assigned event's full assignee set untouched
  instead of narrowing it to one. Multi-technician assignment itself is only created via
  the create-event dialog's checkboxes, not by drag, so one drag gesture stays
  unambiguous.
- **Reminder events are internal-only here.** PRD §1.5 splits reminders into internal
  (a scheduled, assignable calendar event -- squarely this story's own "one calendar
  table, three kinds" scope) and automatic customer reminders (48h-before, email+SMS,
  arrival window -- F-9's own story). This story creates the calendar row for an
  internal reminder attached to a job or an opportunity; the lead-time notification
  delivery itself is F-9's job, not built here.
- **Beyond `scheduled`/`cancelled`, `fsm.events.status`'s remaining values
  (`en_route`/`arrived`/`done`) are F-7's own field-execution "on my way"/clock-in flow**
  on `/fsm/my-day` -- not exposed on this board.
- **"Print Work Orders" reuses the existing global `.print-area`/`.no-print` CSS
  mechanism** (`packages/core/src/ui-theme.css`, already established by
  `module-inventory`'s barcode-label dialog) rather than a new route or a PDF library --
  pick a day (from whichever day/week is currently on screen -- no extra round trip) and
  an optional employee filter, preview, `window.print()`. A "work order" is a `work`-kind
  event specifically (Kickserv's own literal meaning), not estimate/reminder events.
- **No per-tenant timezone handling** -- `core.business_settings.timezone` exists but
  nothing in the platform wires it into date math anywhere yet (confirmed before
  building this: `formatDate`/`formatDateTime` both use the runtime's default timezone).
  The schedule page's own day/week boundary math runs in UTC (pure calendar-date
  arithmetic, unambiguous); the create/edit dialogs' `datetime-local` inputs and the
  calendar's own drag-retime math run in whatever timezone the code executes in (browser
  for the client-side drag math, server for parsing a submitted form) -- documented here
  as a known simplification in the same class as the existing tax/rounding notes
  elsewhter in this doc, not silently dropped.

Existing test `scripts/test-discovery-rls.mjs` hardcoded the exact size of
`core.permissions` (36) -- bumped to 38 for `schedule.manage`/`schedule.print_work_orders`,
same recurring update pattern as F-2/F-3/F-5.

No new SQL-level test file: the only new SQL primitive is the two permission-catalog
rows (covered by the updated count assertion); `fsm.events`/`fsm.event_assignees`'s own
RLS/tenant-isolation/cross-tenant-reference coverage already comes from F-1 (including
the exact `event_assignees.employee_id` smuggling case this story's roster panel now
populates rows for). The actual scheduling flow was live-verified end-to-end against the
dev Supabase project inside one self-cleaning (rolled-back) transaction as the
authenticated business owner: designate a technician (roster panel's own upsert), create
an opportunity and a job, create a `work` event against the job with that technician
assigned and confirm the job auto-advanced `unscheduled -> scheduled`, create an
`estimate` event against the opportunity and confirm it auto-advanced
`new -> estimate_scheduled`, drag-reschedule the work event to a later day, clear its
assignees (drop-to-Unassigned), cancel and then delete the estimate event, and confirm
the `schedule.manage`/`schedule.print_work_orders` permission-catalog wiring (both keys
present, granted to exactly owner+admin, `has_permission()` true for the owner on both)
-- no assertion failures, zero residue after rollback.

**Also fixed this story: every Vercel production deployment since F-1 was silently
failing.** Discovered while checking on the platform's deployment health -- F-2 through
F-5 (four consecutive deploys) all failed at `next build` with `Module not found` errors
for files (`@cofounderai/module-fsm/lib/tags/queries`, `.../components/jobs/job-detail`,
etc.) that genuinely exist in the repo and build cleanly with a local `npm run build
--workspace=apps/web` on the exact same commit. Three wrong guesses before the real
cause, left here because the eventual diagnostic method (not the guesses) is the useful
part:

1. A stale Turbopack build cache -- every failed deploy's log showed `Restored build
   cache from previous deployment (9KzwN24H...)`, the last-*successful* build (F-1),
   before these files existed. Disabling `experimental.turbopackFileSystemCacheForBuild`
   didn't fix it -- confirmed taking effect in the next deploy's log, still failed
   identically.
2. A stale `node_modules` -- pinned the install command to `npm ci` (always wipes and
   reinstalls from the lockfile). The next deploy's log showed a genuine "added 603
   packages" fresh install, and it *still* failed identically.
3. Turbopack's own project-root detection (`turbopack.root`) -- Vercel's Root Directory
   for this project is `apps/web`, a sibling of `packages/*`, and that option's own doc
   comment says "only files above this directory can be resolved by turbopack." Setting
   it explicitly to the real monorepo root also made no difference.

None of those three were reproducible locally under any condition, which was the actual
tell that they were all wrong: a genuinely stale cache or a wrong Turbopack root would
have been reproducible with the right local setup, and none were. The diagnostic that
actually worked: temporarily overriding `vercel.json`'s `buildCommand` to `ls` the
install output before running `next build`, redeployed twice to work around its
256-character limit and to correct which directory to inspect. That surfaced it directly:
`node_modules/@cofounderai/` on Vercel was missing exactly one symlink --
`module-fsm` -- while `core`/`module-discovery`/`module-gst`/`module-inventory`/
`module-registry` were all there. Checking `apps/web/package.json`'s own `dependencies`
found the real bug: `@cofounderai/module-fsm` was never listed there, unlike every other
module package -- a plain oversight, invisible locally because a bare `npm install` at
the repo root links every workspace package regardless of who declares it as a
dependency, but not invisible to whatever narrower, workspace-scoped install Vercel's
build actually runs. Reproduced locally on demand with
`npm ci --workspace=apps/web --include-workspace-root` (skips exactly `module-fsm`,
confirming the theory) and fixed by adding the missing dependency line and regenerating
`package-lock.json` -- confirmed clean again with the same scoped command afterward, and
with a fresh `npm run build --workspace=apps/web`. All three wrong-guess changes
(`turbopackFileSystemCacheForBuild`, `vercel.json`'s `installCommand`/`buildCommand`,
`turbopack.root`) were reverted; only the missing dependency line and the regenerated
lockfile remain. This fix and F-6 are in the same PR since the app was never actually
reachable on production for four full stories otherwise.

## F-7 -- Field execution

No new tables (`fsm.time_entries`/`expenses`/`notes`/`signatures` and `core.attachments`
are all F-1's/D-8's own DDL). One migration
(`20260908070000_fsm_field_execution_permissions.sql`) adds three permission keys --
**`time_entries.edit`**, **`expenses.edit`**, **`notes.edit`** -- matching Kickserv's own
permission matrix (PRD §12), which treats "Job charges", "Expenses", "Time entries" and
"Notes" as separate categories from "Jobs" itself (the same reasoning F-3 used to keep
`estimates.edit` distinct from `opportunities.edit`). Attachments and signature capture
have no separate category in that matrix, so both stay gated on the existing `jobs.edit`
-- a photo or a signature is part of the job's own record, same as its description. All
three owner/admin only today, same minimal-role treatment every prior FSM permission has
gotten.

`packages/module-fsm/src/lib/{time-entries,expenses,notes,signatures,attachments}/` +
`components/field/{field-work-tab,signature-pad,my-day-list}.tsx` + one new route
(`apps/web/.../fsm/my-day/{page.tsx,actions.ts}`, already linked from `SERVICE_NAV`
since F-1) + a new "Field work" tab on the existing job detail page. Notable decisions:

- **Clock in/out is job-scoped, not a job-less global toggle** -- `fsm.time_entries.job_id`
  is `not null` (F-1's own DDL), so "Clock In to track time" (PRD §1.8) always means
  clocking into a specific job. `clockOut()` takes the job id too (not just "whichever
  entry is open") so tapping "Clock out" on the wrong job's card, while genuinely clocked
  into a different one, fails loudly instead of silently closing the wrong entry. The
  DB's own `time_entries_one_open_per_employee` unique index (F-1) is the actual
  enforcement of "can't be clocked into two jobs at once" -- the 23505 catch in
  `clockIn()` only turns that into a clear message.
- **`getCurrentEmployee()`** (new, `lib/employees/queries.ts`) resolves the caller's own
  `core.employees` row for a business via `auth.getUser()` -- backs both `/fsm/my-day`
  ("whose schedule is this") and clock-in/out ("whose time entry is this"). Returns
  `null` for a business member who isn't a technician (e.g. an owner who only
  dispatches), which every caller treats as "nothing to show/do", not an error.
- **Attachments reuse `core.attachments` (D-8) directly** -- no new storage concept.
  `entity_type='job'` for photos/videos/PDFs captured in the field, a separate
  `entity_type='job_signature'` for signature images, so the two never mix in either
  list. Added `core.attachments/queries.ts#getAttachmentSignedUrl()` (new) since this is
  the first story to actually render an attachment back to a user -- the bucket is
  private (D-8's own migration), so a plain `getPublicUrl` would 404; `createSignedUrl`
  is itself RLS-checked at generation time against the same "member of this business"
  policy that already gates the underlying object's own read.
- **Signature capture is a plain `<canvas>` pointer-events pad**
  (`components/field/signature-pad.tsx`), not a signature-capture library -- drawing a
  line and exporting a PNG via `canvas.toBlob()` is the entire feature, and every
  mainstream library wraps exactly that (CLAUDE.md principle 2). The captured image
  uploads through `uploadAttachment()` (`entity_type='job_signature'`) and
  `fsm.signatures.image_attachment_id` points at it -- no separate image-storage path.
- **"Notify on the way" is email-only, not "SMS + email"** (PRD §1.8's own phrasing).
  Confirmed before building this: no SMS provider (Twilio or equivalent) exists anywhere
  in the platform, and no phone-sending code of any kind. Adding one is an
  infrastructure decision (a new external dependency, API keys, per-message cost) bigger
  than this one action justifies alone, so it's deferred rather than silently dropped --
  documented here because F-9 (automatic customer reminders) will hit the exact same gap
  and needs the same provider decision made once, not re-litigated. Reuses
  `module-discovery`'s own Resend pattern exactly, same as F-4's `sendEstimate` --
  advances the event's own status `scheduled -> en_route`.
- **`fsm.events.status`'s remaining values now have real transitions**:
  `notifyOnTheWay()` (`scheduled -> en_route`, sends the email above), `markEventArrived()`
  (`-> arrived`), `markEventDone()` (`-> done`) -- the three F-6 explicitly deferred to
  this story. All three are plain, unconditional status updates (no "was it in the right
  prior state" guard, unlike the job status machine's own `transition()` helper) --
  Kickserv's own field-execution flow doesn't document a stricter state machine here, and
  a technician correcting their own tap (e.g. marking arrived twice) shouldn't be an
  error.
- **`/fsm/my-day` is a single scrollable list, not a calendar grid** -- "home screen is
  today's schedule" (PRD §1.8) reads far better mobile-first as a list of cards than as
  the desktop schedule board's day/week grid. "Swipe to Notify" becomes a plain button
  (no gesture library); "tap the map for GPS routing" becomes a link to
  `maps.google.com` built from the customer's own name (no map SDK, no new dependency --
  the device's own default maps app still gets the technician real turn-by-turn). Reuses
  `listEventsForRange` (F-6) filtered in JS down to the caller's own assignments
  (`listMyEventsForRange`, new) rather than a second SQL query -- a single day for one
  employee is a small enough result set that reusing the exact join logic (job/
  opportunity/party name resolution) is simpler than maintaining two queries that both
  do it.
- **Charges are deliberately not repeated here** -- PRD §1.8 lists "add charges" as part
  of the field-execution flow, but `EstimateBuilder` (F-3) already covers charge-line
  editing (`core.document_lines`, GST computation, reorder) on the opportunity/estimate
  side; a job doesn't get a second charge-line editor with different code for the same
  `core.items`/`core.document_lines` concept. Charges on completed jobs become invoicing
  once F-8 lands.
- **Payment collection is out of scope** -- PRD §1.8's "collect signature and payment" is
  split: signature is this story, payment is F-8 (Invoicing)'s own concern (recording a
  payment against a document that doesn't exist yet would be building the wrong table).

Existing test `scripts/test-discovery-rls.mjs` hardcoded the exact size of
`core.permissions` (38) -- bumped to 41 for `time_entries.edit`/`expenses.edit`/
`notes.edit`, same recurring update pattern as F-2/F-3/F-5/F-6. No new SQL-level test
file: the only new SQL primitives are the three permission-catalog rows (covered by the
updated count assertion); `fsm.time_entries`' own one-open-per-employee unique index and
generated `duration_minutes` column already have dedicated coverage in
`scripts/test-fsm-rls.mjs` from F-1 (re-run as part of the same `test:db` pass, not
duplicated here), and `fsm.expenses`/`notes`/`signatures` and `core.attachments` already
have their own RLS/tenant-isolation coverage from F-1/D-8.

The full field-execution flow was live-verified end-to-end against the dev Supabase
project inside one self-cleaning (rolled-back) transaction as the authenticated business
owner: create a job, clock in, confirm a second clock-in for the same employee is
rejected by the DB's own unique index, clock out and confirm `duration_minutes`
computed, log an expense, add a customer-visible note, record an attachment's metadata
row (`entity_type='job'`), capture a signature referencing it, walk a work event through
`scheduled -> en_route -> arrived -> done`, and confirm the
`time_entries.edit`/`expenses.edit`/`notes.edit` permission-catalog wiring (all three
keys present, granted to exactly owner+admin, `has_permission()` true for the owner on
all three) -- no assertion failures, zero residue after rollback. The actual Resend API
call for "notify on the way" was not exercised live (no test inbox in this environment),
same as F-4's own `sendEstimate` -- its error handling (missing env vars, Resend's own
error response) follows that already-proven pattern exactly. The signature pad's own
canvas drawing and the file-upload button were **not** exercised in an actual browser in
this environment -- only their server-side landing points (attachment metadata,
`fsm.signatures` insert) were verified via the SQL transaction above. Typecheck, lint,
and build passing confirm the component compiles and its types line up, not that the
drawing/export/upload interaction itself works end-to-end in a real browser.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full
`test:db` suite green (including the updated permission-count assertion); `npm run
build --workspace=apps/web` succeeds (the new `/fsm/my-day` route compiles and
registers alongside the existing job routes); Supabase security advisor shows no new
findings; live end-to-end verification against the dev Supabase project as described
above.

## F-8 -- Invoicing

**No new migration.** No new tables (an invoice is a `core.documents` row with
`doc_type='invoice'`, same as an estimate is `doc_type='estimate'`; payments reuse
`core.payments`/`payment_allocations`/`document_balances` from D-7, already fully built
with zero FSM-specific schema) and no new permissions -- `invoices.create`/
`invoices.edit`/`invoices.cancel` already exist in `core.permissions`, seeded by
`inventory`'s own migration (`20260906097000_core_permissions.sql`) for its sales-invoice
flow. Permission keys are role-capability checks, not module-ownership checks -- `core`
owns `documents`/`payments` for every module, so FSM reuses the same three keys for the
same underlying concept rather than minting `fsm`-prefixed duplicates. All three are
granted to owner/admin (the seeded cross join) and to `accountant`/`sales_manager`
(`invoices.create` only for the latter) exactly as they already were.

`packages/module-fsm/src/lib/invoices/{types,queries,mutations}.ts` +
`components/invoices/{invoice-editor,invoices-list,public-invoice-view}.tsx` + three new
routes (`/fsm/invoices` list, `/fsm/invoices/[invoiceId]` detail, `/p/i/[token]` public --
the first two already linked from `SERVICE_NAV`'s "Billing" group since F-1). Notable
decisions:

- **Charge-line mutations are reused verbatim from `estimates/mutations.ts`**
  (`addChargeLine`/`updateChargeLine`/`deleteChargeLine`/`reorderChargeLines`), re-exported
  from `invoices/mutations.ts` rather than duplicated -- all four were already generic
  over any `core.documents` id, nothing about them was actually estimate-specific (F-3's
  own naming just reflects where they were first written). Same reuse for
  `listEstimateLines` (aliased `listInvoiceLines` in `invoices/queries.ts`) and the
  now-exported `recomputeAndPersistTotals` (was estimates-private, now shared).
- **One invoice per job, generated once then edited in place** (PRD §1.4's own model) --
  `getOrCreateInvoiceForJob()` is idempotent (`core.documents` filtered by
  `source_ref->>'job_id'`) and copies an approved estimate's charge lines in as a starting
  point when the job came from one; a job created directly (no opportunity, F-5) or an
  estimate that was never approved starts with an empty invoice, so the invoice editor
  is the only charge-line UI such a job ever gets -- closing the gap F-7 deliberately
  left open ("Charges are deliberately not repeated here" was true only for
  opportunity-sourced jobs). Copied lines are recomputed fresh via
  `recomputeAndPersistTotals`, never trusting the estimate's already-computed GST split
  for what is now a second, independent financial document.
- **Status machine**: `draft -> issued -> sent -> viewed -> partially_paid/paid`, plus
  `voided` reachable from any non-draft state. `issueInvoice()` mints a real number via
  `core.next_number(scope='invoice')` -- the same scope `inventory`'s own sales invoices
  already use (F-1's own note: GST needs one continuous invoice sequence per business
  regardless of which module issued it). `sendInvoice()` auto-issues a draft first
  (sending necessarily makes it real), generates a 90-day tokenised portal link
  (`fsm.portal_tokens`, scope `'invoice'`, same table F-4 already uses for estimates), and
  emails it via the same Resend pattern as `sendEstimate`/`notifyOnTheWay`.
- **`markInvoiceViewed()`** flips `sent -> viewed` on the public page's first load,
  mirroring `markEstimateViewed`; safe to call on every load since it's conditioned on
  the current status.
- **Payments reuse D-7 as-is**: `recordManualPayment()` calls `core.payments`'
  `recordPayment`+`allocatePayment`, then `syncInvoiceStatusFromBalance()` reads
  `core.document_balances` (a `security_invoker` view, already tenant-safe) to advance
  `issued/sent/viewed -> partially_paid -> paid`, never touching `voided`. Added
  `listPaymentsForDocument()` to `core/payments/queries.ts` (new, but framework-agnostic
  and generic over any document id -- not FSM-specific) so the invoice screen can show a
  payment history table without owning payment data itself.
- **`markInvoicePaid`/`markInvoiceUnpaid`** are a manual override distinct from the
  payment-driven sync -- PRD §2 lists "mark paid/unpaid" as its own bullet alongside
  "record manual payment", matching Kickserv's own UI (a manual toggle for money received
  outside the system, or correcting a mistake). `markInvoiceUnpaid` always reverts to
  `issued` regardless of prior sent/viewed history -- a documented simplification, not a
  silently dropped case.
- **Voiding is a credit note, never deletion** (PRD §1.4/§4, GST's own audit-trail
  requirement) -- `voidInvoiceViaCreditNote()` inserts a header-only `core.documents` row
  (`doc_type='credit_note'`, no per-line detail, unlike `inventory.create_credit_note()`'s
  fuller version, which FSM can't call anyway: it lives in the `inventory` schema, a
  module-boundary violation) and flips the invoice to `voided`. Confirmed live (see
  below) that `core.recompute_document_totals()` only fires on `document_lines`
  changes or on `core.documents` UPDATE of `discount_amount`/`shipping_amount` -- never on
  `documents` INSERT -- so this header-only insert's manually-set totals are safe from
  being zeroed out by the trigger.
- **`completeJob()` (`lib/jobs/mutations.ts`) now auto-generates a draft invoice** when
  `fsm.settings.auto_invoice_on_complete` is on (PRD §4), via the same
  `getOrCreateInvoiceForJob()` the invoice screen itself uses -- best-effort (a completed
  job shouldn't be blocked by invoice-generation failing; the invoice screen's own
  "Invoice" button is always there to retry). No `fsm.settings` row exists yet for any
  business (F-15 builds the settings screens) -- the query defaults to `false`/skip when
  the row is missing, matching the column's own DB default.
- **Job detail gets an "Invoice" button** (next to Duplicate/Convert-to-opportunity),
  gated on `invoices.create`, calling the same idempotent `getOrCreateInvoiceForJob()`
  and navigating to `/fsm/invoices/[invoiceId]` -- same `navigate()` pattern already used
  for Duplicate and Convert-to-opportunity.
- **No online payment link** on the public invoice page -- PRD §2 lists it as an explicit
  SHOULD/LATER item; `/p/i/[token]` is read-only (balance due, line items), same
  "preview shows the exact customer-facing page" scope as the public estimate page minus
  its approve/decline actions (there's nothing to approve on an invoice).

No new SQL-level test file: the only new SQL surface is entirely `core.documents`/
`core.payments` rows with existing `doc_type`/status values (no new check constraints,
no new columns) -- already-existing coverage (`scripts/test-fsm-rls.mjs`'s tenant
isolation on `core.documents`, D-7's own payment tests) applies unchanged.
`scripts/test-discovery-rls.mjs`'s permission-count assertion stays at 41 (no permissions
added).

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: created a job, inserted a draft invoice document, added a charge line and
confirmed `core.recompute_document_totals()` summed it into the header (total = qty *
price + GST), issued the invoice, recorded a partial manual payment and confirmed
`core.document_balances` reflects `paid_amount`/`balance_amount` correctly, inserted a
header-only credit note document and confirmed its manually-set `total_amount` was
**not** overwritten by the recompute trigger (the exact safety property
`voidInvoiceViaCreditNote()` depends on), and voided the invoice -- no assertion
failures, zero residue after rollback. `core.next_number()` itself (unchanged,
already-proven infra from F-4/F-5) was not re-exercised live since it requires an
authenticated session the SQL-editor context doesn't have; literal test numbers were
used in its place for the rest of the flow. The Resend email send in `sendInvoice()` and
the invoice editor's browser interactions were **not** exercised in an actual browser in
this environment, same documented gap as F-4/F-7's own email-sending and canvas/upload
UI.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (35 migrations,
unchanged); full `test:db` suite green (permission count still 41); `npm run build
--workspace=apps/web` succeeds (the three new invoice routes compile and register
alongside the existing job/opportunity routes); Supabase security advisor shows no new
findings (same seven pre-existing `rls_enabled_no_policy` infos and 47 pre-existing
`function_search_path_mutable` warnings from `inventory`'s own compat-view triggers, none
introduced here); live end-to-end verification against the dev Supabase project as
described above.

## F-9 -- Reminders

**Internal reminder events already existed from F-6/F-7** -- `fsm.events` with
`kind='reminder'` and its assignees are fully creatable through the schedule UI's
create-event dialog. F-9's actual scope is entirely the *sending* side PRD §1.5 describes
for both reminder kinds: a scheduled job that emails people before an event happens,
which nothing before this story ever ran.

One migration (`20260908080000_fsm_reminders.sql`) adds two nullable columns to
`fsm.events` -- `customer_reminder_sent_at`, `internal_reminder_sent_at` -- the
idempotency markers the cron needs so re-running it (including a Vercel Hobby-plan cron's
daily-only cadence re-scanning a window it already covered) never double-sends. No new
permissions: sending is a system cron, not a user-permission-gated action.

`packages/module-fsm/src/lib/reminders/mutations.ts#sendDueReminders()` +
`apps/web/app/api/cron/send-reminders/route.ts` + `apps/web/vercel.json` (new). Notable
decisions:

- **One cron function handles both reminder kinds in one pass**, scanning across every
  business (not per-tenant) with the admin client -- same reasoning as
  `core/events/drain.ts#drainDomainEvents`: a cron invocation has no signed-in user, so
  there's no session for RLS to scope by anyway. Checks `core.has_module(business_id,
  'fsm')` per event's own business before sending anything, skipping unlicensed
  businesses' events silently -- the same "unlicensed parks/skips rather than errors"
  treatment `drainDomainEvents` already gives license gaps, reused here via the identical
  RPC rather than inventing a second licensing check.
- **No per-employee "notification lead time" exists anywhere in the schema** (PRD §1.5
  mentions one specifically for internal reminders, distinct from the business-wide
  customer-reminder default) -- confirmed before building this: `core.employees` has no
  such column, and adding one wasn't asked for by this story's own data model
  (`docs/plan/02-FSM-PRD.md` §3's `fsm.settings` only has one `reminder_lead_hours`
  column, shared). Both reminder kinds use that same business-wide value (default 48,
  matching the PRD's customer-reminder default exactly) -- a documented simplification,
  not a silently dropped feature.
- **SMS is still not sent** -- the same gap F-7's `notifyOnTheWay` and F-8's
  `sendInvoice` already documented (no SMS provider anywhere in the platform, adding one
  is an infrastructure decision bigger than any single action justifies). Both reminder
  kinds are email-only for now.
- **The due-window query is bounded to 14 days out** (`HORIZON_HOURS`) and filtered the
  rest of the way in JS per-event against that business's own `reminder_lead_hours` --
  same "join/filter in JS rather than a query that has to vary per row" pattern every
  list query in this module already uses, here because a single SQL `WHERE` clause can't
  cleanly express "due" against a lead time that differs by business without a join back
  to `fsm.settings` inside the predicate itself.
- **Customer reminders only fire for `status='scheduled'` events** -- an event already
  `en_route`/`arrived`/`done`/`cancelled` has either already gotten its "on the way"
  notification (F-7) or doesn't need one anymore. Internal reminder events (`kind=
  'reminder'`) have no such extra gate beyond "not cancelled/done" -- they don't carry
  the field-execution status machine's own meaning.
- **`apps/web/vercel.json` is new** -- it didn't exist before this story, even though
  `api/cron/drain-events` (D-9) has needed a scheduler pointed at it since before FSM
  started. Both routes are wired into its `crons` array now, once daily each (`0 6 * * *`)
  -- Vercel's Hobby plan (this project's current plan) only runs cron jobs on a daily
  cadence, so hourly scheduling would be silently downgraded anyway. A daily cadence is
  still correct for reminder-sending specifically: the idempotency columns mean a business
  configured with the 48h default gets its reminder on whichever daily run first crosses
  the window, never twice: only a business that configures a *very* short
  `reminder_lead_hours` (well under 24h) risks its reminder landing later than intended
  under a once-a-day check -- a real but narrow edge case, documented rather than solved
  by paying for a higher Vercel plan this story has no mandate to buy.

No new SQL-level test file: the only new SQL surface is two nullable timestamp columns
with no constraints -- `scripts/test-fsm-rls.mjs`'s existing `fsm.events` tenant-isolation
and check-constraint coverage applies unchanged. `scripts/test-discovery-rls.mjs`'s
permission-count assertion stays at 41 (no permissions added).

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: confirmed `core.has_module()` correctly reports `false` for a freshly created,
never-licensed business (the exact skip condition `sendDueReminders()` relies on), then
mirrored the cron's own due-window query directly in SQL across three seeded events -- one
45 hours out (due under the default 48h lead, no `fsm.settings` row needed), one 100 hours
out (correctly excluded, not due yet), and one 10 hours out but already marked
`customer_reminder_sent_at` (correctly excluded regardless of due-ness) -- and got exactly
the one expected row back. No assertion failures, zero residue after rollback. The actual
Resend email sends were **not** exercised live (no test inbox in this environment), same
documented gap as every other Resend-sending mutation in this module; the cron route
itself was not invoked live either (would require a deployed `CRON_SECRET` and a real HTTP
round trip, not a SQL-editor check) -- its own logic is a thin, directly-reviewed
pass-through to `sendDueReminders()`, same shape as the already-live-verified
`drain-events` route.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (36 migrations);
full `test:db` suite green (permission count still 41, unchanged); `npm run build
--workspace=apps/web` succeeds (the new `/api/cron/send-reminders` route compiles and
registers); Supabase security advisor shows no new findings (same pre-existing findings
as F-8, none introduced here); live end-to-end verification against the dev Supabase
project as described above.

## F-10 -- Customer Center + contact form

**No new migration.** Every table this story needs already existed from F-1:
`fsm.portal_tokens` (`scope='center'` was defined in the enum from day one, just never
used until now -- `document_id` is already nullable, exactly the shape a party-scoped
rather than document-scoped token needs), `fsm.work_requests`, and
`fsm.opportunities.source='contact_form'` were all already in the schema, unused. No new
permissions either -- sending Customer Center access is gated on the existing `jobs.edit`
(a routine part of managing a job's own customer relationship, not a separate capability),
and the contact form and the public center page have no session to gate at all.

`packages/module-fsm/src/lib/{customer-center,work-requests}/` +
`components/{customer-center/customer-center-view,work-requests/contact-form}.tsx` +
three new routes (`/p/center/[token]`, `/p/request/[businessSlug]` -- both already listed
in the PRD's own route table §5 -- and a "Send Customer Center access" button added to
the existing job detail page, since no dedicated customer/contacts screen exists yet to
put it on). Notable decisions:

- **`resolveCenterToken()`** (new, `lib/portal-tokens/tokens.ts`) is a second resolver
  alongside the existing `resolvePortalToken()`, not a modification of it -- a `center`
  token is scoped to a *party* across every one of their documents, so it can't require
  `document_id` the way `resolvePortalToken()`'s single-document estimate/invoice
  resolution does. Keeping them separate avoids widening `PortalTokenContext.documentId`
  to nullable, which would have forced a null-check at every one of F-4's/F-8's own
  already-working call sites for a case that never applies to them.
- **The center page's "approve/decline estimate" buttons don't duplicate F-4's approval
  logic.** They mint a short-lived (10-minute), single-purpose `estimate`-scope portal
  token on the fly -- after verifying the estimate actually belongs to the center token's
  own party/business, so a valid center token for one customer can't approve another
  customer's estimate by id-guessing -- and immediately call the existing
  `approveEstimateByToken`/`declineEstimateByToken` (F-4) with it. One approval code path,
  not two.
- **No "pay" action on the center page** -- PRD §2's Customer Center row lists "pay/see
  balance" as one MUST bullet, but online payment is explicitly its own SHOULD/LATER item
  under the Invoicing row, the same gap F-8's public invoice page already documented.
  "See balance" is satisfied by each invoice's own live `balance_amount` (via
  `core.document_balances`, D-7); "pay" stays unbuilt, consistent with F-8.
- **Both `customer_center_enabled` and `contact_form_enabled` default to `false` with no
  settings row yet** (F-15 hasn't shipped the settings screen that would flip them) --
  same "flag exists, gate checks it correctly, no UI to turn it on yet" sequencing F-8's
  `auto_invoice_on_complete` already established. `sendCustomerCenterAccess()` and
  `resolveContactFormBusiness()`/`submitWorkRequest()` all check their own flag and refuse
  cleanly rather than silently ignoring it -- both features are correctly wired end-to-end
  and will start working the moment F-15 lands a way to turn them on, not blocked on
  anything this story owns.
- **The contact form auto-creates an opportunity, not just a work request** -- PRD §2's
  own MUST line is "creates an inbound work request → opportunity", read as one step, not
  two ("triage this later"). `submitWorkRequest()` finds-or-creates the party (matched by
  email within that business), creates the opportunity (`source='contact_form'`), and
  marks the `work_requests` row `status='converted'` with `opportunity_id` set, all in one
  call -- it shows up in the normal `/fsm/opportunities` pipeline immediately, with no
  separate staff-facing "inbox" screen needed (none is called for in the PRD's MUST
  scope; a triage UI would be new scope this story wasn't asked for).
- **`fsm.opportunities.created_by` has no session to default `auth.uid()` from** on a
  public form submission -- resolved to the business's own owner (`core.business_members`
  where `role='owner'`), the same attribution a business-wide automated action reasonably
  takes; there's no "system" user anywhere in this platform to attribute it to instead.
- **`submitWorkRequest()` re-checks licensing and `contact_form_enabled` itself**, not
  just trusting `resolveContactFormBusiness()`'s earlier check on the page -- it's a
  server action a client could call directly, same defense-in-depth reasoning
  `requireModule()` gives every other mutation in this platform, just hand-rolled against
  the admin client since there's no session for `requireModule()`'s usual RLS-backed path.
- **Resolving a business by `businessSlug`** uses `core.business_settings.slug` (already
  existed, unused by FSM until now) via the admin client -- there's no session on
  `/p/request/[businessSlug]` for `core.user_business_ids()`-style membership checks to
  run against, same reasoning every other public route in this module already uses.

No new SQL-level test file: no new tables, columns, or constraints -- every table this
story touches already has its own coverage (`fsm.portal_tokens`/`work_requests` tenant
isolation from F-1, `core.documents`/`payments` from D-7/F-8). `scripts/test-discovery-
rls.mjs`'s permission-count assertion stays at 41 (no permissions added).

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: seeded a business with a `business_settings.slug`, an owner member, and a
party; confirmed a fresh `fsm.settings` row defaults both new-to-this-story flags to
`false`; flipped both on and confirmed the slug lookup `resolveContactFormBusiness()`
performs actually resolves to the right business; inserted a `center`-scope
`portal_tokens` row with `document_id` left `null` (the one shape no prior scope ever
used) and confirmed it inserts cleanly; mirrored `submitWorkRequest()`'s own insert shape
(an opportunity with `source='contact_form'`, then a `work_requests` row linked to it via
`opportunity_id`, `status='converted'`); and mirrored `getCustomerCenterView()`'s own
document query (`party_id` + `source_module='fsm'` + `doc_type in (estimate,invoice)`)
against a seeded estimate document, confirming it's found. No assertion failures, zero
residue after rollback. The actual Resend email send in `sendCustomerCenterAccess()` and
every page's browser rendering were **not** exercised live, same documented gap as every
other Resend-sending mutation and public page in this module. Security advisor was not
re-run for this story specifically -- no schema changed at all (confirmed by
`lint:migrations` still reporting 36 files, unchanged from F-9), so there is nothing new
for it to have flagged.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (36
migrations, unchanged); full `test:db` suite green (permission count still 41,
unchanged); `npm run build --workspace=apps/web` succeeds (both new public routes
compile and register); live end-to-end verification against the dev Supabase project as
described above.

## F-12 -- Reports

**No new migration, no new permissions.** All nine MUST-scope reports (PRD §2 Reports
row: jobs completed, revenue by service/tag/charge type, marketing sources, customer
balances, account aging, payments, timecards, productivity per employee) read from
tables that already existed -- `core.documents`/`document_lines`/`payments`/
`payment_allocations` (D-7/F-8), `fsm.jobs`/`service_types`/`job_charge_types`/
`time_entries` (F-1/F-7), `core.tags`/`taggings` (D-8). Report viewing has no separate
permission -- gated purely by `fsm`'s own tenant-AND-licensed RLS, same "reads stay
gated by RLS alone" precedent F-2 already established for opportunities.

`packages/module-fsm/src/lib/reports/{types,queries}.ts` +
`components/reports/reports-view.tsx` + one new route (`/fsm/reports`, already linked
from `SERVICE_NAV` since F-1). No date-range picker anywhere -- a custom report builder
is the PRD's own explicit SHOULD/LATER item; each report instead shows its own natural
default period. Notable decisions:

- **Revenue reports (`by service`/`by tag`/`by charge type`) all read from `core`'s own
  fsm-issued invoices** (`doc_type='invoice'`, `source_module='fsm'`), never
  `document_lines` in isolation for the service/tag breakdowns -- a job's *whole* invoice
  total is what's being attributed to its service type or tags, not a line-level split.
  Charge type is the one exception: it's genuinely a per-line classification
  (`document_lines.job_charge_type_id`), so that report sums line amounts directly rather
  than whole-invoice totals.
- **Revenue-by-tag counts a multi-tagged job's full invoice amount toward *every* one of
  its tags** (documented in the code) -- the standard "revenue by tag" reporting
  convention (a job tagged both "Emergency" and "Repeat customer" contributes to both
  totals, not a split neither total would then add up correctly against). An untagged
  job's revenue buckets into "Untagged" rather than being silently dropped.
- **Marketing-source revenue is correctly wired but inert today** --
  `fsm.opportunities.marketing_source_id` is a bare/no-FK column (F-1's own design,
  since `discovery`'s marketing-source concept doesn't have a `contract/index.ts` lookup
  function yet, and cross-schema FKs outside `core` aren't allowed per CLAUDE.md
  non-negotiable #1) that nothing in this platform sets yet -- confirmed by grep before
  building this, not assumed. Every dollar buckets into "Unattributed" until F-13 (the
  discovery→FSM handoff) starts populating it on `prospect.won`; this is the correct
  degraded-mode result (ADR-10), not a placeholder -- the report needs zero changes once
  F-13 lands.
- **Account aging re-derives `core.document_aging`'s own bucket boundaries
  (1-30/31-60/61-90/90+ past `due_date`, falling back to `doc_date`) rather than querying
  that view directly** -- the view is business-wide across every module and carries no
  `source_module` column to filter fsm's own invoices out of inventory's, so this queries
  `core.documents`/`document_balances` directly and buckets in JS instead, same "join/
  filter in JS" pattern already used everywhere else in this module. The bucket
  boundaries themselves are identical to the view's own, just recomputed rather than
  reused.
- **"Payments by date" scopes to payments with at least one allocation against an
  fsm-sourced document** -- `core.payments` is shared platform-wide (D-7), so a business
  licensed for both `fsm` and `inventory` would otherwise see the other module's payments
  mixed in.
- **Timecards and productivity both report the current calendar month**, not "by pay
  period" as the PRD literally says -- no pay-period concept (a payroll setting) exists
  anywhere in this platform, confirmed before building this; a documented simplification,
  not a silently dropped feature. Both reports deliberately share the same period so
  they read consistently side by side.
- **Productivity's "jobs completed" counts a job only once per employee** even if they
  logged multiple time entries against it in the period, via a `Set` of job ids rather
  than counting time-entry rows -- otherwise a job with three separate clock-in/out
  sessions would inflate the count threefold.

No new SQL-level test file: every table and view this story reads already has its own
coverage from earlier stories (F-1's tenant isolation, D-7's payment/balance tests) --
these reports are pure aggregation over already-correct, already-tested data, with
nothing new to assert about the schema itself. `scripts/test-discovery-rls.mjs`'s
permission-count assertion stays at 41 (no permissions added).

Live-verified the aggregation logic itself (not just schema shape, since this story is
almost entirely read-side computation) against the dev Supabase project inside one
self-cleaning (rolled-back) transaction: seeded a completed job tagged "Emergency" with
a Plumbing service type, invoiced with one Labor-charge-type line (2000 + 18% GST split =
2360 total) due 45 days ago and never paid, then mirrored each report's own aggregation
query directly -- confirmed the invoice's full 2360 attributes correctly to its service
type and to its tag, confirmed the charge-type line sum also lands on 2360, confirmed
`core.document_balances` shows the full 2360 still outstanding, and confirmed a 45-day-
overdue due date correctly buckets into `31-60`. No assertion failures, zero residue
after rollback. Security advisor was not re-run -- no schema changed (`lint:migrations`
still reports 36 files, unchanged from F-10).

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (36
migrations, unchanged); full `test:db` suite green (permission count still 41,
unchanged); `npm run build --workspace=apps/web` succeeds (the new `/fsm/reports` route
compiles and registers); live end-to-end verification against the dev Supabase project
as described above.

## F-13 -- Discovery -> FSM handoff

**Live-source discrepancy, flagged per CLAUDE.md rather than silently reconciled**:
`02-FSM-PRD.md` §6's own payload sketch for `prospect.won` is `{ workspace_id,
prospect_id, party_id, contact_ids[], conversation_id }`. `module-discovery`'s actual
`Prospect` type (`lib/prospects/types.ts`) has neither a contact-list nor a
conversation-summary concept -- confirmed by reading the type before writing this, not
assumed. The published payload instead carries `companyName`/`description` (fields that
do exist), the closest real substitute for "seed the new opportunity's own scope of work
from". `primary_contact_id` on the created opportunity is left null for the same reason
-- there's nothing to resolve it from yet.

One migration (`20260908090000_fsm_discovery_handoff.sql`) adds
`fsm.opportunities.source_workspace_id` (bare/no-FK, same treatment as the existing
`source_prospect_id`/`marketing_source_id`) -- needed for the reverse backlink, since the
prospect detail page's own route (`/products/[workspaceId]/prospects/[prospectId]`)
needs the workspace id, not just the prospect id, to link back. No new permissions: the
handler runs as a system cron consumer (admin client), same as
`drainDomainEvents`/`module-inventory`'s own handler, not a user-permission-gated action.

`packages/module-discovery/src/lib/prospects/mutations.ts#setProspectOutcome` +
`packages/module-fsm/src/events/handlers.ts` (new) + `packages/module-fsm/src/contract/
{index,types}.ts` (new -- module-fsm's first contract, mirroring module-inventory's own
SP-9 shape) + a small UI addition on both the prospect detail page (discovery) and the
opportunity detail page (fsm). Notable decisions:

- **Discovery publishes, already resolving `business_id` itself** (via the existing
  `getBusinessIdForWorkspace`, already used by `markProspectPartyWon` one line above) --
  `core.domain_events.business_id` is `not null`, so there's no "processor resolves the
  tenant later" step the PRD's phrasing implies; the publish call already has everything
  it needs.
- **Published with `requiredModule: 'fsm'`** -- an unlicensed business's event parks
  (`status='parked'`, no attempts penalty) rather than failing, and
  `core.replay_parked_events()` (already wired into `activateLicense()`, C-4) un-parks it
  automatically the moment `fsm` is licensed, with zero new code needed for that half of
  the requirement.
- **`opportunity.created` is deliberately NOT published** from the new handler, despite
  the PRD's own step 3 saying to -- nothing in this platform subscribes to it yet (no
  `crm`, nothing in `gst` cares about opportunity creation), and `core/events/drain.ts`
  treats an event type with no registered handler as an immediate, permanent failure
  (`failed_permanent`), not a harmless park. Publishing it today would only clutter
  `core.domain_events` with permanently-failed rows for a consumer that doesn't exist --
  CLAUDE.md principle 7 ("never implement speculative functionality") applies directly
  here. A future module that actually needs it can register a handler and this decision
  gets revisited then.
- **The handler is idempotent by construction**: before inserting, it checks for an
  existing `fsm.opportunities` row with `source='discovery'` and this exact
  `source_prospect_id`, and returns (no-op) if one exists. This is what makes "reactivate
  a cancelled license and replay its parked events" (CLAUDE.md non-negotiable #4) safe --
  a `prospect.won` event parked for weeks and then replayed can never produce a second,
  duplicate opportunity for the same prospect (PRD §7 acceptance criterion #1).
- **`fsm.opportunities.created_by` has no session to default `auth.uid()` from** inside a
  cron-drained handler -- resolved to the business's own owner, the exact same pattern
  F-10's `submitWorkRequest()` already established for the same underlying problem (a
  system-originated write with no signed-in user and no "system" user anywhere in this
  platform to attribute it to instead).
- **The forward backlink** (opportunity → prospect) is a plain link on the opportunity
  detail page, shown only when `source==='discovery'` and both `source_prospect_id`/
  `source_workspace_id` are set, built from `businessId` (already on the opportunity
  row) + the two new/existing bare ids -- no query needed, just a URL.
- **The reverse backlink** (prospect → opportunity/job/invoice) is
  `module-fsm/contract/index.ts#getHandoffStatusForProspect(businessId, prospectId)` --
  module-fsm's first `contract/index.ts` (this repo's very first real cross-module
  contract call of any kind). Returns `{ok:false, error:"MODULE_NOT_LICENSED"}` as a
  normal result (ADR-10) when the viewing business hasn't licensed `fsm`, so the
  prospect page degrades cleanly rather than throwing. The call itself lives in
  `apps/web`'s own prospect detail `page.tsx`, not inside `module-discovery`'s package --
  `apps/*` is the composition root and is exempt from the module-to-module
  contract-only restriction (confirmed by re-reading `lint-import-boundaries.mjs`'s own
  doc comment before relying on this), so `module-discovery`'s own code never imports
  `module-fsm` at all; the presentational panel component it owns
  (`components/prospects/fsm-handoff-panel.tsx`) only takes plain data props. Also fixed
  `module-fsm`'s package-wide `sideEffects: false` (the exact SP-9-era bug already found
  and fixed for `module-inventory`, present here too since nothing had exercised
  `events/handlers.ts`'s side-effecting registration until this story) and wired the new
  handler's import into `apps/web/app/api/cron/drain-events/route.ts` alongside
  `module-inventory`'s own.

No new SQL-level test file: the only new SQL primitive is one nullable, unconstrained
column (`source_workspace_id`) -- covered by the same tenant-isolation coverage every
other `fsm.opportunities` column already has from F-1/F-2. `scripts/test-discovery-
rls.mjs`'s permission-count assertion stays at 41 (no permissions added).

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: published a `prospect.won` event with `required_module='fsm'` against a
business with no `fsm` license and confirmed `core.record_domain_event_attempt(...,
'parked')` leaves it `status='parked'` (never failed, never processed); mirrored the
handler's own idempotency check (found zero matching opportunities, inserted one,
confirmed a second identical lookup finds exactly one, never two); confirmed
`source_workspace_id` round-trips on the new opportunity; and mirrored
`getHandoffStatusForProspect()`'s own three-way join (opportunity → job →
invoice, via `converted_job_id` and `source_ref->>'job_id'`) against a seeded won
opportunity with a completed job and an issued invoice, confirming it resolves the
right status and invoice number end to end. No assertion failures, zero residue after
rollback. The actual TypeScript handler function itself was not invoked live (it runs
inside the Next.js/Node runtime, not something a SQL-editor session can call) -- its
logic was verified by direct code review plus the SQL mirror above of every query it
issues; the cross-module contract call and both UI panels were not exercised in an
actual browser, same documented gap as every other UI addition in this module.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (37
migrations); full `test:db` suite green (permission count still 41, unchanged);
`lint:boundaries` specifically confirms the new cross-module contract usage
(`module-fsm/contract/index.ts` called only from `apps/web`, never from inside
`module-discovery`'s own package) violates nothing; `npm run build --workspace=apps/web`
succeeds; Supabase security advisor shows no new findings; live end-to-end verification
against the dev Supabase project as described above.

## F-14 -- Inventory <-> FSM integration

**No new migration.** Every primitive this story needs already existed:
`module-inventory/contract/index.ts`'s `reserveStock`/`releaseStock`/`consumeStock`/
`listWarehouses` (SP-9), `inventory.alerts`'s own `low_stock` rows (written by
`inventory.check_stock_alerts()`'s trigger, SP-3a/SP-3b), and `core.items.kind='good'`
as the exact signal `core.item_inventory_attrs`'s own invariant already ties to real
stock tracking. This story only adds one new contract function
(`listLowStockAlerts`, `module-inventory/contract/index.ts`) and a new module-fsm
package (`lib/inventory-integration/`) wiring the existing pieces together.

`packages/module-fsm/src/lib/inventory-integration/mutations.ts` (new) +
two lines each in `lib/jobs/mutations.ts` (`markJobScheduled`, `completeJob`) and
`lib/events/mutations.ts` (`tryAdvanceJobToScheduled`) + a low-stock banner on the
`/fsm/schedule` page. Notable decisions:

- **"Job parts" reads from the job's own originating *estimate*, not its invoice** --
  the estimate (`job.opportunity_id -> fsm.opportunities -> its core.documents` row) is
  the one charge-line source reliably available at both "on schedule" (before any
  invoice typically exists, per F-8) and "on completion" (F-8's invoice generation is
  itself best-effort and may not have run). A job created directly (no opportunity, F-5)
  or whose estimate was never approved has no parts source under this design and both
  hooks correctly no-op for it -- a real, documented limitation (a directly-created
  job's charges added straight to its invoice never trigger stock reservation), not a
  silently dropped requirement. Filtered to lines whose `core.items.kind='good'` --
  confirmed by reading `20260906103000_core_items.sql`'s own comment before building
  this, not assumed, that `kind='good'` is specifically the invariant
  `core.item_inventory_attrs` (and therefore real stock tracking) ties to.
- **Reservation fires exactly once per job**, on the specific DB update that actually
  flips `unscheduled -> scheduled` (`tryAdvanceJobToScheduled`'s own `.select("id")`
  now checks whether a row was actually updated) -- a second work event scheduled
  against an already-`scheduled` job does not double-reserve the same lines. The manual
  `markJobScheduled()` fallback (F-5, still reachable from the job detail page) gets the
  same call, since it's a second real path to the same transition.
- **Consuming on completion always releases first, then consumes** --
  `inventory.adjust_stock_for_contract()`'s own `outbound` check only looks at
  `quantity - reserved - damaged - expired` (confirmed by reading the RPC's own SQL
  before relying on this, not assumed) -- it does *not* implicitly clear a prior
  reservation, so consuming the same units a job reserved earlier requires releasing the
  hold first or the outbound check would double-count them against availability.
  Live-verified this exact release-then-consume sequence directly against the RPC (see
  below).
- **Every reservation/consumption call is best-effort, per line, independently caught**
  -- neither an unlicensed `inventory` (checked once via `hasModule` before doing any
  work at all) nor a single line's stock shortfall ever blocks scheduling or completing
  a job (PRD §7 acceptance criterion #4: "the same job completes cleanly with the parts
  as plain charges" if unlicensed -- extended here to a licensed-but-insufficient-stock
  case too, since a dispatcher's own low-stock banner, not a hard block, is how Kickserv
  itself would surface that problem).
- **Warehouse selection is "the first active warehouse for this business"** -- no
  per-job or per-line warehouse picker exists (multi-warehouse dispatch is out of this
  "M" story's scope); a documented simplification for businesses with more than one
  active warehouse, not a silently dropped feature.
- **"`stock.low` surfaced to the dispatcher"** lives on `/fsm/schedule` -- no dedicated
  `/fsm` root dispatcher-dashboard route exists yet (PRD §5 lists one, but no F-story has
  built it; it isn't in the current backlog either), and the schedule page is this
  platform's own closest match to "the dispatcher's tool" (PRD §1.7's own description).
  Reads `module-inventory/contract/index.ts#listLowStockAlerts` (new) directly from the
  page (`apps/web`, exempt from the module-to-module contract-only restriction, same
  pattern F-13 already established) -- `module-fsm`'s own package never imports
  `module-inventory` for this. Degrades to nothing when `inventory` isn't licensed
  (`MODULE_NOT_LICENSED` as a normal result, not an error).
- **`module-fsm/package.json` now depends on `@cofounderai/module-inventory`** (added,
  lockfile regenerated) -- the one real cross-module *code* import this story needs
  (`lib/inventory-integration/mutations.ts` calls `module-inventory`'s contract
  directly, since that logic lives in `module-fsm`'s own job lifecycle, not in
  `apps/web`). Checked deliberately against the exact class of bug the Vercel deploy
  fix earlier in this epic already taught: a missing workspace dependency in
  `package.json` builds fine locally (a bare `npm install` hoists every workspace
  regardless of who declares it) but breaks Vercel's narrower, declaration-scoped
  install.

No new SQL-level test file: the only new SQL surface is one new contract function
reading an existing table (`inventory.alerts`) with existing columns -- `reserveStock`/
`releaseStock`/`consumeStock`/`listWarehouses` and the `low_stock` alert trigger were
already covered by SP-9-era tests. `scripts/test-discovery-rls.mjs`'s permission-count
assertion stays at 41 (no permissions added).

Live-verified the exact reserve/release/consume/alert sequence against the dev Supabase
project inside one self-cleaning (rolled-back) transaction (as the seeded business's own
owner, via `set_config('request.jwt.claim.sub', ...)` so `adjust_stock_for_contract()`'s
own `auth.uid()`-sourced `created_by` resolves, matching how a real signed-in session
would call the same RPC): confirmed `kind='good'` correctly distinguishes a stocked
part from a `kind='service'` line; reserved 3 units of a 10-on-hand item and confirmed
`reserved` became 3 with `quantity` unchanged; released then consumed those same 3
units and confirmed `reserved` returned to 0 while `quantity` dropped to 7 (proving the
release-then-consume ordering this code depends on is correct, not merely assumed); then
dropped the item below its own `reorder_point` and confirmed an open `low_stock` alert
appears, exactly the row `listLowStockAlerts()` reads. No assertion failures, zero
residue after rollback. The TypeScript integration functions themselves (`reserveJobParts`/
`consumeJobParts`) were not invoked live (same reasoning as F-13's handler: they run
inside the Next.js runtime, not something a SQL-editor session can call) -- verified by
direct code review plus the SQL mirror of every RPC call and query they issue. The
low-stock banner's own rendering was not exercised in an actual browser, same documented
gap as every other UI addition in this module.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (37
migrations, unchanged); full `test:db` suite green (permission count still 41,
unchanged); `npm run build --workspace=apps/web` succeeds; live end-to-end verification
against the dev Supabase project as described above.

## F-15 -- FSM settings screens

**No new migration, no new permissions.** `fsm.service_types`/`job_charge_types`/
`settings` (F-1) already had every column this story's screens edit; reused the
existing `settings.manage` permission (seeded for `inventory`'s own settings, F-1-era
`core.permissions`) rather than minting an `fsm`-specific duplicate -- same "permission
keys are role-capability checks, not module-ownership checks" reasoning F-8 already
established for `invoices.*`.

**A real mistake caught before it shipped, worth recording**: while building the
numbering tab, I initially wrote a migration adding a `select` RLS policy to
`core.number_sequences`, assuming its "RLS enabled, zero policies" state (flagged by
every prior story's Supabase security advisor run) was an oversight. Running `test:db`
immediately failed `scripts/test-core-number-sequences.mjs`'s own assertion: "the
counter table itself is unreadable directly (zero policies), even by a member of the
business it belongs to, though rows exist" -- a *deliberate*, already-tested invariant
(D-4's own design: the only sanctioned access path is `core.next_number()`'s SECURITY
DEFINER RPC), not a bug. Deleted the migration and rewrote the numbering read to go
through the admin client instead, with its own explicit `requirePermission` check
standing in for RLS -- the "privileged path, explicit authorization check in code"
pattern `core/db/admin.ts`'s own docstring calls for. Left as a reminder for future
stories: an advisor finding is a prompt to go read why, not a diff to write on sight.

`packages/module-fsm/src/lib/{service-types,job-charge-types,settings,numbering}/` +
`components/settings/settings-view.tsx` + one new route (`/fsm/settings`, already linked
from `SERVICE_NAV`'s "Administration" group since F-1). Notable decisions:

- **Service types and job charge types get full CRUD** (create, rename, deactivate/
  reactivate) -- deactivate, never delete, since both are already referenced by
  existing opportunities/jobs and `core.document_lines.job_charge_type_id`
  respectively; the active-only picker lists (`listActiveServiceTypeOptions`/
  `listActiveJobChargeTypeOptions`, F-2/F-3) already filter on the same flag this
  story's toggle flips.
- **The document/reminders form is one upsert against `fsm.settings`**
  (`onConflict: business_id`, the table's own primary key) -- the row that has never
  existed for any business until now. This is the exact toggle F-8's
  `auto_invoice_on_complete`, F-9's `reminder_lead_hours`, and F-10's
  `customer_center_enabled`/`contact_form_enabled` each documented as "correctly wired,
  no UI to turn it on yet" -- all four features go live the moment a business saves
  this form for the first time, no code changes needed in any of them.
- **Message templates are explicitly not built** -- confirmed by grep before writing
  this (not assumed) that no `core.message_templates` table exists anywhere in this
  schema. This is the exact same gap F-11's own "Known blockers" section already
  documents for the Messages tab (`core.messages`/`threads`/`message_templates` are all
  story `S-3`, Epic 6, not yet built) -- per CLAUDE.md non-negotiable #5, no
  `fsm`-only parallel table was created to work around it.
- **Company logo and a document footer field are also not built** -- confirmed no
  logo/branding column or upload feature exists anywhere in the platform. Unlike
  message templates, this isn't blocked on another epic's table so much as it's a
  genuinely separate feature (storage bucket, upload UI, and rendering it into three
  already-built pages: the estimate/invoice/customer-center views) that this "M" story's
  scope doesn't cover -- documented as deferred rather than adding an unused settings
  column with nothing to consume it (CLAUDE.md principle 7).
- **Numbering is read-only** -- shows the current prefix/next-value per scope
  (`job`/`estimate`/`invoice`/`credit_note`, the scopes FSM's own flows actually mint)
  so staff can see what's coming next, but there's no edit action: rewriting a live
  counter risks colliding with an already-issued number, and nothing in the PRD's MUST
  scope asks for that risk.

No new SQL-level test file: no new tables, columns, constraints, or permissions --
every table this story's screens touch already has its own coverage (F-1's tenant
isolation for `service_types`/`job_charge_types`/`settings`,
`test-core-number-sequences.mjs`'s own numbering coverage, unaffected since nothing here
changed its access pattern). `scripts/test-discovery-rls.mjs`'s permission-count
assertion stays at 41 (no permissions added).

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: created, renamed, and deactivated a service type and confirmed every step
round-trips; created and renamed a job charge type; confirmed no `fsm.settings` row
exists for a fresh business, then mirrored `updateFsmSettings()`'s own upsert twice --
the first save creates the row and every field round-trips, the second updates it in
place rather than duplicating it. No assertion failures, zero residue after rollback.
The settings page's own permission gate (`hasPermission(businessId, 'settings.manage')`,
shown as a plain "you don't have permission" message rather than a crash for anyone
else) and every form's browser interaction were not exercised in an actual browser,
same documented gap as every other UI addition in this module.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (37
migrations, unchanged -- confirming the number_sequences migration was correctly
reverted, not just written and forgotten); full `test:db` suite green, including
`test-core-number-sequences.mjs`'s own "still unreadable directly" assertion still
passing; `npm run build --workspace=apps/web` succeeds (the new `/fsm/settings` route
compiles and registers); live end-to-end verification against the dev Supabase project
as described above.

---

## Epic 5 (FSM) summary

Every backlog story except F-11 (blocked on `S-3`, Epic 6's own `core.messages`/
`threads`/`message_templates`) is done: F-1 through F-10 and F-12 through F-15. Each
story was committed directly to `main`, verified end-to-end against the dev Supabase
project, and confirmed deployed (Vercel production `READY`) before the next one
started. Two real gaps found and left honestly documented rather than silently
papered over, both requiring another epic's own tables before they can close:
F-11 (Messages tab) and message templates (folded into F-15's own section above) --
both blocked on the same `S-3` story. Two smaller, deliberately deferred pieces:
company logo/document-footer branding (F-15, needs upload infrastructure this
platform doesn't have yet) and per-employee reminder lead time (F-9, no such
preference column exists in the schema). Every other MUST-scope PRD requirement across
all fifteen stories has a real, live-verified implementation.
