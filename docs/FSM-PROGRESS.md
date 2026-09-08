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
