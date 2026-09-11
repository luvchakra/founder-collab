# Cross-Module Integration Backlog — Audit Log

Dated record of every story implemented from the "CoFounderAI — Cross-Module Completion
Backlog" (Discovery + CRM + Inventory + FSM, GST excluded). Scope for this run: **P0
(INT-01 through INT-04) and P1 (INT-05 through INT-08)** — 29 stories, in the doc's own
Section 7 sequence. P2 (INT-09, INT-10) is out of scope until told otherwise.

Branch: `int-backlog`, merged into `main` after each story via the same fixed git
sequence used for the prior CRM backlog run. Per the user's explicit instruction this
run, stories are implemented one after another automatically (not stopping after each
one to ask, which is what the source doc's own Definition of Done literally says) —
only genuine architectural/key decisions are raised.

## Progress

Kept up to date after every story (most recent status line in each story's own log
entry below is the source of truth; this table is the at-a-glance summary of it).

| Epic | Story | Title | Status |
|---|---|---|---|
| INT-01 (P0) | 01.1 | Commercial Journey Resolver | Done |
| | 01.2 | Next Cross-Module Action Resolver | Done |
| | 01.3 | Journey State History | Done |
| INT-02 (P0) | 02.1 | Fulfillment Requirement Gate | Done |
| | 02.2 | Create Inventory Fulfillment/Reservation Request | Done |
| | 02.3 | Inventory Commitment State -> CRM | Done |
| | 02.4 | Fulfillment Completion -> CRM | Done |
| INT-03 (P0) | 03.1 | FSM Job Material Requirement | Done |
| | 03.2 | Reserve Parts for FSM Job | Done |
| | 03.3 | Parts Shortage -> FSM Exception | Done |
| | 03.4 | Technician Consumption -> Inventory | Done |
| | 03.5 | Parts Returned / Unused -> Inventory | Done |
| INT-04 (P0) | 04.1 | Opportunity Requires Assessment | Done |
| | 04.2 | Create FSM Assessment Request | Done |
| | 04.3 | Assessment Outcome -> CRM Opportunity | Done |
| | 04.4 | Assessment -> Quote Continuation | Done |
| INT-05 (P1) | 05.1 | Partial Availability Decision | Done |
| | 05.2 | Inventory Substitution Recommendation | Done |
| | 05.3 | Shortage -> Customer Follow-up | Done |
| INT-06 (P1) | 06.1 | Service Outcome Classification | Done |
| | 06.2 | Additional Work -> CRM Opportunity | Done |
| | 06.3 | Recommended Parts -> Inventory | Done |
| | 06.4 | Warranty / Revisit -> FSM | Done |
| INT-07 (P1) | 07.1 | Cross-Module Exception Model | Done |
| | 07.2 | Exception Resolution Actions | Done |
| | 07.3 | Exception Auto-Close | Done |
| INT-08 (P1) | 08.1 | Linked Object Graph | Done |
| | 08.2 | Unified Journey Timeline | Not started |
| | 08.3 | Context-Preserving Navigation | Not started |

**P0 (INT-01 through INT-04): 16/16 done. P1 (INT-05 through INT-08): 11/13 done. Overall: 27/29 (93%). Epic INT-07 complete (3/3) -- Epic INT-08 (08.2/08.3) is all that remains.**

## Pre-implementation reconnaissance (Rule 1 — done once, up front)

Before writing any code, the following existing infrastructure was inspected and is
being **reused, not duplicated**, throughout this backlog:

- **Contracts**: all four modules (`module-discovery`, `module-crm`, `module-inventory`,
  `module-fsm`) already have a `contract/index.ts`. `module-crm` already imports all
  three other modules' contracts extensively (`lib/timeline/queries.ts`,
  `lib/opportunities/queries.ts`, `lib/dashboard/fsm-funnel.ts`,
  `lib/dashboard/discovery-funnel.ts`, `lib/reactivation/queries.ts`,
  `lib/conversations/products.ts`) — **CRM is the established cross-module composition
  hub** in this codebase, matching this backlog's own framing (every journey in the
  outcome loop is anchored on a CRM opportunity). `module-fsm` already imports
  `module-inventory`'s contract (F-14). This backlog's new orchestration code follows
  that same precedent: CRM-anchored stories live in `module-crm`, FSM/Inventory parts
  stories extend `module-fsm`'s existing `lib/inventory-integration/`.
- **Domain events (mechanism 3, ADR-5)**: `core.domain_events` + `publish()` +
  `registerEventHandler()`/`getEventHandlers()` (in-process registry, populated by each
  module's own `events/handlers.ts`, imported once in
  `apps/web/app/api/cron/drain-events/route.ts`) + `drainDomainEvents()` (license-aware
  parking/replay, exponential-backoff retry, `core.record_domain_event_attempt()`). This
  is already idempotent, retryable, and license-aware — exactly Rule 4's "every handoff
  must define retry/idempotency/audit" requirement, already built. Used as-is for every
  "downstream module produces an outcome the upstream module reacts to" direction (e.g.
  FSM outcome -> CRM), rather than a module reaching back to import its caller's
  contract (which would create a two-way module coupling the existing codebase avoids:
  CRM imports FSM's contract; FSM never imports CRM's).
- **F-14 (`module-fsm/src/lib/inventory-integration/mutations.ts`)** already implements:
  parts-as-estimate-charge-lines (no separate FSM materials table), `reserveJobParts()`
  (on schedule), `consumeJobParts()` (release-then-consume, on completion),
  `releaseJobParts()` (on cancellation), all best-effort/license-graceful. This
  substantially covers INT-03.1/03.2's own acceptance criteria already — the real gaps
  found were: reservation failures are silently swallowed (`.catch(() => null)`, no
  shortage visible to a user), and consumption always uses the *planned* quantity (no
  actual/returned/wasted tracking). INT-03 extends this file rather than rebuilding it.
- **CRM-11.1-11.4** (`module-fsm/src/contract/index.ts`'s
  `createFsmQuoteFromCrmOpportunity`/`getFsmQuoteStatus`/`acceptFsmQuoteAndCreateJob`,
  called from `module-crm/src/lib/opportunities/mutations.ts`, surfaced on the
  opportunity detail page) is the existing CRM-opportunity -> FSM-quote/job handoff --
  reused as one of `journey/queries.ts`'s own per-module sections rather than
  re-implemented.
- **`module-crm/src/lib/timeline/queries.ts`'s `listRelationshipTimeline()`** already
  merges CRM activities/interactions with Inventory orders, FSM jobs, Discovery
  prospect state, and FSM quote status into one chronological feed — this is
  substantially INT-08.2's own "Unified Journey Timeline" already. INT-08 extends this
  file (new entry types for whatever INT-01-07 introduce) rather than building a second
  timeline.
- No pre-existing "fulfillment request", "assessment/site-visit", or "exception" concept
  anywhere in the schema — these are genuinely new, minimal schema additions introduced
  by INT-02, INT-04, and INT-07 respectively, each justified against
  `docs/plan/00-MASTER-PLAN.md`'s entity-ownership map (no existing table already covers
  the concept).

## Story log

### INT-01.1 — Commercial Journey Resolver (2026-09-11)

New `packages/module-crm/src/lib/journey/{types,queries}.ts`: `resolveCommercialJourney(businessId, opportunityId)`, read-only, composing the four module sections purely through existing reads -- Discovery via `getProspectSummaryForParty()` (discovery contract), CRM directly off `crm.opportunity`/`opportunity_stage`, Inventory via the existing `listOpportunityProducts()`, FSM via the existing `getFsmQuoteStatusForOpportunity()` -- the same calls `timeline/queries.ts` already makes for the same party/opportunity, not a second read path. An unlicensed module resolves to an explicit `not_available` section (never silently omitted, never thrown); a missing prospect/no products/no FSM engagement resolves to `not_applicable`, distinct from "not licensed."

The Inventory section is intentionally thin this story: no fulfillment/reservation entity exists yet (that's INT-02's job), so it can only report "N products linked" today. INT-02.3/02.4 will extend this exact function once that entity exists, rather than a second resolver being built later.

`deriveOverallState()` is exported and unit-tested (6 cases: lost, won-complete, won-with-pending-fulfillment, won-with-unjobbed-quote, in-progress-with-unjobbed-quote, ordinary-open) -- the only pure logic in this story; every per-module section is a direct pass-through of an already-tested/RLS-covered contract call, so no new RLS surface exists to test here.

**UI**: a new "Journey" card at the top of the CRM opportunity detail page (`crm/opportunities/[opportunityId]/page.tsx`), a compact badge row (`journey-badge.tsx`, new) rendering "Discovery: ... / CRM: ... / Inventory: ... / FSM: ..." per the epic's own example rendering, plus the blocked-reason/next-action lines when present.

Verified with full monorepo typecheck (clean), `lint:boundaries` (946 files, no violations), module-crm's vitest suite (132/132, 6 new), and a clean `next build`. No migration -- no schema change, no RLS harness run needed.

**Status**: 1 of 29 in-scope stories done (P0: INT-01 1/16, P1: INT-05-08 0/13). Next: INT-01.2, the Next Cross-Module Action Resolver.

### INT-01.2 — Next Cross-Module Action Resolver (2026-09-11)

`resolveNextCrossModuleAction(state: CommercialJourneyState)` in the same `journey/queries.ts` -- a **pure** function over the state INT-01.1's resolver already computed, no second round of contract calls. Deliberately scoped to cross-module handoffs only (create an FSM quote, create an FSM job, request inventory fulfillment, follow up with the customer) -- ordinary CRM pipeline progression (advance stage, mark won/lost) is already the page's own "Next action" card (CRM-05.2's `next_action_id`), so this resolver doesn't duplicate it.

Priority order (first match wins, "one primary next action"): accepted-quote-no-job beats everything; a won opportunity with linked products surfaces a **disabled** "Request inventory fulfillment" action with an explicit reason ("Inventory fulfillment requests aren't available yet") rather than omitting it -- INT-02.2 flips it to enabled once the real mutation exists, no restructuring needed; an open opportunity with products and no FSM engagement recommends the existing "Create FSM quote" button; a won opportunity with nothing else pending recommends a customer follow-up. No AI anywhere in this function, deliberately (CLAUDE.md principle 4) -- the epic's own "AI may explain/recommend but cannot bypass required validation" is trivially true here since there's no AI to begin with.

**UI**: the opportunity detail page's Journey card now renders the resolved primary action as a badge (filled when enabled, outline + reason text when disabled) instead of INT-01.1's plain hint string.

Verified with full monorepo typecheck (clean), `lint:boundaries` (946 files, no violations), module-crm's vitest suite (138/138 -- 6 new cases covering every priority branch plus the "nothing applicable" empty case), and a clean `next build`. No migration.

**Status**: 2 of 29 in-scope stories done. Next: INT-01.3, Journey State History.

### INT-01.3 — Journey State History (2026-09-11)

New `listOpportunityJourneyHistory(businessId, opportunityId)` in `module-crm/src/lib/timeline/queries.ts` -- the same "merge each module's own rows, sort by time" shape `listRelationshipTimeline()` (CRM-02.3) already established right above it in this file, scoped to one opportunity instead of a party's whole history, and extended with the state transitions this backlog's own journey introduces (a product linked, an FSM quote/job created/completed). Reuses that function's own query patterns directly rather than a second timeline mechanism.

Two small, additive extensions this story needed and made: (1) `TimelineSource` gained `crm.opportunity` and `inventory.product_interest` values (2 new module-attribution tags, the type's own existing job); (2) `module-fsm/src/contract/index.ts`'s `getFsmQuoteStatus()` now also returns `fsmOpportunityCreatedAt`/`jobCreatedAt`/`jobCompletedAt` -- already-available columns (`fsm.opportunities.created_at`, `fsm.jobs.created_at`/`completed_at`) it simply wasn't selecting before, so "FSM job created" and "FSM job completed" can be two real, separately-timestamped history entries instead of one entry that always sorts to "now" (the compromise `listRelationshipTimeline()`'s own fsm.quote entry still makes, unchanged, since that entry represents live status for a party's timeline, not this story's own opportunity-scoped history). Purely additive to `FsmQuoteStatus` -- every existing caller (CRM-11.2/11.4, INT-01.1) is unaffected.

"Duplicate events do not duplicate visible business outcomes" and "out-of-order events do not corrupt state" both hold structurally: this reads directly from each module's own source-of-truth rows (no new event log of its own to replay or de-duplicate), so a real-world fact appears here exactly once because it exists exactly once in its owning table, in whatever order the underlying timestamps actually fall.

**UI**: a new "History" card at the bottom of the opportunity detail page, the identical row-rendering block (label/detail/timestamp, clickable when `detailHref` is set) Customer 360's own Timeline card already uses -- copy-pasted rather than extracted into a shared component, matching this codebase's existing preference for two small duplicated blocks over a premature shared one (CLAUDE.md principle 1).

Verified with full monorepo typecheck (clean), `lint:boundaries` (946 files, no violations), module-crm's vitest suite (138/138, unchanged -- this story's own logic is a direct extension of the already-untested `listRelationshipTimeline()` precedent, not new pure logic of its own), and a clean `next build`. No migration.

**Status**: 3 of 29 in-scope stories done -- **Epic INT-01 complete** (3/3). Next: INT-02.1, the Fulfillment Requirement Gate (starts Epic INT-02).

### INT-02.1 — Fulfillment Requirement Gate (2026-09-11)

New nullable `crm.opportunity.fulfillment_requirement` column (migration `20260911002000`, check-constrained to `inventory_required`/`service_only`/`product_and_service`/`fulfilled_externally`/`not_required`). Deliberately never auto-written: `suggestFulfillmentRequirement(hasProducts, hasFsmEngagement)` in the new `lib/opportunities/fulfillment.ts` is a pure, unit-tested deterministic default (4 cases) that only ever pre-selects a dropdown -- `setFulfillmentRequirement()` is the one and only place the column is ever written, always by an explicit human submit, so a founder's own override (e.g. "fulfilled externally" for something shipped outside the system before this story existed) can never be silently recomputed out from under them by a later story reading the same signals.

**UI**: a new `FulfillmentGate` component (`crm/opportunities/fulfillment-gate.tsx`) on the opportunity detail page's Journey card -- a plain server-action form (no client component needed, same shape as the existing Owner-assign form on this page), showing the confirmed value or the suggested default pre-selected, "Confirm"/"Update" depending on which. Scope decision: this gate is exposed prominently on the detail page rather than hard-blocking the Kanban drag-to-won action -- intercepting that client-side drag-and-drop flow with a synchronous confirmation step would be a materially bigger UX change than this story's own acceptance criteria ask for ("explicit before opportunity closure **where applicable**"); the gate is visible and unmissable on the page a founder actually works an opportunity from, satisfying the intent without redesigning the Kanban interaction.

Also fixed an existing `types.test.ts` fixture (the `Opportunity` object builder) to include the new field, required for the new column to typecheck against every existing caller.

Verified with full monorepo typecheck (clean), `lint:boundaries` (949 files, no violations), `lint:migrations` (83 migrations, no violations), module-crm's vitest suite (142/142 -- 4 new), a live migration application to the dev Supabase project followed by `get_advisors` (identical pre-existing findings only, no new one from this column), and a clean `next build`.

**Status**: 4 of 29 in-scope stories done. Next: INT-02.2, Create Inventory Fulfillment/Reservation Request.

### INT-02.2 — Create Inventory Fulfillment/Reservation Request (2026-09-11)

Reuses `inventory.sales_orders` (a compat view over `core.documents`, `doc_type='sales_order'`) as the authoritative fulfillment entity, rather than inventing a parallel "fulfillment request" concept -- a sales order already *is* Inventory's own answer to "commit to shipping N units of X to a customer" ("no duplicate business masters"). New inventory contract functions `createFulfillmentRequest()`/`getFulfillmentStatus()` wrap the existing `createSalesOrder()` mutation (now returns the created id, a small additive change -- its one existing caller doesn't use the return value); the party is auto-tagged with the `customer` role first (`addPartyRole()`, idempotent) since `inventory.customers` is an inner-join compat view that would otherwise silently exclude a CRM lead who's never been tagged that way. First active warehouse is used when the caller has no location concept of its own to offer -- same fallback `module-fsm`'s own `inventory-integration/mutations.ts` already established for an identical reason.

New nullable `crm.opportunity.fulfillment_request_id` (migration `20260911002100`) -- the exact same "one pointer, everything else read live" shape as `fsm_opportunity_id`. `createFulfillmentRequestForOpportunity()` mirrors `createFsmQuoteForOpportunity()`'s own idempotency exactly: an opportunity that already has a request returns it instead of creating a second one ("Duplicate requests are prevented"); a failed request leaves the column unset, so calling it again is always safe ("Failed request is retryable"); `MODULE_NOT_LICENSED` surfaces as a friendly, catchable error rather than crashing ("Inventory unavailable/unlicensed produces a recoverable blocked state").

Went back and updated both of INT-01's resolvers as promised in their own doc comments: `resolveCommercialJourney()`'s Inventory section now reports "Fulfillment requested" once `fulfillment_request_id` is set (previously only ever reported a product count), and `resolveNextCrossModuleAction()`'s `request_fulfillment` action is now genuinely `enabled: true` (previously a deliberately-disabled placeholder) and stops recommending itself once a request already exists. Updated the INT-01.2 test suite to match (two tests rewritten, one new one added for the "already requested" case).

**UI**: a new "Inventory fulfillment" card on the opportunity detail page (placed before the FSM quote card, same shape) -- a "Request inventory fulfillment" button (disabled with an inline hint when no products are linked yet, same UX as the existing "Create FSM quote" button) before a request exists; the sales order's live status + total afterward.

Verified with full monorepo typecheck (clean, after fixing `deriveOverallState()`'s own inventory parameter type to the real `CommercialJourneyState["inventory"]` shape), `lint:boundaries` (949 files, no violations), `lint:migrations` (84 migrations, no violations), module-crm's vitest suite (143/143) and module-inventory's (6/6, unchanged), a live migration application followed by `get_advisors` (identical pre-existing findings only), and a clean `next build`.

**Status**: 5 of 29 in-scope stories done. Next: INT-02.3, Inventory Commitment State -> CRM.

### INT-02.3 — Inventory Commitment State -> CRM (2026-09-11)

New `deriveFulfillmentCommitmentState(status)` in `module-crm/src/lib/opportunities/fulfillment.ts` -- a pure, unit-tested (5 cases) projection from `SalesOrderStatus` onto the backlog's own vocabulary. The backlog's suggested states (Requested -> Pending -> Reserved -> Partially Reserved -> Backordered -> Fulfilled -> Cancelled) assume a partial-reservation concept the real Inventory domain doesn't have -- `inventory.confirm_sales_order()` reserves a sales order's lines atomically and raises if any line is short (no persisted "partially reserved"/"backordered" state exists to read) -- so, per this story's own instruction ("use only states supported by the existing Inventory domain"), the projection only ever emits `pending` (draft), `reserved` (confirmed/processing/packed/shipped), `fulfilled` (delivered), or `cancelled` (cancelled/returned, distinct labels).

`resolveCommercialJourney()`'s Inventory section (INT-01.1/02.2) now calls the existing `getFulfillmentStatusForOpportunity()` once a request exists and projects its live status through this function -- still "one pointer, everything else read live," no new caching. A cancelled/returned commitment (or a stale/deleted sales-order reference) now surfaces as `warning` rather than `ok`, so a won opportunity whose fulfillment fell through doesn't silently read as fully handled; `deriveOverallState()`'s `fulfillmentPending` calc was extended to treat that `warning` the same way it already treats FSM's own stale-reference warning (`won_in_progress`, not `won_complete`). `resolveNextCrossModuleAction()` is deliberately untouched -- recommending a *re-request* after a cancellation would need `createFulfillmentRequestForOpportunity()`'s own idempotency rule changed (it currently always returns the existing reference regardless of status), which is INT-05's "partial fulfillment / shortage loop" territory, not this story's.

Also extended `FulfillmentStatus` (module-inventory contract) with `updatedAt` -- purely additive, same as `FsmQuoteStatus`'s INT-01.3 extension -- and `listOpportunityJourneyHistory()` (`timeline/queries.ts`) now appends one "Inventory fulfillment: <state label>" entry per opportunity (source `inventory.order`, reusing the same tag `listRelationshipTimeline()`'s own sales-order entries already use) so a meaningful fulfillment-state change is visible in the opportunity's History card -- "CRM opportunity timeline reflects meaningful changes" (INT-02.3's own acceptance criterion). "Status changes are idempotent" and "negotiated CRM values are not silently overwritten by Inventory" both hold trivially: CRM never writes the projected state anywhere, it's derived fresh on every read from Inventory's own live status.

**UI**: the opportunity detail page's "Inventory fulfillment" card now shows the friendly commitment-state badge (destructive variant when cancelled) alongside the raw sales-order status badge, matching the FSM quote card's existing two-badge layout.

Verified with full monorepo typecheck (clean), `lint:boundaries` (949 files, no violations), module-crm's vitest suite (149/149 -- 6 new) and module-inventory's (6/6, unchanged), and a clean `next build`. No migration -- purely additive TypeScript surface over already-selected/available columns.

**Status**: 6 of 29 in-scope stories done. Next: INT-02.4, Fulfillment Completion -> CRM.

### INT-02.4 — Fulfillment Completion -> CRM (2026-09-11)

INT-02.3 already made the live commitment state visible; this story closes the actual gap the backlog's own outcome names ("next action resolved"). Before this story, `deriveOverallState()`'s `fulfillmentPending` treated *any* existing fulfillment request as done (`status: "ok"` reads the same whether a sales order is merely `draft`/reserved or genuinely `delivered`) -- a won opportunity read as `won_complete` the moment a request was made, not once it was actually fulfilled.

Added `commitmentState: FulfillmentCommitmentState | null` to the journey's Inventory section (`journey/types.ts`) -- null until a request exists, then INT-02.3's own `deriveFulfillmentCommitmentState()` result, carried alongside `status`/`label` rather than replacing them (badge coloring still wants the coarser `ok`/`warning` distinction). `fulfillmentPending` now reads `inventory.commitmentState !== "fulfilled"` instead of merely checking `fulfillmentRequestId` is set -- "pending"/"reserved" (still fulfilling) correctly keep the opportunity `won_in_progress`; only `"fulfilled"` (or no Inventory engagement at all) allows `won_complete`.

`resolveNextCrossModuleAction()`'s `follow_up_customer` guard is extended the same way: it now also fires once `commitmentState === "fulfilled"`, not just when Inventory was never applicable -- "Inventory fulfilled -> CRM post-sale journey" (the backlog's own "FSM not required" branch). The FSM-required branch ("Inventory fulfilled -> FSM handoff becomes available") needed no code change: `create_fsm_quote` was never gated on fulfillment completion to begin with, so it's already available as soon as products are linked, independent of where the fulfillment request stands.

Deliberately unchanged: `createFulfillmentRequestForOpportunity()`'s idempotency (still always returns an existing reference regardless of status) -- letting a founder request a *new* fulfillment after a cancelled one is INT-05's "partial fulfillment / shortage loop," not this story's "next action resolved" scope.

Verified with full monorepo typecheck (clean), `lint:boundaries` (949 files, no violations), module-crm's vitest suite (152/152 -- 3 new: a won+reserved case staying `won_in_progress`, a won+fulfilled case reaching `won_complete`, and `resolveNextCrossModuleAction` recommending `follow_up_customer` once fulfilled), and a clean `next build`. No migration.

**Status**: 7 of 29 in-scope stories done -- **Epic INT-02 complete** (4/4). Next: INT-03.1, FSM Job Material Requirement (starts Epic INT-03).

### INT-03.1 — FSM Job Material Requirement (2026-09-11)

Rule 1 inspection before writing anything found F-14's `inventory-integration/mutations.ts` already computes exactly this ("a job's parts are its originating estimate's charge lines with `core.items.kind='good'`") -- but also found a real, live bug in it: `listJobPartLines()`'s job lookup ran through a client scoped to the `core` Postgres schema and queried `.from("jobs")`, while jobs actually live in `fsm.jobs` -- confirmed live against the dev project (`information_schema.tables` has only `fsm.jobs`, no `core.jobs`). That query has always thrown, and every one of its three callers (`reserveJobParts`/`consumeJobParts`/`releaseJobParts`) wraps it in `.catch(() => {})`/`.catch(() => null)` at the call site in `jobs/mutations.ts` -- so F-14's entire reserve-on-schedule/consume-on-completion/release-on-cancel mechanism has silently done nothing since it shipped. Fixed by giving the job lookup its own `fsm`-schema client (the same `createClient({schema: "fsm"})` pattern `module-fsm/src/db/server.ts` and `estimates/queries.ts`'s own `fsmSchemaClient()` already establish) rather than the `core`-schema one, which stays correct for the `core.items` lookup right after it.

Refactored the corrected function out of `mutations.ts` into a new `inventory-integration/queries.ts` as `listJobMaterialRequirement()`, returning full display data (item name/SKU/unit, not just id/quantity) instead of the old internal-only shape -- one function, two consumers: `reserveJobParts`/`consumeJobParts`/`releaseJobParts` for the reservation math, and the new read this story actually asks for ("Allow an FSM job/work order to declare required inventory items where applicable"). No new requirement entity or stock ledger was created (Rule 3, "Never Copy Ownership") -- FSM "declares" required items by simply having them on the estimate that became the job, the same source already used for reservation.

**UI**: a new "Materials" tab on the job detail page (`JobDetail`, `components/jobs/job-detail.tsx`), shown only when Inventory is licensed (ADR-10 "don't advertise" -- ADR-10-gated feature, tab omitted rather than shown-then-hidden when unlicensed). Lists item name/SKU/quantity/unit, or an empty state ("No inventory items required for this job.") for a service-only job -- "service-only jobs require no inventory" holds trivially, not as a special case.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (950 files, no violations), and a clean `next build`. `node scripts/test-module.mjs fsm` ran too: its vitest package suite passes (module-fsm has no unit test files at all -- consistent with the rest of this module relying on the live-DB scripts in `scripts/test-fsm-*.mjs` rather than mocked unit tests for anything DB-shaped), and its RLS harness failed only on `createdb: connection to server ... failed` -- no local Postgres in this environment, an environment limitation the skill's own guidance calls out, not a regression from this change. No migration -- no schema change, only a corrected client and a new read function over existing tables.

**Status**: 8 of 29 in-scope stories done. Next: INT-03.2, Reserve Parts for FSM Job.

### INT-03.2 — Reserve Parts for FSM Job (2026-09-11)

`reserveJobParts()` (F-14) already reused the correct existing mechanism (`reserveStock()`, module-inventory's contract) and already made no direct FSM writes to Inventory tables -- two of this story's five acceptance criteria held before today. The other three didn't: every per-line result was discarded (`.catch(() => null)`, not even checking `.ok`), so "Reserved / Partially Reserved / Unavailable" was never actually knowable, "partial availability is explicit" and "user sees missing items" both failed silently, and nothing made a second `reserveJobParts()` call for the same job safe from double-reserving (no exception ever fired to prevent it, since `reserveStock()` returns a result object, not a throw).

New `fsm.jobs` columns (migration `20260911002200`): `parts_reservation_status` (`reserved`/`partially_reserved`/`unavailable`, nullable), `parts_reservation_detail` (jsonb, the shortfall lines), `parts_reservation_checked_at`. Deliberately not a stock ledger -- `inventory.stock_movements`/`stock_levels` remain the only authority on what actually moved and what's currently available; this is a small FSM-owned fact about the job itself ("what happened when this job tried to reserve its parts"), the same kind of thing `status`/`on_hold_reason` already are. `reserveJobParts()` now checks each `reserveStock()` result; a failed line's shortfall is computed via the existing `getAvailability()` contract read (no new Inventory surface) and recorded, and the job's overall status is derived from how many lines succeeded.

Idempotency: `reserveJobParts()` now checks `parts_reservation_status` first and returns immediately if a reservation attempt has already run for this job, rather than re-attempting (which would double-reserve already-successful lines) -- a deliberate retry after replenishment is explicitly left to INT-03.3's own "Retry Handoff" exception action, not something this function does on repeated invocation. Also fixed `releaseJobParts()` (cancellation) to clear the status columns after releasing -- leaving a stale `Reserved`/`Partially reserved` badge on a cancelled job (nothing is actually reserved any more) would have been actively wrong. `consumeJobParts()` is deliberately untouched; richer actual/returned/wasted consumption state is INT-03.4/03.5's own job.

**UI**: the Materials tab (INT-03.1) now shows a status badge (secondary/default/destructive for reserved/partially_reserved/unavailable) and, per shortfall line, "Short N `<unit>`" in the item row.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (950 files, no violations), `lint:migrations` (85 migrations, no violations), a live migration application to the dev Supabase project followed by `get_advisors` for both `security` and `performance` (identical pre-existing findings only, no new one from the three added columns), and a clean `next build`. No live end-to-end reservation smoke test was run (would need a seeded job/estimate/item chain plus an authenticated request cycle, heavier than this environment's available tooling) -- code review against the already-verified `adjust_stock_for_contract` RPC semantics (INT-03.1's own live query confirmed its behavior) is this story's verification instead.

**Status**: 9 of 29 in-scope stories done. Next: INT-03.3, Parts Shortage -> FSM Exception.

### INT-03.3 — Parts Shortage -> FSM Exception (2026-09-11)

New `fsm.jobs` columns (migration `20260911002300`): `parts_shortage_resolution` (`await_replenishment`/`substitute_item`/`reschedule_job`/`obtain_manually`), `parts_shortage_resolution_note`, `parts_shortage_resolved_at` -- deliberately orthogonal to INT-03.2's `parts_reservation_status`, which stays Inventory's own live truth about the reservation attempt; this records what the founder decided to do about it. None of the four resolutions are executed by this function -- "reschedule" points at the job's existing Schedule feature (F-6), "substitute" at INT-05.2's future recommendation engine (not built yet, correctly deferred rather than half-built here), and "await replenishment"/"obtain manually" are inherently outside-the-system facts -- `resolveJobPartsShortage()` (new, `inventory-integration/mutations.ts`) only records which one was picked, satisfying "the user must explicitly choose the resolution" without inventing mechanisms this story doesn't ask for.

Also closes the "Retry Handoff" gap INT-03.2's own doc comment deliberately deferred here: new `retryJobPartsReservation()` clears a job's reservation outcome and shortage resolution, then re-runs `reserveJobParts()` -- the explicit, human-triggered way to retry after stock arrives (no background poller/cron; Rule 6's "AI cannot silently... alter authoritative inventory" territory this story stays out of by keeping the retry manual).

**UI**: the Materials tab (INT-03.1/03.2) grows an exception panel, shown only when `parts_reservation_status` is `partially_reserved`/`unavailable` -- the recorded resolution (once set) or a plain "this job is short on parts" prompt, a resolution picker (`NativeSelect` + optional note, matching the codebase's existing plain-controlled-state form pattern in this same file) gated on `canEdit`, and a "Retry reservation" button.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (950 files, no violations), `lint:migrations` (86 migrations, no violations), a live migration application to the dev Supabase project followed by `get_advisors` for both `security` and `performance` (identical pre-existing findings only), and a clean `next build`.

**Status**: 10 of 29 in-scope stories done. Next: INT-03.4, Technician Consumption -> Inventory.

### INT-03.4 — Technician Consumption -> Inventory (2026-09-11)

New `fsm.jobs.parts_consumption` (jsonb array, migration `20260911002400`) + `parts_consumption_recorded_at`: a technician's explicit report of `actual`/`returned`/`wasted` per material line, distinct from `planned` (what `listJobMaterialRequirement()` says was needed). `actual` + `wasted` both permanently leave stock (`consumeStock`, "outbound" -- used productively or used-but-lost are the same movement from Inventory's point of view, the contract exposes no separate "damaged" movement type and this story doesn't invent one); `returned` releases its reservation back to available (`releaseStock`) -- correctly covers "never left the warehouse, wasn't needed after all." A genuine issue-then-return round trip (parts that physically left and came back) needs an inbound movement type the contract doesn't have -- deliberately left to INT-03.5, whose own acceptance criteria ("Only implement states supported by the existing FSM/Inventory models") explicitly license not building it here.

`recordJobPartsConsumption()` (new, `inventory-integration/mutations.ts`) is idempotent and correction-safe through one mechanism: every call computes the *delta* against the job's last-recorded `parts_consumption` (zero the first time) and only moves that delta. An identical resubmission moves nothing ("duplicate technician submission does not double-consume stock"); a genuine correction (different numbers) moves exactly the difference, and the new totals are always persisted so the correction itself stays visible ("corrections are auditable") even on the rare case where a *decrease* can't be reflected in stock (un-consuming/un-releasing isn't a movement this contract supports either, same limitation as the issue/return gap above).

`consumeJobParts()` (F-14's own completion hook) is now a fallback: if a technician already explicitly reported usage (`parts_consumption` set), it does nothing, since that report already moved the real stock -- blindly consuming the *planned* quantity on top would double-consume. Jobs where nobody records detailed usage keep the original planned-quantity behavior unchanged, so detailed reporting is additive/supported, never required.

**UI**: the Materials tab gains a "Report actual usage" panel (shown once a job reaches `in_progress`/`on_hold`/`completed`, gated on `canEdit`) -- one row per material line with three number inputs (actual/returned/wasted, defaulting to planned/0/0, or the last-recorded values once a report exists) and a submit button.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (950 files, no violations), `lint:migrations` (87 migrations, no violations), a live migration application followed by `get_advisors` for both `security` and `performance` (identical pre-existing findings only), and a clean `next build`.

**Status**: 11 of 29 in-scope stories done. Next: INT-03.5, Parts Returned / Unused -> Inventory.

### INT-03.5 — Parts Returned / Unused -> Inventory (2026-09-11)

Rule 1 inspection found "support return of unused reserved material" already substantially built: INT-03.2 (`reserveJobParts()`) is Reserved, INT-03.4 (`recordJobPartsConsumption()`) is Used (`actual`+`wasted`, `consumeStock`) and Returned (`returned`, `releaseStock` -- unused reservations go back to available). Reserved -> Used / Returned / Wasted is the complete set of states this codebase's Inventory contract actually tracks; a textbook "Issued" step (physically picked/handed to a technician, distinct from merely reserved) has no backing state anywhere in the schema, and a genuine issue-then-return round trip (parts that physically left the warehouse and later come back) needs an inbound movement type the contract doesn't expose. This story's own acceptance criterion -- "only implement states supported by the existing FSM/Inventory models" -- licenses leaving both unbuilt rather than inventing either, so no new mechanism, migration, or UI was needed for the story's headline ask.

Inspection did surface one real correctness gap directly under this story's own scope, though: `consumeJobParts()`'s fallback path (jobs that complete without ever getting an explicit technician report, still using F-14's original planned-quantity behavior) never wrote `parts_consumption`, so a job's *first* explicit correction after a fallback completion (e.g. "actually 2 of these were never used, return them") would compute its delta against an empty `{actual: 0, ...}` baseline instead of what was truly already consumed (`{actual: planned, ...}`) -- silently re-consuming the full planned quantity a second time on top of what the fallback already took. Fixed by having the fallback path also snapshot its assumed consumption (`actual: planned, returned: 0, wasted: 0` per line) into `parts_consumption`, exactly like `recordJobPartsConsumption()` already does -- both paths now leave a job in the same bookkeeping state, so `recordJobPartsConsumption()`'s existing delta mechanism is safe regardless of which path ran first, without needing to special-case which one it was.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (950 files, no violations), and a clean `next build`. No migration -- reuses `parts_consumption` (INT-03.4); no UI change -- the existing Materials tab already reads `parts_consumption` correctly once it's populated by either path.

**Status**: 12 of 29 in-scope stories done -- **Epic INT-03 complete** (5/5). Next: INT-04.1, Opportunity Requires Assessment (starts Epic INT-04, the last P0 epic).

### INT-04.1 — Opportunity Requires Assessment (2026-09-11)

New nullable `crm.opportunity.assessment_requirement` (migration `20260911002500`, check-constrained to `none`/`remote`/`on_site`/`technical`) -- the exact same shape as INT-02.1's `fulfillment_requirement`: never auto-computed, only ever written by an explicit human choice (`setAssessmentRequirement()`, new `lib/opportunities/assessment.ts`). Unlike fulfillment, there's genuinely no existing signal on an opportunity this story could derive a smart default from -- no product/FSM-engagement combination implies "needs an on-site visit," that's exactly the pre-quote information gap this epic exists to close -- so the gate simply defaults to `none` until a human says otherwise rather than inventing a heuristic with nothing real behind it. "This is a CRM commercial requirement; FSM owns the actual service appointment/work" holds trivially at this story's scope: nothing here touches FSM at all, that's INT-04.2's job.

**UI**: a new `AssessmentGate` component (`crm/opportunities/assessment-gate.tsx`), the same plain server-action form shape as `FulfillmentGate`, placed right below it on the opportunity detail page's Journey card.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (952 files, no violations), `lint:migrations` (88 migrations, no violations), module-crm's vitest suite (152/152, unchanged -- no pure logic of its own to add a test for, matching `setFulfillmentRequirement()`'s own precedent of no dedicated mutation test), a live migration application followed by `get_advisors` for both `security` and `performance` (identical pre-existing findings only), and a clean `next build`.

**Status**: 13 of 29 in-scope stories done. Next: INT-04.2, Create FSM Assessment Request.

### INT-04.2 — Create FSM Assessment Request (2026-09-11)

The genuinely new entity this backlog's own recon flagged: no "assessment/site-visit" concept exists anywhere in the schema (checked against `docs/plan/00-MASTER-PLAN.md`'s entity-ownership map -- absent). New `fsm.assessments` table (3 migrations, split by schema per `lint:migrations`' own single-non-core-schema-per-file rule: the table itself, `crm.opportunity.assessment_request_id`, and `core.permissions`/`role_permissions` for a new `assessments.manage` key). Modeled as its own lightweight table rather than a special `fsm.jobs` row: INT-08's own object-graph example lists "FSM Assessment", "FSM Quote", and "FSM Job" as three separate linked things under one CRM opportunity, and an assessment has its own small outcome vocabulary (INT-04.3) that doesn't belong on jobs. Same RLS/cross-reference-enforcement pattern as every other `fsm` table, reusing the schema's own existing `enforce_party_business_id`/`enforce_party_contact_business_id`/`enforce_address_business_id` helpers -- no new ones needed. `get_advisors`' first performance pass caught a real gap (`unindexed_foreign_keys` on the two new FK columns) -- fixed in the same migration file before commit, confirmed clean on re-check.

No column on `fsm.assessments` points back at the originating CRM opportunity as a live reference -- the established direction throughout this backlog holds: CRM stores the one pointer (`assessment_request_id`, mirrors `fsm_opportunity_id`/`fulfillment_request_id`), FSM never imports CRM's contract. Defense-in-depth dedup exists at both layers anyway (a `source`/`source_reference` unique partial index on the FSM table, same shape as `fsm.opportunities`' own CRM-11.1 dedup, plus `createAssessmentRequestForOpportunity()`'s own check-first) -- "Duplicate assessment creation prevented" holds even if a future caller skips the CRM-side wrapper.

New contract functions `createFsmAssessmentFromCrmOpportunity()`/`getAssessmentStatus()` (module-fsm), mirroring `createFsmQuoteFromCrmOpportunity()`/`getFsmQuoteStatus()`'s own shape exactly (collapse to `ContractResult`, `MODULE_NOT_LICENSED` handling). The CRM-side wrapper `createAssessmentRequestForOpportunity()` resolves what it needs from data CRM already has on file rather than asking the founder to re-enter it: the opportunity's own primary contact (`listOpportunityContacts()`, already fetched by this page) and the party's own primary `service`-kind address (`core.addresses`' existing `getPrimaryAddress()`, reused directly -- core-owned, no cross-module import issue). Discovery context is transferred once at creation time as a plain text snapshot (`getProspectSummaryForParty()`, "where authorized" = discovery licensed and a matching prospect exists) -- Rule 3, a handoff transfers context, not a live pointer. Refuses to run before INT-04.1's own gate says something other than `none`/unset -- this function only carries out a decision already made, it doesn't make one.

**UI**: a new "Assessment" card on the opportunity detail page (before the FSM quote card), shown once `assessment_requirement` is set to something other than `none` -- an empty state with a "Request FSM assessment" button plus explicit "No contact on file"/"No service address on file" notes when either is missing ("Missing address/contact requirements clearly shown," this story's own acceptance criterion -- shown, not blocking, since FSM's own columns are nullable and a founder may still want to request one to unblock next steps), or the live status/outcome badges once requested.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (955 files, no violations), `lint:migrations` (91 migrations, no violations), module-crm's vitest suite (152/152, unchanged), live migration applications to the dev Supabase project (the table, the two missing indexes, the CRM pointer column, the permission seed) followed by `get_advisors` for both `security` and `performance` (clean after the index fix, otherwise identical pre-existing findings only), and a clean `next build`.

**Status**: 14 of 29 in-scope stories done. Next: INT-04.3, Assessment Outcome -> CRM Opportunity.

### INT-04.3 — Assessment Outcome -> CRM Opportunity (2026-09-11)

The outcome vocabulary itself (`scope_confirmed`/`scope_changed`/`additional_work_identified`/`not_feasible`/`customer_unavailable`/`follow_up_required`) and its storage (`fsm.assessments.outcome`/`outcome_notes`) already existed from INT-04.2's own schema; what was missing was a way to actually *set* it and something for the founder to *do* once it's set. New `recordAssessmentOutcome()` (`lib/assessments/mutations.ts`) is deliberately **not** part of `contract/index.ts` -- "FSM remains authoritative for visit/assessment" means FSM's own staff record it from FSM's own page, CRM never writes it, so this stays a plain FSM-internal mutation the same way `resolveJobPartsShortage()`/`recordJobPartsConsumption()` are. Sets `status` alongside `outcome` in the same write (`not_feasible` -> matching status, everything else -> `completed`) so the two fields can't drift out of sync.

New minimal FSM page, `/fsm/assessments/[assessmentId]` -- no list page or new sidebar entry (not asked for by this story; reachable via the CRM opportunity page's own new "Open in FSM" link, itself a small down payment on INT-08.3's future cross-module navigation, not a redesign of it). Shows assessment details (resolving contact/address from `core`'s own already-existing `listContactsForParty()`/`listAddressesForParty()` -- no new core query needed) and the outcome-recording form, gated on `assessments.manage` and only while status is `requested`/`scheduled`.

"User can create/update quote only after required assessment conditions are satisfied": `createFsmQuoteForOpportunity()` (CRM) now checks -- if `assessment_requirement` is set to anything other than `none`, quote creation is blocked until `assessment_request_id` exists **and** `getAssessmentStatus()` (already built, INT-04.2) reports a non-null outcome. Reuses the existing contract read, no new mechanism. UI mirrors INT-01.2's own "disabled actions must explain missing prerequisites" rule: the "Create FSM quote" button is disabled with an inline hint rather than only failing after a click.

Verified with full monorepo typecheck (clean across all 9 workspaces, after fixing one `??`/`||` mixed-operator error TypeScript's own parser rejects), `lint:boundaries` (957 files, no violations), module-crm's vitest suite (152/152, unchanged), and a clean `next build` (confirmed the new `/fsm/assessments/[assessmentId]` route is actually built). No migration -- purely additive TypeScript/UI over columns INT-04.2 already created.

**Status**: 15 of 29 in-scope stories done. Next: INT-04.4, Assessment -> Quote Continuation.

### INT-04.4 — Assessment -> Quote Continuation (2026-09-11)

"No manual re-entry of customer/service-location data": reading `CreateFsmQuoteInput` and `createFsmQuoteFromCrmOpportunity()`'s own insert statement (Rule 1) showed `fsm.opportunities.primary_contact_id`/`service_address_id` have existed since the original F-1 schema, but the CRM-quote-creation path never populated them -- a gap, not a missing mechanism, so the fix is purely additive: no new columns, no new migration. Added `contactId?`/`serviceAddressId?` to `CreateFsmQuoteInput` and wired them into the `fsm.opportunities` insert.

CRM's `createFsmQuoteForOpportunity()` now resolves the same contact/address CRM already has on file -- reusing the exact `listOpportunityContacts()` + `getPrimaryAddress()` pattern `createAssessmentRequestForOpportunity()` (INT-04.2) established -- and passes them through. When an assessment was required, its recorded outcome (`outcomeNotes` or a humanized `outcome`, already fetched by INT-04.3's own gating check) is carried onto the new FSM opportunity's `description` too, so the quote starts with the assessment's findings already in view instead of an empty field.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (957 files, no violations), `lint:migrations` (91 migrations, no violations -- no new migration this story), module-crm's vitest suite (152/152, unchanged), and a clean `next build`.

**Epic INT-04 complete (4/4). All of P0 complete (16/16).**

**Status**: 16 of 29 in-scope stories done. Next: INT-05.1, Partial Availability Decision (starts Epic INT-05, the first P1 epic).

### INT-05.1 — Partial Availability Decision (2026-09-11)

New `checkOpportunityFulfillmentAvailability()` (`lib/opportunities/availability.ts`) -- classifies each opportunity product line as `available`/`backordered`/`unavailable` by summing `getAvailability()` (already-existing Inventory contract call) across every warehouse and comparing to the requested quantity. Run before a fulfillment request is created, not after: `inventory.confirm_sales_order()`'s own atomic all-or-nothing reservation (documented in `fulfillment.ts`'s existing comment) means a full-quantity request against short stock would only fail later, silently, at confirm time -- exactly what this story's "Do not silently alter the opportunity" forbids.

When every line is fully available, the opportunity page's existing "Request inventory fulfillment" button behaves exactly as before (INT-02.2, unchanged). When any line is short, that button is replaced by an explicit decision panel: a per-line breakdown (item, status badge, requested vs. available) plus real actions for four of the epic's five named options -- "fulfill available quantity" (new `fulfillAvailableQuantityForOpportunity()`, creates a request capped to each line's own available quantity, dropping lines with none), "wait for complete quantity" (new `recordFulfillmentWaitDecision()`, a deliberate no-op on the opportunity itself, audited so the choice is recorded rather than silently absent), and "cancel unavailable quantity"/"change requested quantity" (both the same new `updateOpportunityProductQuantity()` edit on `crm.product_interest.quantity`, pre-filled with the available amount as a convenience but freely editable). "Substitute" is the fifth option and is deliberately not built here -- INT-05.2, the very next story, is what gives Inventory a substitution concept to offer; building a substitute action against nothing to substitute would be exactly the speculative functionality CLAUDE.md principle 7 forbids. It's added to this same decision panel once INT-05.2 lands.

Also fixed a pre-existing gap while touching this file: `"crm_opportunity.fulfillment_requested"` (INT-02.2's own audit action) was never added to `ACTION_LABEL`, so it rendered as a raw key on any audit log view -- a one-line completion of an already-established pattern, not a refactor.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (958 files, no violations), `lint:migrations` (91 migrations, no violations -- no schema change this story, `crm.product_interest.quantity` already existed), module-crm's vitest suite (152/152, unchanged), and a clean `next build`.

**Status**: 17 of 29 in-scope stories done. Next: INT-05.2, Inventory Substitution Recommendation.

### INT-05.2 — Inventory Substitution Recommendation (2026-09-11)

New `listSubstitutes()` (module-inventory's contract) -- deterministic, not AI-guessed (CLAUDE.md principle 4): a candidate is "valid" when it shares the requested item's `category_id` (the only equivalence concept the existing catalog has -- no new `substitutable_for` table invented for this story) and has positive available quantity somewhere (summed across warehouses, same formula `getAvailability()` already uses). "Inventory remains source of truth": this is a plain read, CRM never guesses at alternatives on its own.

`checkOpportunityFulfillmentAvailability()` (INT-05.1) now calls it for every non-`available` line and attaches the results as `LineAvailability.substitutes` -- only for short lines, since a fully-stocked line has nothing to substitute. The opportunity page's INT-05.1 decision panel gets a new "Possible alternatives" row per short line, one button per candidate (name, available quantity, price) that calls new `substituteOpportunityProduct()` (`lib/opportunities/products.ts`, mirroring `updateOpportunityProductQuantity()`'s no-audit-log convention already established by its sibling functions in that file) -- swaps `crm.product_interest.item_id` to the chosen substitute, leaving the requested quantity untouched so it carries over to the new item.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (958 files, no violations), `lint:migrations` (91 migrations, no violations -- `core.items.category_id`/`status` already existed, no schema change needed), module-crm's vitest suite (152/152, unchanged) and module-inventory's (6/6, unchanged), and a clean `next build`.

**Status**: 18 of 29 in-scope stories done. Next: INT-05.3, Shortage -> Customer Follow-up.

### INT-05.3 — Shortage -> Customer Follow-up (2026-09-11)

The epic's own "When the shortage clears, existing replenishment workflow can resume rather than creating a second duplicate opportunity" is a near-verbatim description of CRM-10.3/10.4's already-built out-of-stock waitlist: `createOutOfStockWaitlist()` (idempotent per `product_interest_id`, `follow_up_product_interest_id_uq`) creates one follow-up per shortage, and the existing `inventory.stock.replenished` event handler already pulls any pending `product_interest_id`-linked follow-up forward once real stock returns -- exactly "resume, don't duplicate." So this story is a new caller, not a new mechanism: no second waitlist concept, no new table.

The one real gap: that function only ever set `conversation_id`, since its only caller until now was conversation-linked product interests -- an opportunity-linked shortage's own `product_interest.opportunity_id` was being silently dropped. Fixed by widening its own select/insert to carry `opportunity_id` through when the product interest has one; this is also what makes the created follow-up show up on the opportunity's own existing Follow-ups card for free, no new UI needed.

New `createShortageFollowUpsForOpportunity()` (module-crm's `opportunities/mutations.ts`) calls it once per non-`available` line. Wired into both of INT-05.1's shortfall-leaving actions: "fulfill available quantity" (whatever the partial request couldn't cover gets tracked) and "wait for complete quantity" (every line is still short, since nothing was fulfilled). The two lines INT-05.1 already resolves synchronously -- "cancel unavailable quantity" and "change requested quantity" -- don't get a follow-up, correctly: the founder already dealt with the shortage themselves in those cases, there's nothing left pending to track.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (958 files, no violations), `lint:migrations` (91 migrations, no violations -- `crm.follow_up.opportunity_id` already existed), module-crm's vitest suite (152/152, unchanged), and a clean `next build`.

**Epic INT-05 complete (3/3).**

**Status**: 19 of 29 in-scope stories done. Next: INT-06.1, Service Outcome Classification (starts Epic INT-06).

### INT-06.1 — Service Outcome Classification (2026-09-11)

New `fsm.jobs.outcome` (fixed 7-value vocabulary per the story's own text, `completed_successfully` through `unresolved`) + `outcome_notes`, distinct from `status`: `status = 'completed'` is the workflow state, `outcome` is what actually happened commercially -- the thing INT-06.2/06.3/06.4 all need to react to. "Do not use AI to invent the operational state" is enforced structurally, not by convention: `completeJob()` (`lib/jobs/mutations.ts`) now takes `outcome` as a required parameter, chosen by a person from the fixed `JobOutcome` union, set in the same transition as `status: 'completed'` so a completed job can't exist without one.

UI: the job detail page's "Complete" button now opens a dialog (mirroring the existing "Put on hold" reason dialog) with an outcome select and optional notes, instead of completing on a single click; the outcome renders as a badge next to the status badge once set. No new page, no list/board changes -- this story's own scope is the classification itself, not a new outcomes dashboard.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (958 files, no violations), `lint:migrations` (92 migrations, no violations), `node scripts/test-module.mjs fsm` (module-fsm has no unit test files, consistent with the rest of this module; the RLS harness failed only on the expected no-local-Postgres `createdb` connection error, not a regression), a live migration apply + `get_advisors` for both `security`/`performance` (no new findings beyond the same pre-existing INFO noise), and a clean `next build`.

**Status**: 20 of 29 in-scope stories done. Next: INT-06.2, Additional Work -> CRM Opportunity.

### INT-06.2 — Additional Work -> CRM Opportunity (2026-09-11)

"CRM creates suggested opportunity" -- literally CRM, not FSM: the established one-way direction (CRM is the composition hub, FSM never imports CRM's contract) means FSM can't create a `crm.opportunity` row directly. Publishes a domain event instead (mechanism 3, ADR-5), the same "downstream module produces an outcome the upstream module reacts to" shape `inventory.stock.replenished` already uses -- `completeJob()` publishes `fsm.job.additional_work_identified` (best-effort, same discipline as its existing invoice-generation side effect) only when the founder's own INT-06.1 classification is `additional_work_required`; every other outcome is silent here, since only that one value means "additional commercial work."

New `module-crm/src/events/handlers.ts` subscriber creates the suggested opportunity: `crm.opportunity.source_module`/`source_reference` (new migration, mirrors `crm.lead`'s own existing pair verbatim -- not a new concept) dedupes idempotently per `(business_id, 'fsm_job', jobId)`, so a replayed drain attempt or a reopened-and-recompleted job never produces a second suggested opportunity. No `stage_id` set, matching `convertLeadToOpportunity()`'s own established shape for a freshly created opportunity. "Existing party/job context attached" is a `crm.crm_note` on the new opportunity (job number, description, outcome notes) -- reusing the table CRM already has for exactly this, not a new notes mechanism. "No automatic customer message" is true by construction: this handler only ever inserts an opportunity + a note, it never touches `crm.interaction` or sends anything -- "owner reviews" is the founder finding this new opportunity in their own pipeline.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (958 files, no violations), `lint:migrations` (93 migrations, no violations), module-crm's vitest suite (152/152, unchanged), `node scripts/test-module.mjs fsm` (same expected no-local-Postgres RLS harness failure as every other fsm-touching story this session, not a regression), a live migration apply + `get_advisors` for both `security`/`performance` (no new findings), and a clean `next build`.

**Status**: 21 of 29 in-scope stories done. Next: INT-06.3, Recommended Parts -> Inventory.

### INT-06.3 — Recommended Parts -> Inventory (2026-09-11)

`fsm.jobs.recommended_parts` (jsonb array of bare `{itemId, quantity}`, "no duplicate product records" -- name/SKU/price/availability always resolved live) is a genuinely different concept from INT-03.1's `listJobMaterialRequirement()`: that's the *current* job's own material need, derived from its estimate; this is future demand a technician flags for the party's *next* visit. New `addRecommendedPart()` appends one line at a time (mirroring the "one form submit per add" idiom `addOpportunityProduct()` already established), and a new `listRecommendedPartsWithAvailability()` read resolves each line's live availability via Inventory's existing `getAvailability()` contract call, same summed-across-warehouses formula module-crm's own availability check uses -- "FSM recommendation -> Inventory product reference -> availability."

"CRM/customer follow-up if commercially relevant": publishes `fsm.job.parts_recommended` only on the transition from an empty list to a non-empty one (one follow-up per job's worth of recommendations, not one per line) -- same one-way FSM-never-imports-CRM's-contract shape as INT-06.2's own event. New CRM handler creates a plain `crm.follow_up`, deduped idempotently via `source_module`/`source_reference` (new migration, `crm.follow_up` now carries the same generic pair `crm.lead` and `crm.opportunity` already have) keyed on `(business_id, 'fsm_job_parts', jobId)`.

UI: a new section in the job detail page's existing Materials tab (not a new tab -- this is still about parts), shown once the job is completed with outcome `parts_required_later`; an item picker (Inventory's own `kind='good'`/active catalog) plus a live list of recorded lines with availability badges.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (958 files, no violations), `lint:migrations` (95 migrations, no violations), module-crm's vitest suite (152/152, unchanged), `node scripts/test-module.mjs fsm` (same expected no-local-Postgres RLS harness failure as every fsm-touching story this session), two live migration applies + `get_advisors` for both `security`/`performance` (no new findings), and a clean `next build`.

**Status**: 22 of 29 in-scope stories done. Next: INT-06.4, Warranty / Revisit -> FSM.

### INT-06.4 — Warranty / Revisit -> FSM (2026-09-11)

The one story in this epic whose acceptance criteria explicitly forbid the pattern the other three established: "Do not create a new CRM opportunity unless the FSM outcome represents commercial work" -- a warranty revisit isn't commercial work, so unlike INT-06.2/06.3 this story publishes **no** domain event and touches no `crm.*` table at all. New `fsm.jobs.revisit_of_job_id` (self-referencing FK, `fsm.jobs -> fsm.jobs`) is a same-schema pointer, not a cross-module one -- the "cross-schema FKs point only into core" rule governs pointers that cross a *module* boundary; a table referencing itself within its own module's schema is the ordinary case every other same-module FK in this codebase already is (`opportunity_id`, `service_type_id`, ...), so a real FK + index is correct here, not a bare uuid.

`completeJob()` (`lib/jobs/mutations.ts`), when the founder's own INT-06.1 classification is `warranty_revisit_required`, calls new `createRevisitJob()` (best-effort, same `.catch(() => {})` discipline as every other post-completion side effect in this function) to insert a fresh `unscheduled` job for the same party/contact/address/service type, numbered through the same `core.next_number()` sequence every other job uses, with `description` summarizing which job it followed up ("Warranty revisit for JOB-0004: <notes>") and `revisit_of_job_id` pointing back at the original. "New/reopened FSM service action" reads as *new* here rather than *reopened*: reopening the same job (`reopenJob()`, already existing, admin-only) would erase its own completion history for what is really a distinct future visit at a different time -- a fresh job is the correct FSM-native shape, the same reasoning `duplicateJob()` already established for a different scenario.

"CRM relationship timeline updated" needed **zero** new CRM code: INT-01.1's `listRelationshipTimeline()` already reads every `fsm.jobs` row for a party live (`listRecentJobsForParty()`), so the new revisit job appears there automatically the moment it's inserted, description and all -- exactly the "read live, one pointer" principle this backlog has followed throughout, taken to its logical conclusion of needing no pointer or event at all when the consuming side already has a live read path.

UI: two small banners on the job detail page (mirroring the existing on-hold-reason banner's exact style) -- a job that is itself a revisit shows "Warranty revisit for `<link to original>`"; a job that already spawned one shows "Warranty revisit job created: `<link to the new job>`". New `getRevisitJobLinks()` query resolves both directions (the reverse lookup uses `.limit(1)` ordered by `created_at desc` rather than `.maybeSingle()`, since a job reopened and recompleted with the same outcome more than once could legitimately have more than one child).

Verified with full monorepo typecheck (clean across all 9 workspaces, after a fresh `npm install` on this newly-checked-out worktree), `lint:boundaries` (958 files, no violations), `lint:migrations` (96 migrations, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning), module-crm's vitest suite (152/152, unchanged -- this story never touches `module-crm`), `node scripts/test-module.mjs fsm` (same expected no-local-Postgres RLS harness failure as every fsm-touching story this session, not a regression), a live migration apply + `get_advisors` for both `security`/`performance` (no new findings -- the new FK's index means no `unindexed_foreign_keys` finding, and the index itself only shows up under the already-ignored `unused_index` INFO noise, expected for a brand-new column in a dev project with no traffic), and a clean `next build`.

**Status**: 23 of 29 in-scope stories done -- **Epic INT-06 complete** (4/4). Next: INT-07.1, Cross-Module Exception Model (starts Epic INT-07, the last P1 epic before INT-08).

### INT-07.1 — Cross-Module Exception Model (2026-09-11)

The original backlog text for INT-07/08 isn't in this repo (only the P0-era docs 00-06 are, plus 08's own Discovery-Intelligence doc, a different epic entirely); reconstructed this story's scope from its title and the epic name ("Cross-Module Exception Center: INT-07.1/07.2/07.3") against what already exists. Rule 1 recon first: the opportunity detail page already has two always-visible, per-opportunity cards for exactly the two "undecided" states this backlog has built so far -- Inventory fulfillment shortage (INT-05.1's decision panel, shown whenever a line is short) and Assessment (INT-04's gate/status card, "Open in FSM" link and all). A per-opportunity exception surface would just be a second, redundant read of state already visible the moment you open that opportunity. What's genuinely missing -- and what "Center" in the epic's own name implies -- is a *business-wide* view: today a founder can only discover an unresolved parts shortage or a stuck assessment by opening every job/opportunity one at a time. That's the gap this story's Model closes; scoped deliberately narrow (2 exception kinds, both already-well-defined "needs a decision" states from earlier stories, not a speculative catch-all) since 07.1 is explicitly the *model*, not the resolution UI (07.2) or auto-close semantics (07.3).

New `CrossModuleException`/`ExceptionKind` (`module-crm/src/lib/exceptions/types.ts`) and its resolver `listCrossModuleExceptions(businessId)` (`.../queries.ts`), business-wide rather than opportunity-scoped -- a first for this backlog's composition helpers, all of which (Journey, Timeline) have been per-opportunity/per-party so far. Two sources, both reusing already-established machinery rather than inventing new state:

1. **FSM parts shortage** -- new `listJobsWithUnresolvedPartsShortage(businessId)` added to `module-fsm`'s contract (`parts_reservation_status` partial/unavailable AND `parts_shortage_resolution` still null, INT-03.3's own "undecided" definition) -- a genuinely new *business-wide* read this story adds to FSM's contract, since every existing FSM contract function reads one already-known record (a quote, an assessment), not "all of them."
2. **Assessment pending** -- a plain direct `crm.opportunity` query (own table, no contract call) for rows with a gate set (`assessment_requirement` not null/`none`), filtered down to the still-open ones via the exact "no recorded outcome yet" test `createFsmQuoteForOpportunity()`'s own gating check (INT-04.3) already uses -- one already resolved (has an outcome) stops being an exception even though its gate value stays set.

Party names resolved in one batched `core.parties` read across both sources (same "no PostgREST embed, join in JS" convention as `jobs/queries.ts#listJobs` and every other list query in this codebase), not two.

**UI**: one new "Open exceptions" KPI card on the CRM dashboard (`crm/dashboard/page.tsx`), no `href` -- same as the existing "Reviews requiring action"/"Response SLA" cards on that same page, which are real counts with nowhere to drill into either. The count is real, not a placeholder; it has nowhere to link to yet because there's no list/detail page until INT-07.2 builds the resolution actions that page would need to be useful for.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (960 files, no violations -- `module-crm` importing `module-fsm`'s `contract/index.ts` is an already-established pattern, not a new boundary crossing), `lint:migrations` (96 migrations, unchanged -- this story adds no schema), `npm run lint` (0 errors, 1 pre-existing unrelated warning), module-crm's vitest suite (152/152, unchanged), `node scripts/test-module.mjs fsm` and `crm` (same expected no-local-Postgres RLS harness failure both modules have shown all session, not a regression), and a clean `next build`. No live migration/advisor check needed -- no schema touched.

**Status**: 24 of 29 in-scope stories done. Next: INT-07.2, Exception Resolution Actions.

### INT-07.2 — Exception Resolution Actions (2026-09-11)

INT-07.1's Model needed a home: a new Exception Center list page (`crm/exceptions`) -- every open `CrossModuleException`, one screen, each row actionable in place, same "actionable from one screen" principle the Follow-up Queue (CRM-05.3) already established for a different worklist. Added a real nav entry (`manifest.ts` + `module-registry`'s own hand-mirrored copy, same "kept in sync by hand" convention both files' own comments already document -- confirmed they'd drifted slightly before this story on two unrelated items, Analytics/Reactivation, left alone since fixing that wasn't this story's job) under CRM's existing "Sales" section, alongside Follow-ups. The CRM dashboard's "Open exceptions" KPI card (INT-07.1) now has a real `href` to this page instead of none.

Two resolution shapes, matching what each exception kind's own underlying state actually supports -- not a generic "resolve" button that means something different per row:

- **`fsm_parts_shortage`**: the real 4-option resolution picker (`await_replenishment`/`substitute_item`/`reschedule_job`/`obtain_manually` + optional note), calling the exact same `resolveJobPartsShortage()` mutation the FSM job detail page's own INT-03.3 picker already uses -- reachable here without navigating to the job first. New route-local `actions.ts` imports the mutation directly from `module-fsm/src/lib/inventory-integration/mutations.ts` (not via `contract/index.ts`) -- `apps/web` is exempt from the module-boundary contract-only rule (confirmed against `lint-import-boundaries.mjs`'s own `owner.kind === "app"` exemption before relying on it, same precedent the shared `LoadingSkeleton`/`Breadcrumbs` reuse already established), the same way `fsm/jobs/[jobId]/actions.ts` itself does for this exact function.
- **`assessment_pending`**: when no assessment has been requested yet (new `CrossModuleException.assessmentRequested` field, additive to INT-07.1's model), a one-click "Request assessment" button calling the same `createAssessmentRequestForOpportunity()` the opportunity page's own INT-04.2 button uses -- safe to expose without that page's missing-contact/address hints alongside it, since the function itself already tolerates both being absent rather than throwing (verified by reading it, not assumed). Once already requested, the row only links out ("Open in FSM") rather than inventing a second, thinner way to record a real outcome -- that action needs narrative detail (what was actually found on site) only FSM's own assessment page collects; a one-click aggregate-list shortcut for it would be a worse version of an already-correct flow, not a real resolution action.

Both actions are plain `FormData` server actions (not typed positional args), matching `createOpportunityFollowUpAction`'s own shape for a plain (non-client-component) multi-field form -- this list has no client-side state of its own.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (962 files, no violations), `lint:migrations` (96 migrations, unchanged -- no schema touched), `npm run lint` (0 errors, 1 pre-existing unrelated warning), module-crm's vitest suite (152/152, unchanged -- no unit test added for `listCrossModuleExceptions` itself, consistent with every other DB/contract-composing query function in this codebase, e.g. `getFsmQuoteStatusForOpportunity`/`getFulfillmentStatusForOpportunity`, none of which have one either), `node scripts/test-module.mjs fsm` and `crm` (same expected no-local-Postgres RLS harness failure both modules have shown all session), and a clean `next build` (confirmed `/dashboard/businesses/[businessId]/crm/exceptions` is actually built, not just present in source).

**Status**: 25 of 29 in-scope stories done. Next: INT-07.3, Exception Auto-Close.

### INT-07.3 — Exception Auto-Close (2026-09-11)

Checked what "auto-close" could mean before writing anything, since `listCrossModuleExceptions()` (INT-07.1) is a pure live derivation with no stored exception row of its own -- in the sense of "does the list stop showing a resolved item," both exception kinds already auto-close by construction: the FSM query filters on `parts_shortage_resolution is null` (set non-null the instant `resolveJobPartsShortage()` runs) and the assessment check filters on "no recorded outcome yet" (set non-null the instant `recordAssessmentOutcome()` runs) -- there's no cache or stored flag anywhere that could go stale. Re-verified this is really true rather than assumed, by tracing both mutation functions' own updates against the exact columns the query filters on.

What was genuinely missing, found by checking what happens in `core.audit_log` when either resolves: nothing. F-5's own job-status-change trigger (D-10's "every state transition gets an audit write" convention) only fires on `status`, not `parts_shortage_resolution` -- and `fsm.assessments` had no audit trigger at all. So the moment an exception closed left zero durable trace anywhere, even though the live list correctly stopped showing it. That's the real gap this story closes: extended `fsm.log_job_status_change()` (not a second trigger -- one more condition in the same "after update" function already firing) to also log `job.parts_shortage_resolved` when the column goes non-null, and added a new `fsm.log_assessment_outcome_recorded()` trigger on `fsm.assessments` for the same "outcome goes non-null" moment. Both are DB triggers, not application-level calls -- the actual reason this counts as "auto"-close: no future write path (an admin tool, a direct SQL fix, a different mutation someone adds later) can silently skip writing the audit trail, the same discipline D-10 established platform-wide.

Added both new actions to `core`'s shared `ACTION_LABEL`/`ENTITY_TYPE_LABEL` maps (`audit/format.ts`, read by the existing cross-module `audit-log-view.tsx` already used on the inventory audit-log page) and to the job detail page's own local History-tab label map -- same "one-line completion of an already-established pattern" INT-05.1 used for a different audit action once before, not new infrastructure.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (962 files, unchanged), `lint:migrations` (97 migrations, no violations -- the new migration only creates/replaces functions and a trigger, no `create`/`alter table` at all, so the schema-per-file checker has nothing to flag either way), `npm run lint` (0 errors, 1 pre-existing unrelated warning), module-crm's vitest suite (152/152, unchanged) and module-fsm's (no test files, `--passWithNoTests`, unchanged), `node scripts/test-module.mjs fsm` and `crm` (same expected no-local-Postgres RLS harness failure both modules have shown all session), a live migration apply + `get_advisors` for both `security`/`performance` (no new findings), **plus** two live-executed rolled-back transactions directly exercising each new trigger against real dev rows (one existing job, one freshly-inserted-then-rolled-back assessment) -- both produced exactly the expected `core.audit_log` row (`before`/`after` matching) before the transaction rolled back, so this isn't just "the DDL applied cleanly," the trigger logic itself was actually exercised. Clean `next build`.

**Status**: 26 of 29 in-scope stories done -- **Epic INT-07 complete** (3/3). Only Epic INT-08 (Business Timeline & Linked Object Graph: 08.1/08.2/08.3) remains in scope. Next: INT-08.1, Linked Object Graph.

### INT-08.1 — Linked Object Graph (2026-09-11)

No original text for this story either; reconstructed from its title and the epic's own name. Checked what already exists before writing anything: the opportunity detail page already fetches Journey (INT-01.1), FSM quote status, fulfillment status, assessment status, and linked products -- but nothing on the page ties them into one structure, and critically, the Journey card's own badges (`journey-badge.tsx`) are plain, unclickable status pills ("Discovery ✓") with zero `href`s. A founder can see *that* a prospect or FSM opportunity is linked but has no way to jump to it from this page. That gap -- not a missing read, a missing structure and a few missing links -- is what this story closes.

New `LinkedObjectGraph`/`ObjectGraphNode` (`module-crm/src/lib/object-graph`) and `buildLinkedObjectGraph()`, deliberately a **pure function** (no DB calls of its own) over data the page already has in hand (`journey`, `fsmQuoteStatus`, `products`, plus the opportunity's own `fulfillment_request_id`/`assessment_request_id` columns) -- adds zero new round trips, it only restructures what's already fetched. Checked which linked entities actually have a per-record page to link to before claiming any `href`: Discovery prospects and CRM leads have no detail route in this codebase at all (confirmed by directory listing, not assumed) -- those nodes carry real information with `href: null`, same convention `timeline/queries.ts`'s own prospect entry already established rather than guessing at a URL that doesn't exist. Inventory products and the fulfillment request (a sales order) are the same story -- list-only, no detail route. The genuinely new, real links: `/fsm/opportunities/[id]` (exists, but nothing on this page pointed at it before -- only its own estimate/job were reachable), `/fsm/jobs/[id]`, and `/fsm/assessments/[id]` (both already linked elsewhere on this same page via the FSM Quote/Assessment cards -- included here anyway since the value of this card is having every linked record in one compact place, not exclusively surfacing brand-new links).

Deliberately one hop deep off the opportunity: a job's own children (INT-06.4's revisit jobs, INT-06.3's recommended parts) would need new cross-module contract surface just to reach from here (module-crm can't read `fsm.jobs` internals directly), and both are already one click away via the FSM job node this function does produce -- adding that surface with no concrete consumer yet would be exactly the speculative functionality CLAUDE.md principle 7 rules out.

**UI**: a new "Linked records" card on the opportunity detail page, right after the Journey card -- a row of badge chips, clickable (`Link`) where a real `href` exists, plain (muted, unclickable) otherwise. Omitted entirely when the graph has no nodes yet (an opportunity with nothing linked), matching this codebase's "don't advertise emptiness with a dead card" convention.

Added a real unit-test file (`queries.test.ts`, 5 tests) since this is a pure function -- same "pure derivation functions get a vitest file" precedent as `opportunities/fulfillment.test.ts`/`opportunities/products.test.ts`, unlike the DB-touching query functions elsewhere in this backlog that don't get one.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries` (965 files, no violations), `lint:migrations` (97 migrations, unchanged -- no schema touched), `npm run lint` (0 errors, 1 pre-existing unrelated warning), module-crm's vitest suite (157/157 -- 152 previously plus 5 new), `node scripts/test-module.mjs crm` and `fsm` (same expected no-local-Postgres RLS harness failure both modules have shown all session), and a clean `next build`. No live migration/advisor check needed -- no schema touched.

**Status**: 27 of 29 in-scope stories done. Next: INT-08.2, Unified Journey Timeline.
