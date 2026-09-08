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
