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
