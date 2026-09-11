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
| | 05.3 | Shortage -> Customer Follow-up | Not started |
| INT-06 (P1) | 06.1 | Service Outcome Classification | Not started |
| | 06.2 | Additional Work -> CRM Opportunity | Not started |
| | 06.3 | Recommended Parts -> Inventory | Not started |
| | 06.4 | Warranty / Revisit -> FSM | Not started |
| INT-07 (P1) | 07.1 | Cross-Module Exception Model | Not started |
| | 07.2 | Exception Resolution Actions | Not started |
| | 07.3 | Exception Auto-Close | Not started |
| INT-08 (P1) | 08.1 | Linked Object Graph | Not started |
| | 08.2 | Unified Journey Timeline | Not started |
| | 08.3 | Context-Preserving Navigation | Not started |

**P0 (INT-01 through INT-04): 16/16 done. P1 (INT-05 through INT-08): 2/13 done. Overall: 18/29 (62%).**

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
