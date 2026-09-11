# CRM-01.1 — Audit of the existing CRM implementation vs. the WonderArc CRM backlog

**Date:** 2026-09-11
**Story:** CRM-01.1 (WonderArc CRM Epics & Stories Implementation Backlog, Section 7, seq 1)
**Input documents:** `WonderArc_CRM_Epics_Stories_Implementation_Backlog.md` (the backlog
driving this and all subsequent CRM stories), `docs/design/crm-module-design.md` (the
design doc the *existing* CRM implementation was built from).

## What already exists

`packages/module-crm` is not a skeleton — it has a working, tested, deployed feature set
built from `docs/design/crm-module-design.md`'s own P0/P1 scope:

| Area | Existing tables | Existing code |
|---|---|---|
| Channels | `crm.channels` (kind: email/sms/whatsapp/social) | `lib/channels/{queries,mutations,types}.ts`, `components/channels/channels-view.tsx` |
| Channel connections | `crm.channel_accounts` (provider, encrypted tokens, `instant_reply_mode`, status) | `lib/channel-accounts/{queries,mutations,send-message,types}.ts`, `components/channels/channel-accounts-panel.tsx` |
| Inbox / tickets | `crm.tickets` (+ `external_sender_handle`, `related_module`/`related_document_id`) | `lib/tickets/{queries,mutations,ingest-inbound-message,types}.ts`, `components/tickets/inbox-view.tsx`, `api-v1/resources/tickets.server.ts` |
| Routing | `crm.routing_rules` (+ business-hours/known-sender/intent-filter extensions) | `lib/routing-rules/{queries,mutations,evaluate,types}.ts` (with `evaluate.test.ts`) |
| AI | — | `lib/ai/classify-intent.ts`, `lib/ai/draft-reply.ts` (deterministic heuristics today, not a real LLM call — documented limitation in the design doc) |
| Webhooks | — | `lib/webhooks/verify-meta-signature.ts` (+ test) — real Meta/WhatsApp signature verification |
| Events | — | `events/handlers.ts` — consumes `prospect.won` from Discovery |
| Contract | — | `contract/index.ts` — `getChatContextSummary`, `getAlerts` (both license-gated) |
| Nav/manifest | — | `manifest.ts` — Inbox / Channels / Routing Rules, `permissions: ["crm.access"]` |

Module registry (`packages/module-registry/src/index.ts`) already lists `crm` with the
same three-item nav. RLS on all four existing tables is the standard `tenant AND
licensed` shape (`20260908130000_crm_schema.sql` onward).

## Relationship to the backlog

The backlog (Section 2.2) explicitly calls for "a provider-neutral `interaction`/
`conversation` concept" as CRM's foundation, and Section 7's sequence builds
`lead`/`opportunity`/`conversation`/`interaction`/`channel_connection` as the schema
baseline (CRM-01.2) that every later epic (02 Customer 360, 06 Unified Inbox, 07
WhatsApp, 09 Lost Opportunity Engine, …) is built on. This does not match the existing
ticket/channel/channel_accounts model 1:1 — the backlog's `conversation` groups
`interaction` rows with a richer status/intent/SLA vocabulary than `crm.tickets`
currently has, and `channel_connection` is provider-neutral by design (free-text
`provider`) where `crm.channel_accounts.provider` is a closed enum.

**Decision (explicit, user-approved):** the backlog's schema **replaces** the existing
ticket/channel/channel_accounts/routing_rules model as CRM's long-term shape, rather than
running the two in parallel indefinitely. This is a deliberate architectural call, not a
default — recorded here per CLAUDE.md's "do not modify architecture without explicit user
approval."

**How the replacement actually happens:** not as a single cutover in this story or in
CRM-01.2. Ripping out `crm.tickets`/`crm.channels`/`crm.channel_accounts`/
`crm.routing_rules` and their dependent UI/webhooks/API/events today would (a) delete a
working, tested, deployed feature before its replacement exists, violating this story's
own "current implementation is not overwritten blindly" acceptance criterion and the
Definition of Done's "no unrelated refactor" / regression-test requirement, and (b) far
exceed CRM-01.2's own scope, which the backlog itself defines as schema-only. Instead,
each old piece is retired by the specific backlog story that rebuilds its function on the
new model:

| Existing piece | Retired by | Why that story |
|---|---|---|
| `crm.tickets` (grouping/threading role) | CRM-06.1 "Conversation Object" | `conversation` takes over "groups related interactions" |
| `crm.channels` | CRM-06.1 / CRM-07.1 | `channel_connection.channel` (enum) + `interaction.channel` replace the standalone label table |
| `crm.channel_accounts` | CRM-07.1–07.2 "WhatsApp Provider Adapter" / "Connection" | `channel_connection` is the provider-neutral successor |
| `crm.routing_rules` | CRM-06.3 "Conversation Assignment" / CRM-09.1 "requires_response Rules Engine" | assignment + the lost-opportunity rules engine subsume rule-based routing |
| `lib/ai/classify-intent.ts`, `draft-reply.ts` | CRM-09.3/09.6, CRM-07.12 | re-pointed at `interaction`/`conversation` once those exist; the same "heuristic today, real LLM later" caveat carries forward |
| `lib/webhooks/verify-meta-signature.ts` | CRM-07.3 "WhatsApp Webhook Endpoint" | reused as-is — signature verification doesn't change with the data model underneath it |
| `events/handlers.ts` (`prospect.won` consumer) | CRM-03.2/03.3 | re-pointed at `lead`/`opportunity` instead of `crm.tickets` |
| `contract/index.ts` | CRM-01.3 | rebuilt per that story's own required surface (`getCustomer360`, `listLeads`, etc.) |

Each retirement is that story's own migration (drop the superseded table/column once
nothing reads it) plus its own tests — not a blanket schema drop now. Until a given piece
is retired, it keeps working unmodified; the new backlog tables added in CRM-01.2 sit
alongside it, unused by any route, until the story that consumes them lands. This keeps
every intermediate commit buildable, tested, and regression-free (Definition of Done,
Section 8) while still reaching the backlog's intended end state — "replace," not
"maintain two parallel inbox implementations forever" (which was explicitly considered
and rejected).

## What can be reused as-is (no replacement needed)

- `lib/webhooks/verify-meta-signature.ts` — signature verification is data-model
  independent.
- `db/{admin,client,server}.ts` — schema-scoped Supabase client wrappers; the pattern is
  identical for the new tables.
- The RLS/cross-tenant-enforcement-trigger pattern established by
  `20260908130000_crm_schema.sql` (`enforce_*_business_id` helpers) — reused directly for
  the new tables in `20260911000000_crm_backlog_schema_baseline.sql` (CRM-01.2), including
  two of the existing helper functions themselves (`enforce_party_business_id`,
  `enforce_employee_business_id`).
- `module-registry`'s existing `crm` entry (`key`, `permissions: ["crm.access"]`,
  `optionalPeers`) — nav items change as routes change, but the module's registration
  itself doesn't need rework.

## Progress

- **CRM-01.1** (this audit) and **CRM-01.2** (schema baseline migration) — done.
- **CRM-01.3** (public contract) — done. `contract/index.ts` gained `getCustomer360`,
  `listLeads`, `createLead`, `convertLeadToOpportunity`, `createActivity`,
  `listOpenFollowUps`, `getConversation`, `recordInteraction`,
  `getOpenCommercialInteractions`, each a license-checked wrapper over a new
  `lib/{leads,opportunities,conversations,interactions,activities,follow-ups,customer-360}`
  domain. `getCustomer360` is deliberately CRM-schema-only for now — the cross-module
  aggregation (Discovery/Inventory/FSM/GST sections) is CRM-02.1's own story, not
  pre-built here.
- **CRM-01.4** (domain event vocabulary) — done. `events/types.ts` declares all 14
  required event types with versioned (`v: 1`) payloads; `events/publish.ts`'s
  `publishCrmEvent()` type-checks every call against it and is the only path CRM writes
  to `core.domain_events` through. Wired into the mutations that already exist
  (`createLead`, `convertLeadToOpportunity`, `recordInteraction`); the rest of the
  vocabulary is declared but not yet emitted, pending the story that builds its producer.
- **CRM-01.5** (provider-neutral interaction model) — done, largely by CRM-01.2's schema
  and CRM-01.3's `recordInteraction()` already satisfying it. Added explicit RLS-harness
  coverage (`scripts/test-crm-backlog-rls.mjs`) proving an email interaction and an
  Instagram interaction both fit the one `crm.interaction` table with their
  channel-specific detail (email subject, Instagram comment id) living in `metadata`,
  not a dedicated column per channel — and that `requires_response` defaults to `false`.
  No new schema or contract change was needed for this story.
- **CRM-01.6** (interaction dedup & idempotency) — done. Inbound dedup
  (`external_message_id`) already existed from CRM-01.2/01.3; this story adds the
  outbound half: `crm.interaction.client_dedupe_key` (new column + partial unique index)
  plus `recordInteraction()`'s new branch -- an existing non-`failed` row under the same
  key is returned as-is (already sent, don't resend), an existing `failed` row is updated
  in place via a new `retryFailedInteraction()` helper. Added `markInteractionFailed()`
  (internal-only, not part of the CRM-01.3 contract list) so a failure is visible
  (`status = 'failed'`, reason in `metadata.failureReason`) and retryable. Verified via
  `scripts/test-crm-backlog-rls.mjs`.
- **CRM-02.1** (Customer/Contact 360 view) — done. The route already existed from the
  pre-backlog design doc's B1 (`apps/web/.../crm/customers/[partyId]/page.tsx`) and
  already covered "quotations/jobs when licensed" (Inventory orders, FSM jobs), Discovery
  prospect stage, plus GST e-invoice status and core payment aging (both beyond this
  story's own "Show" list, kept as-is). `getCustomer360()` was extended to call those
  same already-existing cross-module contracts itself (so the CRM-01.3 contract function
  returns a complete picture for any external caller, not just this page) and to add the
  CRM-owned sections the backlog's "Show" list requires: name/contact methods
  (`core.parties` directly), lifecycle status/owner/source (from the party's most recent
  `crm.lead`, reusing CRM-04.1's vocabulary rather than a second one), products of
  interest (`crm.product_interest` joined to `core.items` by a second query, not a
  cross-schema embed), open opportunities, open follow-ups, recent conversations, and
  notes. The page now sources prospect/orders/jobs from the one `getCustomer360()` call
  instead of three separate direct contract calls, and renders the new sections; the
  ticket-linking controls are untouched. Full monorepo typecheck, `next build`,
  `lint:boundaries`, and module-crm's vitest suite all verified clean.

## CRM-02.2 (2026-09-11)

Every Customer 360 section already filters by `party_id` regardless of
`core.parties.kind`, so a `kind='company'` party already gets the same
opportunity/interaction/follow-up/conversation view a `kind='person'` one does -- B2B
and B2C are the same one panel, not two, satisfying that acceptance criterion with no
code change. The one gap was contacts: added a "Contacts" card to the same page, reusing
`core.parties.listContactsForParty()` (D-1, already existed) directly rather than adding
a CRM-side copy -- shown with name, `job_title`, primary flag, and email/phone,
conditionally fetched only when `party.kind === "company"`. Verified with typecheck and
a clean `next build`.

## CRM-02.3 (2026-09-11)

Adds `listRelationshipTimeline()` (`lib/timeline/queries.ts`) merging CRM's own
activity/interaction history (`listActivitiesForParty`/`listInteractionsForParty`, both
new) with Inventory orders, FSM jobs, and Discovery's current prospect state, each
omitted when that module isn't licensed rather than erroring (ADR-10) -- so "timeline
remains useful with only CRM licensed" holds since the CRM-owned entries alone are a
real chronological list, not an empty page. Reviews (CRM-08.5) and FSM quote-status
history (CRM-11.2) aren't included: no ingestion/contract exists yet to source them
from, so adding entries for them now would be pre-building ahead of those stories.
Sorted newest-first; each entry carries its source (`crm.activity`/`crm.interaction`/
`inventory.order`/`fsm.job`/`discovery.prospect`) and a `detailHref` only where a real
detail page exists to link to (only FSM's `jobs/[jobId]` today). Rendered as a new
"Timeline" card on the Customer 360 page. Verified with full monorepo typecheck, a clean
`next build`, `lint:boundaries`, and module-crm's vitest suite.

## CRM-02.4 (2026-09-11)

Mostly already satisfied by CRM-01.2/01.3: `crm.lead.source` and `crm.opportunity.source`
(CRM-02.4's own exact enum values) were added in the schema baseline, and
`convertLeadToOpportunity()` already carries the lead's `source` forward onto the new
opportunity, so "source survives conversion" required no new code. Added
`countLeadsBySource()` (`lib/leads/queries.ts`) as the minimal concrete proof that
"analytics can aggregate by source" -- the real reporting UI (CRM-14.4 "Discovery -> CRM
Funnel", CRM-14.6 "Channel Performance") is a later story, not pre-built here. No
equivalent for opportunities yet: there's no `lib/opportunities/` domain at all until
CRM-04.2 builds the pipeline (today opportunities only exist via
`convertLeadToOpportunity()`), so a dedicated opportunities-aggregation query has nothing
real to attach to yet.

## CRM-03.1 (2026-09-11)

Adds `promoteProspectToLead()` (`lib/leads/mutations.ts`) and the CRM-01.3-style contract
wrapper `promoteProspectToCrm()`, called from a new "Promote to CRM" button on Discovery's
prospect detail page (`apps/web/.../prospects/[prospectId]/promote-to-crm-button.tsx` +
`actions.ts`). Prospect context (product reference, ICP fit, buying signals, research
summary, outreach state, latest response) carries forward *by reference*
(`source_module='discovery'`, `source_reference=prospectId`) rather than being copied
onto `crm.lead` -- Section 4's reuse map explicitly calls for "score/reason + source
reference" and "optional research summary pointer/reference," not unrestricted copies,
and a later lookup (`getProspectSummaryForParty`, already used by Customer 360/the
timeline) reads the live values back through that reference. The confirmation dialog
names what's carried across (acceptance criterion: "user sees what data is being carried
across") without previewing copied values that don't exist.

"CRM lead is not duplicated if already promoted" is backed by a real constraint, not just
an app-level check: `lead_source_reference_uq`, a partial unique index on
`(business_id, source_module, source_reference)`, added in this story rather than
CRM-01.2 since the promotion flow (and its race condition) didn't exist until now.
`promoteProspectToLead()`'s upfront existence check is an optimization; the constraint
violation is caught the same way `recordInteraction()`'s own dedupe race is handled
(CRM-01.6). This module-discovery <-> module-crm cross-module call direction mirrors the
already-existing module-discovery <-> module-inventory bidirectional dependency in this
codebase -- not a new architectural pattern.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite, and both CRM RLS test scripts (including a new dedupe-race
assertion). Migration applied to the dev Supabase project and confirmed clean on
security/performance advisors.

## CRM-03.2 (2026-09-11)

`logInboundReplyAction` (the manual "log a prospect's reply" action on the prospect
detail page) now also calls `recordInteraction()` after `logInboundReply()`'s existing
best-effort AI classification, when that classification is meaningful
(`interested`/`question`/`objection` set `requires_response: true`; a definitive
`not_interested` is still recorded, `requires_response: false`; `out_of_office`/
`unsubscribe`/`other` are treated as noise and skipped, matching CRM-09.1's later "not
obvious spam/system noise" framing). `recordInteraction()`'s own party+channel matching
(CRM-01.3) reuses an existing open conversation for the party/channel rather than always
starting a new one. `sourceModule: "discovery"` + `sourceReference: prospectId` (plus the
originating Discovery message id in `metadata`) keep the original reference traceable.
The CRM call is best-effort (caught and logged, never thrown) so a CRM hiccup can never
lose a reply that already saved successfully.

Deliberately out of scope: the automatic inbound-email webhook path
(`ingest-inbound-email.ts` -> `classifyReply()`) runs on the admin client with no user
session, and `recordInteraction()` is currently session-client-only -- wiring that path
needs either an admin-mode `recordInteraction()` or a different integration point, which
is closer to CRM-07.x's real channel/webhook work than this story's "Discovery Response"
scope. Only the manual reply-logging path (already session-authenticated, real,
production UI) is wired here.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`, and
module-crm's vitest suite.

## CRM-03.3 (2026-09-11)

Extends Discovery's existing `getProspectSummaryForParty()` contract function with
`buyingSignals` (from `prospect_research.buying_signals`), `researchId`, `researchedAt`,
`workspaceId`, and `productId` -- all it needed was reading one more already-existing
table (`getProspectResearch()`, unchanged) into the same result, no new query path.
Since `customer360.prospect` (Customer 360's own Discovery section, CRM-02.1) already
carries this contract type straight through, the new fields reached the page for free;
only the Discovery card's own JSX needed a "Buying signals" list, a "Researched <date>"
timestamp, and a link back to the prospect's own detail page (where research is shown
inline -- there's no separate research page to link to instead). No CRM-side schema or
contract change was needed.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`, and both
module-crm's and module-discovery's vitest suites.

## CRM-03.4 (2026-09-11)

`convertLeadToOpportunity()` already satisfied "lead remains auditable" and "opportunity
links to same party/account" (CRM-01.3). This closes the remaining two criteria for
real: "product interest is preserved" and "activity and conversation history remain
attached" now mean something concrete -- any `crm.activity`/`crm.conversation`/
`crm.follow_up`/`crm.product_interest` row that was attached only to the lead (created
before conversion) gets `opportunity_id` backfilled wherever it's still null, without
touching its existing `lead_id`. Without this, a caller that filters by `opportunity_id`
(as CRM-04.x's own pipeline UI will) would see none of that pre-conversion history.

Verified with a new RLS-harness assertion (scratch activity/product_interest rows
attached only to the lead, confirmed to keep `lead_id` and gain `opportunity_id`), full
monorepo typecheck, `lint:boundaries`, and module-crm's vitest suite.

## No unrelated module changed

Every story above touches only `docs/design/`, this audit note, `supabase/migrations/`
(`crm` schema only, plus read-only foreign keys into `core`), `packages/module-crm/`,
and -- where a story's own acceptance criteria call for a cross-module action (CRM-02.1's
Customer 360 page, CRM-03.1's "Promote to CRM" button) -- the specific `apps/web/`
composition-root files for that one feature, following the exact pattern
`conversions/actions.ts` already established for the Discovery -> FSM handoff. No other
module's own internal code, schema, or docs were changed.
