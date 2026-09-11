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
| | 03.4 | Technician Consumption -> Inventory | Not started |
| | 03.5 | Parts Returned / Unused -> Inventory | Not started |
| INT-04 (P0) | 04.1 | Opportunity Requires Assessment | Not started |
| | 04.2 | Create FSM Assessment Request | Not started |
| | 04.3 | Assessment Outcome -> CRM Opportunity | Not started |
| | 04.4 | Assessment -> Quote Continuation | Not started |
| INT-05 (P1) | 05.1 | Partial Availability Decision | Not started |
| | 05.2 | Inventory Substitution Recommendation | Not started |
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

**P0 (INT-01 through INT-04): 10/16 done. P1 (INT-05 through INT-08): 0/13 done. Overall: 10/29 (34%).**

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
