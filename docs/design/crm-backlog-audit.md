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

## CRM-04.1 (2026-09-11)

Adds `updateLeadStatus()` (lib/leads/mutations.ts) -- the manual state-change mutation
CRM-04.1 needs on top of CRM-01.2's already-complete `lead_status` enum. "Status
transitions are auditable" uses `core.audit_log` (D-10), the platform's existing generic
mechanism (`writeAuditLog()`, new `crm_lead.status_changed` action/`crm_lead` entity-type
labels in `core/audit/format.ts`), not a CRM-specific history table. "AI may suggest a
state change but cannot silently change it" holds by construction: no AI caller exists
anywhere in this codebase for lead status. Publishes `crm.lead.updated` (already declared
in CRM-01.4's vocabulary, unused until now).

Adds a real "Leads" list page (`apps/web/.../crm/leads/`) and nav entry (Sales > Leads,
per the backlog's Section 10 suggested nav) -- the first UI CRM-04.x needed to exist at
all. Built to the newly-added `docs/design/claude-ui-design-rules.md` (added this session
per explicit user request, now referenced from root `CLAUDE.md` rule 13 for all future
UI work): a real `<Table>` on desktop, the established `ul.divide-y md:hidden` /
`Table.hidden md:table` pattern (mirrored from `purchase-orders-list.tsx`) rather than a
cards-only layout, with the row's own inline status-change form as its edit affordance.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite, and the CRM RLS test suite.

## CRM-04.2 (2026-09-11)

Adds the Opportunity Pipeline: `ensureDefaultStages()` lazily provisions the backlog's
default pipeline (new -> qualification -> discovery -> proposal -> negotiation ->
won/lost) the first time a business opens Opportunities -- idempotent (a business with
stages already is left alone), and safe under a race since `crm.opportunity_stage`'s own
`unique (business_id, key)` constraint (CRM-01.2) already prevents duplicates even if two
requests raced. `updateOpportunityStage()` is the drag/drop endpoint: writes
`core.audit_log` (new `crm_opportunity.stage_changed` labels) and publishes
`crm.opportunity.stage_changed` (+ `won`/`lost` on a terminal transition) -- satisfying
"drag/drop stage change with audit event" for real, not just a UI gesture with no
record. Dropping onto a `is_won`/`is_lost` stage also flips the opportunity's own
`status` so it's never `open` while sitting in a terminal column.

UI: a new Opportunities route with Kanban (default) and List views toggled via `?view=`
(mirroring module-fsm's own day/week toggle). Kanban drag-and-drop uses native HTML5
drag events -- no new dependency, mirroring module-fsm's schedule-calendar.tsx exactly.
List view follows the same real-table-on-desktop/cards-below-`md` pattern as the Leads
page. New "Opportunities" nav entry alongside Leads under Sales.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite, and the CRM RLS test suite.

## CRM-04.3 (2026-09-11)

Adds "Opportunity Value & Close Date": `estimated_value` (numeric, nullable -- an
unestimated opportunity contributes nothing to pipeline value rather than a fabricated
zero), `currency` (default `INR`), `probability` (integer 0-100, DB-checked), and
`expected_close_date` to `crm.opportunity`. `owner_id` and `source` already existed from
CRM-01.2 so weren't touched. "Primary product(s)" is explicitly CRM-04.4's own story
(Multiple Products per Opportunity) and is deliberately not built here.

`calculatePipelineValue()` is the one place pipeline math happens (types.ts, unit
tested): open and won estimated values are summed separately -- pipeline value is a
forecast of what might still close, won value is a closed fact, and blending the two
would produce a meaningless number. Lost and unestimated opportunities contribute to
neither. The Opportunities page now shows this as two summary cards above the
board/list.

`updateOpportunityValue()` writes the four fields directly with no audit/event of their
own -- unlike stage changes, these aren't a lifecycle transition the rest of the platform
reacts to, just numbers a founder is refining. The edit affordance is a per-row Dialog
(`EditValueDialog`), per `docs/design/claude-ui-design-rules.md` rule 4 (don't force a
page navigation for a simple edit) -- same pattern as `create-opportunity-dialog.tsx` in
module-fsm and the Edit-button already used in `purchase-orders-list.tsx`. Present on
both the mobile card and desktop table rows of List view.

Migration `20260911000400_crm_opportunity_value_fields.sql` applied to dev Supabase; no
new advisor findings (the existing unused-index/no-policy findings are pre-existing and
unrelated to this migration's columns, which added no new indexes).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (including the two new `calculatePipelineValue` tests), and
both CRM RLS test suites (against a harness DB with this migration applied).

## CRM-04.4 (2026-09-11)

Adds "Multiple Products per Opportunity" -- no new table needed. `crm.product_interest`
(CRM-01.2/CRM-10.1, already used by Customer 360's own "products of interest" section)
already models exactly this: an `opportunity_id` FK, an `item_id` FK into `core.items`
(no duplicate product catalog, Section 4), and a `quantity` column, all already
tenant-isolation-tested (`test-crm-backlog-rls.mjs`'s existing "Bob cannot associate
product interest with Alice's item" case). `computeLineValue()` (products.ts, unit
tested) is the one place quantity-times-catalog-price math happens -- `unit_price` is
read live from `core.items.selling_price`, not copied into `crm.product_interest`, so a
line's value can never drift from the catalog.

"Where Inventory is licensed": gated with `requireModule(businessId, "inventory")` in
both `addOpportunityProduct()`/`removeOpportunityProduct()` (defense in depth) and, at
the page level, by simply not fetching `core.items` at all when Inventory isn't licensed
-- ADR-10's degraded mode, same shape as Customer 360's own per-module sections. This is
deliberately a stricter check than CRM's own license (which RLS already enforces on
every `crm.*` table): an opportunity is fine to exist with no Inventory license, it just
has no catalog to reference.

This is also CRM-04.4's first per-opportunity detail page
(`crm/opportunities/[opportunityId]/page.tsx`) -- List/Kanban only ever showed row/card
summaries before. Kanban cards and List rows now link here (Kanban's card link moved
from the customer page to this one, since the customer is still one click away via the
contact-name heading); CRM-04.5 (Opportunity Contacts) is expected to add its own
section to this same page next, not a second detail page.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (including the new `computeLineValue` tests), and both CRM RLS
test suites -- no migration needed, so no new advisor check either.

## CRM-04.5 (2026-09-11)

Adds "Opportunity Contacts": a new `crm.opportunity_contact` junction table (its own
migration's header comment explains why this isn't `core.party_contacts.is_primary`
reused directly -- that flag is the company's own primary contact, not this deal's
chosen one, and the two can legitimately differ). "One can be primary" is a DB-level
partial unique index (`opportunity_contact_one_primary_uq`, `unique (opportunity_id)
where is_primary`), same reasoning as CRM-01.6's idempotency constraints -- not just an
app-level check. `setPrimaryOpportunityContact()` unsets the old primary before setting
the new one (two sequential updates, ordered around that constraint) since the two can't
both be true at once even transiently.

`role text` is nullable and unused by any UI control yet -- present from day one purely
so a later story can start writing it without a migration, per the acceptance criteria's
own "contact role can be captured later without restructuring the model." The section
only renders for a `kind='company'` opportunity party (a person party has no
`core.party_contacts` to pick from), mirroring Customer 360's own Contacts section rule
exactly.

New cross-tenant-reference and one-primary-constraint cases added to
`test-crm-backlog-rls.mjs` (a fresh company party + two contacts, asserting: multiple
contacts allowed, a second concurrent primary rejected, Bob cannot link Alice's contact
to his own opportunity or write against Alice's opportunity at all).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
`lint:migrations`, module-crm's vitest suite, and both CRM RLS test suites (against a
harness DB with this migration applied). Migration
`20260911000500_crm_opportunity_contacts.sql` applied to dev Supabase; no new advisor
findings.

## CRM-05.1 (2026-09-11) -- already satisfied, no code change

"Activity can be attached to party, lead, opportunity or conversation. Due date and
owner are supported." This was fully built ahead of schedule while CRM-01.2 laid down
the backlog schema baseline (`crm.activity`'s own header comment there already says "CRM-
05.1") and CRM-01.3/CRM-02.1 added the lib layer: `crm.activity_type` enum has the exact
ten types the backlog lists (call/meeting/note/email/whatsapp/social/task/follow_up/
quote_follow_up/service_follow_up); the table's `activity_attached_to_something` check
constraint requires at least one of party_id/lead_id/opportunity_id/conversation_id
(and `createActivity()` in `lib/activities/mutations.ts` validates the same rule with a
clear message before ever hitting that constraint, unit tested in
`mutations.test.ts`); `due_at` and `owner_id` are plain nullable columns already
supported by `CreateActivityInput`. Recorded here rather than silently skipped so the
story count and the "what's done and why" trail both stay accurate. No files changed for
this story.

## CRM-05.2 (2026-09-11)

Adds "Next Action": `next_action_id` on both `crm.lead` and `crm.opportunity`, a plain
nullable FK into `crm.activity`. A straight FK column already guarantees "at most one"
for free -- no partial unique index needed here, unlike CRM-04.5's opportunity_contact
primary-contact case where many rows could otherwise all claim to be primary. Owner and
due date are read live from the linked activity's own `owner_id`/`due_at`, never
duplicated onto lead/opportunity.

UI lives on the Opportunity detail page only, in the most prominent spot (right after
the header) per the story's own "prominent next_action" wording: a card showing type,
subject, due date, owner, with a "Complete" action, or -- when unset -- an inline
add-next-action form (type/subject/due date/owner). "Completing an action can prompt
creation of the next action" is implemented as: completing clears `next_action_id`
(`completeOpportunityNextActionAction`), so the add-next-action form reappears in the
same spot on the next render -- no separate modal flow needed for that prompt.

Schema and mutations (`setLeadNextAction`/`setOpportunityNextAction` in each domain's own
`mutations.ts`) cover leads too, since the story says "every active lead/opportunity" --
but no Lead detail page exists yet for a next-action UI to live on (the Leads page is
still list-only, CRM-04.1), so the Lead-side UI is deliberately deferred to whichever
future story adds one, rather than building a UI with no natural home. This mirrors
CRM-04.5's `role` column: schema ready now, UI wired up as it becomes needed.

New RLS cases: an opportunity can be given a next_action_id pointing at its own
activity; clearing it after completion leaves it unset; Bob cannot point his own
opportunity's next_action_id at Alice's activity.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
`lint:migrations`, module-crm's vitest suite, and both CRM RLS test suites (against a
harness DB with this migration applied). Migration `20260911000600_crm_next_action.sql`
applied to dev Supabase; no new advisor findings.

## CRM-05.3 (2026-09-11)

Adds the Follow-up Queue: `priority` (new `crm.follow_up_priority` enum: low/normal/
high, default normal) on `crm.follow_up` -- the one column this table (built ahead of
schedule in CRM-01.2, whose own queries.ts doc comment already flagged "the full queue
UI ... is CRM-05.3's own story") was missing for the backlog's "high-priority"
view/filter.

Two new lib pieces: `createFollowUp()`/`completeFollowUp()` (`follow-ups/mutations.ts`,
new file -- no follow-up could be created through the app before this story) and
`applyFollowUpQueueFilters()` (`follow-ups/queue.ts`), a pure function applying the
backlog's exact five views (due today/overdue/upcoming/unassigned/high-priority) plus
owner/source/channel/priority filters over one already-fetched list -- one function, unit
tested with a fixed clock, rather than five separate queries per view. `source`/`channel`
aren't columns on `crm.follow_up` itself (a follow-up's polymorphic party_id/lead_id/
opportunity_id/conversation_id attachment means which one applies depends on what it's
attached to); `listFollowUpQueue()` resolves them via separate lookups against the
attached lead's `source` or conversation's `primary_channel`, the same not-a-join pattern
already used throughout this module.

New "Follow-ups" nav entry and route
(`crm/follow-ups/page.tsx`) is the cross-entity queue screen: view tabs + a GET filter
form (same pattern the platform dashboard's own business/product/industry filter already
uses) + an inline Complete button per row -- "actionable from one screen" without
navigating away. The Opportunity detail page also gets its own scoped Follow-ups card
(list + add form + Complete), since that's the one entity-context page that already
exists; a Lead-side equivalent is deferred for the same reason CRM-05.2's was -- no Lead
detail page exists yet. Snoozing is deliberately not built here -- that's CRM-05.6's own
separate story (specific date/time, optional reason, search-visibility requirement).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
`lint:migrations`, module-crm's vitest suite (including the new 7-case
`applyFollowUpQueueFilters` suite), and both CRM RLS test suites. Migration
`20260911000700_crm_follow_up_priority.sql` applied to dev Supabase; no new advisor
findings.

## CRM-05.4 (2026-09-11) -- plus a CRM-05.3 correction

No migration needed: `crm.assignment` (append-only history) and the owner columns on
`crm.lead`/`crm.opportunity`/`crm.conversation` (`owner_id`/`owner_id`/`assigned_to`)
were all already built in CRM-01.2, whose own header comment already said "current
owner is read from the owning table's own owner_id/assigned_to column."

`assignEntity()` (new `lib/assignment/mutations.ts`) is one function for all three
entity types -- lead/opportunity/conversation -- since the shape (update the owner
column, audit the change, append to history) is identical; a table/column lookup map is
the only thing that varies. "Ownership changes are audited" is genuinely two mechanisms:
`core.audit_log` via `writeAuditLog()` (new `crm_lead.assigned`/`crm_opportunity.assigned`/
`crm_conversation.assigned` action labels -- already renders on the platform's existing
Audit Log page, no new UI needed there) and `crm.assignment`'s own history table, written
to for the first time by this story: the previously-open row is closed (`unassigned_at`)
before the new one starts, so at most one stays open per entity, RLS-harness-tested with
a reassignment scratch case. Conversation assignment has no caller yet (CRM-06.1's
Conversation Object/inbox doesn't exist until the next epic) but the function handles it
correctly regardless, since the schema was already polymorphic for all three -- no event
is published for it though, since crm.conversation.updated's existing payload is
status-specific and adding a producer with no real caller would be exactly the
declare-don't-wire line CRM-01.4 already draws.

"Unassigned items are visible": the Leads page and Opportunities List view both get an
Owner column/badge (an explicit "Unassigned" state, never a blank cell) plus an inline
assign form, mirroring the existing StatusForm pattern; the Opportunity detail page gets
the same assign control in its header. New `crm.opportunity.updated` event (mirroring
`crm.lead.updated`'s shape) is opportunity assignment's own domain event, since no
generic "opportunity updated" event existed before this story's genuine producer.

**Correction to CRM-05.3**: `crm.follow_up.created`/`crm.follow_up.completed` were
already declared in the event vocabulary (CRM-01.4) before CRM-05.3 built
`createFollowUp()`/`completeFollowUp()`, but that story's initial pass missed wiring
them up. Fixed here -- both mutations now publish their already-declared event.

Verified with full monorepo typecheck (including an event-vocabulary exhaustiveness
test update for the new `crm.opportunity.updated` entry), a clean `next build`,
`lint:boundaries`, module-crm's vitest suite, and both CRM RLS test suites (including a
new assignment-history scratch case). No new migration, so no new advisor check either.

## CRM-06.1 (2026-09-11) -- already satisfied, no code change

"A conversation groups related interactions. Conversation has status: new, open,
waiting, resolved. Conversation links to party/lead/opportunity when resolved." Fully
built ahead of schedule in CRM-01.2/CRM-01.3: `crm.conversation_status` enum is exactly
`new`/`open`/`waiting`/`resolved`; `party_id`/`lead_id`/`opportunity_id` are all nullable
FKs on `crm.conversation` already tenant-isolation-tested; `getConversationById()`
(`lib/interactions/queries.ts`, the public contract's own `getConversation()`) already
returns the conversation plus its participants and interaction timeline together --
literally "groups related interactions." `lib/conversations/types.ts`'s own doc comment
already flagged "the full unified-inbox UI ... is CRM-06.2's own story; this is just the
data." Recorded here so the story count and audit trail stay accurate. No files changed.

## CRM-06.2 + CRM-06.3 (2026-09-11) -- plus a CRM-05.4 bug fix

Built together: CRM-06.3's own remaining work (an assign control) is a few lines once
`assignEntity()` already generically supports "conversation" (CRM-05.4), so it lives on
the same screen CRM-06.2 builds rather than as a separate page.

New `crm/conversations` route -- the backlog's own three-region layout (left filters,
center list, right conversation + CRM context), a real CSS-grid three-column layout at
`md`+; below `md` only one pane shows at a time (list, or the detail pane with a back
link, driven by `?conversationId=`), since three real columns don't fit a phone width.
Each pane renders exactly once in the tree (visibility toggled per breakpoint via a
wrapper class) rather than being duplicated per breakpoint -- the filter form and the
assign form both contain fixed `id`s that would collide if mounted twice at once, unlike
the table/card-list dual-render pattern elsewhere in this app, which has no such ids.

Filters ("needs response, assigned to me, overdue, high intent, channel, status,
owner"), all real: `needsResponse`/`overdue` come from `crm.interaction`'s own
`requires_response`/`responded_at`/`response_due_at` fields (no new columns);
`highIntent` reads `intent_confidence` against a documented 0.7 default threshold.
`overdue` and `highIntent` are honest-but-empty until their producers exist
(`response_due_at` isn't set anywhere until CRM-05.5's SLA Timer; `intent_confidence`
isn't set until CRM-09.x's classifier) -- not fabricated, just plumbing ahead of the
data, same reasoning as CRM-04.5's unused `role` column. `computeConversationFlags()`
and `applyConversationQueueFilters()` (`lib/conversations/queue.ts`) are pure and unit
tested (12 cases) with a fixed clock. "Unassigned queue" is the Owner filter's own
"Unassigned" option, not a separate screen. No reply composition here -- sending is
CRM-07.x's own job; this screen is browse/triage/assign only, matching CRM-06.2's actual
acceptance criteria (layout + filters, nothing about composing).

**Bug fix (CRM-05.4)**: `assignEntity()` and the new `getCurrentEmployeeId()` both
queried `employees` through the `crm`-scoped Supabase client, but `core.employees` lives
in the `core` schema, not `crm` -- a real runtime bug (would throw or 404, not silently
misbehave) that the RLS harness's raw-SQL tests couldn't catch, since they never
exercise the actual TypeScript mutation. Fixed by routing that one lookup through a
core-scoped client, same pattern `listEmployeeOptions` (tickets/queries.ts) already uses.

Also adds `getLead()` (leads/queries.ts) and an explicit `ConversationDetail` return
type on `getConversationById()` (interactions/queries.ts) -- previously untyped, which
surfaced as an implicit-`any` typecheck error the moment a real caller (this inbox)
consumed its `interactions` array.

New "Conversations" nav entry alongside the existing ticket-based "Inbox" (left
untouched, per the retirement plan: each old piece is retired by its own dedicated
story, never a silent side effect of an unrelated one).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (12 new conversation-queue tests), and both CRM RLS test
suites (which incidentally exercise the fixed employees-lookup path via existing
assignment scratch cases). No new migration.

## No unrelated module changed

Every story above touches only `docs/design/`, this audit note, `supabase/migrations/`
(`crm` schema only, plus read-only foreign keys into `core`), `packages/module-crm/`,
and -- where a story's own acceptance criteria call for a cross-module action (CRM-02.1's
Customer 360 page, CRM-03.1's "Promote to CRM" button) -- the specific `apps/web/`
composition-root files for that one feature, following the exact pattern
`conversions/actions.ts` already established for the Discovery -> FSM handoff. No other
module's own internal code, schema, or docs were changed.

## CRM-06.4 (2026-09-11)

Adds `matchPartyForActor()` (`lib/interactions/matching.ts`), collapsing the backlog's
five-tier match hierarchy to three tiers this schema can actually back without
fabricating an unused signal: `known_external_id` (backlog tiers 1 "verified mapping"
and 3 "channel-specific external ID" collapse into one lookup -- neither
`conversation_participant` nor `interaction` distinguishes a deliberately-verified link
from one that simply recurred, so inventing a `verified` boolean nothing ever sets would
be worse than naming the collapse honestly), `contact_exact` (backlog tier 2: exact
phone/email match against `core.parties`, two separate `.eq()` queries rather than one
`.or()` filter -- `.or()`'s filter syntax is a string language, not parameterized, and
building one from untrusted webhook-sourced input risks filter injection), and
`unmatched` (backlog tier 4). Backlog tier 5 ("create new party only with
user-controlled confirmation") is deliberately not this function's job -- it never
creates a party.

Wired into `recordInteraction()`: when a caller supplies `externalActorId` but not
`partyId`, matching runs before conversation lookup/creation and before the interaction
insert. An unmatched sender still needs `conversationId` or `partyId` from the caller
today -- relaxing that so a genuinely unresolved sender can start a party-less
"unresolved contact candidate" conversation is CRM-07.4's own acceptance criterion, once
a live inbound channel exists to drive it, not this schema-only matching story's.

Tested via the RLS harness (matching against real Postgres data, same discipline as
every other DB-touching mutation in this module) rather than a mocked unit test --
`matchPartyForActor()`'s own queries have no precedent for Supabase-client mocking
anywhere in this codebase, so scratch rows verify each tier's underlying query plus
cross-tenant isolation (Bob's own lookup cannot see Alice's phone-matched party at all).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite, and both CRM RLS test suites (5 new match-hierarchy cases).
No new migration.

## CRM-07.1 + CRM-07.2 (2026-09-11)

Built together: CRM-07.1's adapter interface has no real caller until CRM-07.2's connect
flow exists to use it, and CRM-07.2's connect flow has nothing to call without the
adapter -- same reasoning CRM-06.2/06.3 were combined for.

New `lib/whatsapp/` (the provider adapter, CRM-07.1): `WhatsAppProviderAdapter`
(types.ts) declares the backlog's exact nine operations
(`connect/disconnect/healthCheck/receiveWebhook/sendText/sendMedia/sendTemplate/
markRead/getMessageStatus`); `whatsAppCloudApiAdapter` (cloud-api-adapter.ts) is its one
implementation against Meta's real Cloud API. Request-shape logic is split from network
I/O into pure `buildSend*Request()` functions (unit tested) the same way this codebase
already separates decision logic from DB calls elsewhere (routing-rules/evaluate.ts);
the fetch-executing wrapper itself has no test, matching the existing
`sendCrmChannelMessage` precedent (real production HTTP code with no live account to
test against in this environment, same as GST's own credential code). `receiveWebhook`
is a pure parser (`parseWhatsAppWebhookPayload`, 8 test cases) turning Meta's nested
`entry[].changes[].value.{messages,statuses}` shape into a flat, normalized event list
-- CRM-07.3/07.4's own job to call it, not built here. `disconnect`/`getMessageStatus`
are documented no-ops: Cloud API has no session-close call or a status-by-id read
endpoint (status only ever arrives via webhook push), and the interface exists to stay
uniform across a future provider that might have real behavior there.

New `lib/channel-connections/` (CRM-07.2, the provider-neutral successor to the old
`crm.channel_accounts` per the retirement table): `connectWhatsApp()` calls
`whatsAppCloudApiAdapter.connect()` to verify a phone_number_id + access token against
the real Graph API *before* ever storing them, encrypts the token with the same
AES-256-GCM helper BYOK/GST credentials already use, and upserts into
`crm.channel_connection` (already built in CRM-01.2, previously unused by any route).
`getDecryptedAccessToken()` is the one place `access_token_encrypted` is ever read --
never from a query a page renders, only from a future send/health-check mutation path.
`disconnectChannelConnection()` clears the stored token, not just the status, since
reconnecting is just calling `connectWhatsApp()` again with a fresh one.

New `crm/whatsapp` route (Administration) with a manual connect form
(phone_number_id + access token) -- Meta's Embedded Signup (the backlog's "recommended
path") is a JS-SDK popup flow that isn't buildable or testable without a live Meta App
and app review in this environment; this form is where either that flow or the simpler
manual path lands once a real token is in hand, same separation the old
`channel-accounts/mutations.ts` already documented for itself. The token is never
rendered back once connected, satisfying CRM-07.2's own "credentials/tokens are never
rendered to ordinary users."

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (10 new adapter/parser tests), and both CRM RLS test suites.
No new migration -- `crm.channel_connection` already existed from CRM-01.2.

## CRM-07.3 + CRM-07.4 (2026-09-11)

Built together: CRM-07.3's webhook endpoint has nothing to demonstrate without
CRM-07.4's own text-message handling (matching, conversation attachment,
`requires_response`), and CRM-07.4's acceptance criteria are entirely about what happens
when a real inbound message hits the webhook -- same reasoning CRM-06.2/06.3 and
CRM-07.1/07.2 were each combined for.

**The architectural gap found and fixed first**: `recordInteraction()`,
`matchPartyForActor()`, `markInteractionFailed()`, and their internal
`findOrCreateConversation()` all used the RLS-scoped `createClient()` (cookie/session
based) with no way to override it. A webhook request has no logged-in user at all, so
none of that logic could run from one as written. Fixed by dependency injection: each of
the three exported functions now takes an optional trailing `clients?: CrmClientOverrides`
(`{ crm?: SupabaseClient; core?: SupabaseClient }`, `lib/interactions/matching.ts`) --
every existing caller omits it and gets exactly today's behavior; a webhook handler
passes its own admin/service-role clients instead. `createAdminClient()`
(`core/db/admin.ts`) and the RLS-scoped `createClient()` both return the identical
`SupabaseClient` type, so this required no new casts or wrapper types.

New `lib/whatsapp/ingest-inbound-message.ts` (`ingestInboundWhatsAppMessage()`) is
CRM-07.3's webhook ingest function for the new provider-neutral model, replacing
`tickets/ingest-inbound-message.ts#ingestInboundCrmMessage()` for this one channel per
the retirement table. It's the one place in CRM that reaches for `createAdminClient()`
directly -- the same trust boundary the old ticket-based function already used, for the
same reason (no session to authorize against). It walks the raw payload's
`entry[].changes[]` itself (rather than trusting `parseWhatsAppWebhookPayload()`'s own
flattened list) because that pure parser deliberately drops
`value.metadata.phone_number_id` -- the one thing needed here to resolve which business
a change belongs to -- so each change is re-wrapped into a single-change payload and
handed to the same parser, keeping the parsing logic itself in one place rather than
duplicated. For each resolved business: a `"message"` event calls `recordInteraction()`
with the admin-client override, `channel: "whatsapp"`, the sender's phone as both
`externalActorId`/`senderPhone`, `requiresResponse: true`, and the media id (if any) in
`metadata` -- CRM-07.4's "receive WhatsApp text messages" is satisfied entirely by
`recordInteraction()`'s own existing matching/dedup/conversation logic, nothing new was
needed there. A `"status"` event looks up the matching outbound interaction by
`external_message_id` and either calls `markInteractionFailed()` (status `"failed"`) or
records `metadata.providerStatus` (`sent`/`delivered`/`read`) -- a dedicated
status-tracking UI is CRM-07.9's own future job, this just makes sure the data isn't
dropped. An unrecognized `phone_number_id` (no matching `channel_connection` row) is
skipped, not errored, same "don't make Meta retry forever over an account we don't
recognize" reasoning the route already used for the old model.

`apps/web/app/api/webhooks/crm-whatsapp/route.ts`'s POST handler now calls
`ingestInboundWhatsAppMessage()` instead of `ingestInboundCrmMessage()` -- `verify-meta-
signature.ts` (both the GET subscription handshake and the POST signature check) is
unaffected, reused as-is per the retirement table. Unlike a UI route, a webhook is a
single external integration point (Meta can only be configured to POST to one URL), so
there's no safe "run the old and new logic in parallel" option here the way the
Conversations UI could coexist with the old ticket-based Inbox -- this is the point
where this specific route's internals switch models. `crm-meta`'s own webhook route
(Instagram/Messenger) is untouched; only WhatsApp's model changes in this story.

Tested via the RLS harness, same discipline as every other DB-touching mutation in this
module: new scratch-row cases verify the party-less conversation dedup (`findOrCreate-
Conversation()`'s new branch -- a second message from a still-unmatched sender appends
to the same conversation via its `conversation_participant.external_actor_id` row, and
resolving the match later is a single `conversation.party_id` update, no rows to
migrate) and the webhook's own `channel_connection` business-resolution lookup
(including that an RLS-scoped query, unlike the admin client the webhook actually uses,
cannot see it cross-tenant -- confirming why the admin-client override is load-bearing,
not just convenient).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (unchanged -- no new pure logic needing its own unit tests),
and both CRM RLS test suites (5 new cases). No new migration -- `crm.channel_connection`,
`crm.conversation_participant`, and `crm.interaction` already existed.

## CRM-07.6 + CRM-07.7 (2026-09-11)

Built together: CRM-07.7's 24-hour window check has nothing to gate without CRM-07.6's
send path, and CRM-07.6's send path needs the window check to match Meta's own Cloud API
behavior (a free-form send outside the window is rejected provider-side regardless) --
same combined-story reasoning as every other tightly-coupled pair in this backlog so far.

New `lib/whatsapp/window.ts#computeWhatsAppWindowStatus(lastInboundAt, now)` (CRM-07.7):
pure, unit-tested (5 cases including the exact 24-hour boundary) against a fixed clock
parameter rather than `Date.now()`, same split as `conversations/queue.ts`'s own flag
computation. No inbound message at all counts as outside the window -- there's no session
to have opened.

New `lib/whatsapp/messaging.ts#sendWhatsAppReply()` (CRM-07.6): resolves the conversation's
last inbound interaction (its `external_actor_id` is the reply's recipient phone number
and its `occurred_at` is what the window check runs against), checks the window, then
sends through `whatsAppCloudApiAdapter.sendText()` against the business's connected
`channel_connection`. Follows `recordInteraction()`'s own documented outbound-idempotency
shape exactly: the interaction row is inserted (fresh `clientDedupeKey`, CRM-01.6) *before*
the network send, then either `attachOutboundMessageId()` (new, mutations.ts -- attaches
the provider's message id once send succeeds, the same field a later status webhook,
CRM-07.3, looks it up by) or `markInteractionFailed()` (send failed) updates the row
afterward -- a failed send is never silently unrecorded. `getConversationWhatsAppWindowStatus()`
is the read-only counterpart the page uses to decide what to render; it duplicates
`sendWhatsAppReply()`'s own window query rather than sharing it, since one is a cheap
per-request read and the other guards a real send.

UI: the Conversations detail pane (CRM-06.2) now shows, for a `whatsapp` conversation
only, either a free-form reply composer (`reply-form.tsx`'s `WhatsAppReplyForm`,
`useActionState`, same pattern as the CRM-07.2 connect form) when the window is open, or
a plain notice naming when it closed and that template sending is a future story
(CRM-07.8) when it isn't. The composer remounts (via a `key` tied to the interaction
count) after every send so a successful send clears the textarea without hand-rolled
form-reset logic.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (5 new window tests), and both CRM RLS test suites (unchanged
-- no new schema or DB-level decision logic; the window/send logic is exercised by its
own unit tests instead). No new migration.

## CRM-07.8 (2026-09-11)

"WhatsApp Template Catalog": a new `crm.whatsapp_template` table (migration
`20260911000800_crm_whatsapp_templates.sql`, applied to the dev project) is a local
registry of templates already created and approved on Meta's own side -- this story
deliberately does not build Meta's template-submission/approval workflow itself (a real,
separate feature), only enough local bookkeeping (`name`, `language_code`,
`variable_count`, `is_active`) for the send flow to know what a template needs.
`unique (business_id, name, language_code)` prevents two catalog entries for the same
real template; `deactivateWhatsAppTemplate()` soft-removes (`is_active = false`) rather
than deletes, since a template already referenced from past sends'
`metadata.templateId` shouldn't be orphaned.

`lib/whatsapp/messaging.ts` gained `sendWhatsAppTemplate()` alongside CRM-07.6's
`sendWhatsAppReply()` -- both now share a new `resolveOutboundContext()` helper (the
conversation's last-inbound recipient phone + the business's connected channel
credentials) since that lookup was identical between them; only the window check
differs, and deliberately: `sendWhatsAppTemplate()` never calls
`computeWhatsAppWindowStatus()` at all, since a pre-approved template is exactly the one
outbound path Meta still allows once CRM-07.7's 24-hour window has closed. Variable count
is validated against the template's own `variable_count` before ever calling the adapter,
so a mismatch surfaces as this function's own clear error rather than a raw Graph API
rejection.

UI: the WhatsApp admin page (CRM-07.2) gained a "Template catalog" card (list + add
form, `useActionState` again) below the connection card. The Conversations detail pane's
"window closed" notice (CRM-07.7) is now a real send path: `WhatsAppTemplateSendForm`
(template picker + a single comma-separated variables field -- a deliberate
simplification over per-template dynamic variable inputs, since the count is still
validated server-side either way) replaces the old plain text.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (unchanged), and both CRM RLS test suites (5 new
`whatsapp_template` cases: default-active, name+language dedupe, a different language is
a distinct allowed row, cross-tenant isolation, and the variable_count >= 0 check).
Migration applied to the dev Supabase project.

## CRM-07.11 (2026-09-11)

"WhatsApp Lead Capture", the last of CRM-07's P0 stories: new `lib/whatsapp/lead-
capture.ts#captureLeadFromWhatsAppMessage()`, wired into `ingestInboundWhatsAppMessage()`'s
`"message"` branch right after `recordInteraction()`. Dedup follows
`promoteProspectToLead()`'s own established shape exactly (CRM-03.1): an upfront check
against `crm.lead`'s `(business_id, source_module, source_reference)` -- here
`source_module='whatsapp'`, `source_reference=<sender's WhatsApp id>` -- then a
try/insert with the same unique-violation catch for the race case, so a second message
from the same number never creates a second lead.

The one real decision this story required: what to do for a sender CRM-06.4 couldn't
match to an existing party. CRM-06.4's own doc comment is explicit that its tier 5
("create new party") needs user-controlled confirmation, and deliberately doesn't create
one. This story creates one anyway, on purpose -- the two cases aren't the same risk.
Tier 5 was about a *possible match to an existing party* that's too uncertain to accept
automatically (accepting it wrongly means merging into someone else's record). Here
there's no existing party being second-guessed at all: a real, provider-verified
WhatsApp phone number reaching the business for the first time is by construction a
brand-new contact, so creating a `core.parties` row for it (`kind: 'person'`, name
`"WhatsApp <phone>"`, the phone itself) carries none of that wrong-merge risk. The new
party is also written onto the conversation and its `conversation_participant` row
(previously null from CRM-07.4's party-less-conversation path) so the "human resolves
the match later" story CRM-06.4 describes already holds -- except automatically, which
is this story's entire point.

This needed one small plumbing fix upstream: `createLead()` (CRM-01.3) and
`@cofounderai/core/events/mutations.ts#publish()` (the function every
`publishCrmEvent()` call goes through) both only ever used the RLS-scoped session
client, with no override -- exactly the same gap CRM-07.3 already fixed once for
`recordInteraction()`/`matchPartyForActor()`. Both gained the identical optional
`client?: SupabaseClient` parameter (defaulting to today's behavior when omitted), so a
webhook-captured lead still publishes its `crm.lead.created` event through the admin
client instead of silently failing on write, or silently not firing.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (unchanged -- no new pure logic), and both CRM RLS test suites
(3 new cases: `source='whatsapp'` is recorded, the same-sender dedupe constraint fires,
cross-tenant isolation). No new migration -- `crm.lead`'s `source` enum already included
`'whatsapp'` and its `lead_source_reference_uq` index already covers any `source_module`.

**Epic CRM-07 (WhatsApp) is now complete: 8 of 8 P0 stories done** (07.1, 07.2, 07.3,
07.4, 07.6, 07.7, 07.8, 07.11).

The user re-shared the full backlog document (`WonderArc_CRM_Epics_Stories_
Implementation_Backlog.md`) this session after an earlier context compaction lost it --
CRM-09 onward is now built against its exact acceptance criteria rather than a
reconstruction, per that document's own Section 7 sequence table (seq #35 onward).

## CRM-09.1 (2026-09-11)

Epic CRM-09 ("The Lost Opportunity Engine") begins: `requires_response` Rules Engine,
"the strongest product-specific CRM differentiator" per the epic's own framing.
Implements the backlog's exact four-part rule ("direction = inbound; channel is
supported; content is not obvious spam/system noise; no qualifying business response
exists") as `lib/interactions/response-rules.ts#evaluateRequiresResponse()`, a pure,
unit-tested function -- deterministic, no LLM call, per CLAUDE.md's "do not use an LLM
for deterministic operations" and the backlog's own "deterministic before AI
enrichment" (CRM-09.3's real intent classifier is a later, additive refinement, not a
replacement for this floor).

"Channel is supported" is read as "has a real outbound send path today" (only
`whatsapp`, per CRM-07.6) -- flagging a message on a channel the business can't yet
reply through would be a false promise. "Not obvious spam/system noise" is a small,
deliberately conservative regex set (empty content, `unsubscribe`, out-of-office,
automatic-reply, no-reply) rather than a classifier.

`recordInteraction()` (CRM-01.3) now calls this as the *default* only when the caller
doesn't already have an opinion (`input.requiresResponse` left unset) -- an existing
caller with its own more-informed decision (CRM-03.2's classification-based
`requiresResponse`) still wins outright, matching the same "a caller that already
resolved this itself" precedent CRM-06.4 established for party matching. The WhatsApp
webhook ingest path (CRM-07.3/07.4), which previously hardcoded `requiresResponse: true`
unconditionally for every inbound message regardless of content, now leaves it unset and
gets the real rule evaluation instead -- a concrete behavior change this story exists to
make.

The fourth rule ("no qualifying business response exists") can't be evaluated at the
moment a fresh inbound message arrives -- nothing has answered it yet by definition. It
matters the moment a reply *is* sent: `recordInteraction()`'s outbound path now clears
`requires_response` (`status: 'responded'`, `responded_at` set) on every prior
unresponded inbound interaction in the same conversation, not just conceptually "the one
being replied to" -- a business's single reply commonly addresses several open questions
in a row. This is also new -- previously an inbound interaction's `requires_response`
never changed after insert.

New `markInteractionNotActionable()` (mutations.ts) satisfies "user can mark not
actionable": sets `status: 'ignored'` (the interaction model's own existing status,
CRM-01.5) and clears `requires_response`, deliberately *not* setting `responded_at` --
distinct from an interaction that was genuinely answered. Wired into the Conversations
detail pane (CRM-06.2) as a small action next to each "Needs response" badge.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (9 new `response-rules` tests), and both CRM RLS test suites
(6 new cases: the outbound-clears-prior-unresponded behavior across multiple inbound
rows, the cleared row's status, not-actionable's status/requires_response/responded_at
distinction, cross-tenant isolation). No new migration -- `requires_response`,
`responded_at`, and the `ignored` status value all already existed on `crm.interaction`
from CRM-01.2/01.5.

## CRM-09.2 (2026-09-11)

"Potential Lost Business Queue" -- the backlog's own framing: "a primary dashboard, not
a hidden report," meant to read as "here is the business I might lose today," not a
contact database (Section 10's explicit UX principle). New route `crm/lost-business`,
added to the nav under Overview (both `module-registry` and `module-crm/manifest.ts`,
hand-synced as always) right after Conversations, per Section 10's own suggested nav
order.

`lib/interactions/queries.ts#listPotentialLostBusinessQueue()` builds on
`getOpenCommercialInteractions()` -- already exactly the right base set; that function's
own doc comment (written back in CRM-01.3) already anticipated this exact story. Enriches
each interaction via the same separate-batched-lookups pattern this module uses
everywhere (never a cross-schema embed): its conversation (for `opportunity_id`/
`assigned_to`), that opportunity's `estimated_value`, and the sender's `core.parties`
name.

The backlog's exact show-list is age, person/company, channel, message excerpt, intent,
related product, opportunity value if known, owner, SLA status. Two of those render an
honest em dash for now: `intent` (a real `crm.interaction` column, but nothing writes to
it until CRM-09.3's classifier exists) and "related product" (would come from
`crm.product_interest`, but associating it to a conversation/interaction is CRM-10.1's
own not-yet-built story) -- same "real column, empty until its own story lands"
discipline `conversations/queue.ts` already established for `highIntent`/`overdue`.
"SLA status" reuses `response_due_at`/`overdue` the same way -- always "On track" until
CRM-05.5 (SLA Timer, P1) starts writing business-configured due dates.

New pure `lib/interactions/lost-business.ts`: `toPotentialLostBusinessQueueRow()`
(age-in-ms + overdue, unit tested against a fixed clock) and `formatAge()` (compact
"45m"/"5h"/"3d" display, also unit tested). No actions on this page -- "Respond / Create
Lead / Create Opportunity / Create Task / Not Relevant" is CRM-09.5's own acceptance
criteria, not this story's ("Show" only).

Verified with full monorepo typecheck, a clean `next build` (route confirmed present),
`lint:boundaries`, and module-crm's vitest suite (8 new tests). No new RLS-harness cases
-- this story only reads through existing RLS-protected tables (`interaction`,
`conversation`, `opportunity`, `core.parties`), already covered by their own tenant-
isolation tests; both CRM RLS suites re-run clean as regression checks. No new
migration.

## CRM-09.3 (2026-09-11)

"Message Intent Classification": the backlog's exact 11-value taxonomy (`pricing`,
`product_question`, `availability`, `purchase_intent`, `appointment`, `support`,
`complaint`, `feedback`, `review`, `general_enquiry`, `spam`) as a new, separate
deterministic keyword classifier, `lib/interactions/intent-classification.ts
#classifyMessageIntent()` -- unit tested (8 cases). Not a real LLM call: this codebase's
only sanctioned AI-calling path today is Discovery's own BYOK/provider routing
(`module-discovery/src/lib/ai/router.ts`), discovery-schema-owned account/workspace
machinery with no contract exposing it across the module boundary (CLAUDE.md rule #3).
This is the exact same gap the *old* ticket model's own `lib/ai/classify-intent.ts`
already documented and worked around -- but this story adds a **new** file rather than
literally repurposing that one, since `classify-intent.ts` still actively serves the
still-live `crm-meta` (Instagram/Messenger) ticket pipeline with its own different
taxonomy; changing its behavior there would be an unrelated regression outside this
story's scope. The retirement table's "re-pointed... once those exist" is satisfied in
spirit (the new-model equivalent now exists, built the same documented way), not by
literally moving code that's still load-bearing for the old model.

Wired into `recordInteraction()`: every **inbound** interaction gets classified and its
`intent`/`intent_confidence` columns populated (both already existed, unused, since
CRM-01.2); outbound interactions get neither -- "what did the business intend" isn't a
concept this story defines. No caller-override input was added (unlike CRM-09.1's
`requiresResponse`): no existing caller has an intent opinion of its own to override
with, so adding that surface now would be speculative.

"AI is not the sole source of whether an item is visible in the queue" and "low-
confidence results remain available" both hold by construction rather than needing new
code: CRM-09.1's `requires_response` rules engine (deterministic, unrelated to intent)
is what the Potential Lost Business queue (CRM-09.2) filters by -- intent is display-only
enrichment on those same rows, already rendered there since CRM-09.2 (`row.intent ?? "—"`)
without any confidence-based filtering to hide a low-confidence result.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (8 new tests), and both CRM RLS test suites (1 new case
confirming `intent`/`intent_confidence` persist and stay tenant-isolated). No new
migration -- both columns already existed on `crm.interaction` from CRM-01.2.

## CRM-09.4 (2026-09-11)

"Commercial Intent Detection": the backlog's own signal list ("asks for price," "asks if
available," "asks how to buy," "asks for a quote," "asks for an appointment,"
"explicitly says interested") maps directly onto four of CRM-09.3's already-classified
intent categories, so no separate classifier was needed -- new
`lib/interactions/intent-classification.ts#isHighCommercialIntent()` is a pure lookup
(`pricing`/`availability`/`purchase_intent`/`appointment` → true; everything else,
including the more neutral `product_question`, → false), unit tested (4 new cases).

"High commercial intent is visually obvious": the Lost Business queue (CRM-09.2) now
shows a destructive-variant "High intent" badge next to the intent column (both mobile
cards and the desktop table) whenever `isHighCommercialIntent()` is true for that row.

"User can override classification": new `updateInteractionIntent()` (mutations.ts) lets
a human correct a wrongly-classified interaction, recorded at `intent_confidence: 1` --
a human's judgment call isn't a probability estimate the way the deterministic
classifier's guess is. Wired into the Lost Business queue as an inline `NativeSelect` +
`SubmitButton` form per row (docs/design/claude-ui-design-rules.md rule 4's "obvious edit
mechanism"), same pattern the Leads page's own inline status editor already established.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (4 new tests), and both CRM RLS test suites (2 new cases: the
override itself records full confidence, and Bob's own business-scoped update matches
none of Alice's rows). No new migration -- `intent`/`intent_confidence` already existed.

## CRM-09.5 (2026-09-11)

"One-click Convert to Lead/Opportunity" -- the backlog's exact action row from an
unanswered message: `Respond | Create Lead | Create Opportunity | Create Task | Not
Relevant`. `Respond` is a plain link into the Conversations detail pane (CRM-07.6's
reply composer already lives there, nothing new to build); `Not Relevant` is
`markInteractionNotActionable()`, already built for CRM-09.1 and just relabeled here to
match the backlog's own button name.

New `lib/interactions/conversion-actions.ts`: `convertInteractionToLead()`,
`convertInteractionToOpportunity()`, `convertInteractionToTask()`. Both lead/opportunity
paths require the interaction to already have a resolved `party_id` (CRM-06.4) -- shown
only in the UI when one exists, satisfying "existing party is reused" by construction
rather than inventing a new-party-creation flow (that's CRM-06.4's own tier-5 territory,
deliberately out of scope here). `convertInteractionToLead()` first checks for the
party's own most recent still-open lead (any source) and reuses it instead of always
creating a new one -- otherwise a party CRM-07.11 already auto-captured a WhatsApp lead
for would get a second, competing lead the moment a human clicked "Create Lead" on a
later message in the same thread. Only when none exists does it create one, keyed on
`(business_id, source_module='crm_interaction', source_reference=interactionId)` --
reusing `crm.lead`'s existing `lead_source_reference_uq` index (no new migration needed,
the constraint doesn't care what `source_module` value it's given).
`convertInteractionToOpportunity()` reuses `convertLeadToOpportunity()` (CRM-03.4) on
that same lead rather than a parallel direct-insert path, and if the lead had already
been converted by an earlier click, reuses the existing opportunity instead of creating
a duplicate one.

"User never loses the original message context": both conversions link the result back
onto `crm.conversation.lead_id`/`opportunity_id` (only when not already set, so a repeat
click never clobbers a different existing link) -- the Conversations page's own "Lead:
..."/"Opportunity: ..." badges (CRM-06.2) surface it immediately, on the same
conversation the interaction still lives in. "Conversion preserves original
interaction" holds by construction: none of these functions ever update or delete the
`crm.interaction` row itself, only insert/update other tables.

UI: a new `ActionsRow` component on the Lost Business queue (CRM-09.2) renders the
backlog's exact five actions per row (mobile cards and the desktop table's new
right-aligned Actions column).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (unchanged -- these functions are DB-touching orchestration,
tested via the RLS harness instead per this module's own established split), and both
CRM RLS test suites (5 new cases replicating the lead-reuse check, both conversation
links, and that the original interaction is never modified). No new migration.

## CRM-09.6 (2026-09-11)

"AI Suggested Response" -- the last of Epic CRM-09's P0 stories. New `lib/interactions/
draft-reply.ts#draftInteractionReply()`: template-by-intent, NOT a real LLM call, the
same documented gap this backlog has hit three times now (the old ticket model's own
`lib/ai/draft-reply.ts`, CRM-09.3's classifier, and now this) -- module-crm has no
sanctioned cross-module contract to call a real model through. A new file again rather
than reusing the old one, for the same reason CRM-09.3 didn't: `lib/ai/draft-reply.ts`
still serves the live `crm-meta` pipeline's own `DetectedIntent` taxonomy.

Covers the backlog's own context list ("latest conversation, party 360, Discovery
research, Inventory product details/availability, FSM quote/job data") almost entirely
by reusing `getCustomer360()` (CRM-02.1's already-built cross-module aggregation) rather
than re-fetching each piece separately -- `getDraftReplyForInteraction()` is the thin
query wrapper that resolves an interaction's party, calls it, and feeds the result plus
the interaction's own CRM-09.3 `intent` into the pure template function. "Business
instructions" (a configurable per-business prompt/tone) isn't built anywhere in this
platform yet, so it's the one context source this story doesn't cover -- named here
rather than silently dropped.

"System clearly separates factual retrieval from generated wording": `draftInteractionReply()`
returns `{ draft, sources }` as two distinct values -- `sources` names exactly which real
Customer 360 facts (contact name, product interest, Discovery research, recent orders,
recent jobs) actually shaped this draft, `draft` is the generated wording itself, never
presented as a verified fact on its own. The UI renders both: the WhatsApp reply
composer (CRM-07.6) now shows the suggested draft in a dashed box labeled "AI suggested
reply -- based on X, Y" above the textarea, with a "Use this draft" button that only
fills the textarea (a plain DOM ref write, no form submission) -- "draft only," "user can
edit," and "user must explicitly send" all hold exactly as before, since nothing about
the Send button's own behavior changed.

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`, and
module-crm's vitest suite (6 new tests for the pure template function). No new
RLS-harness cases -- no new schema or DB-level decision logic, just a new read composed
from an already-tested query; both CRM RLS suites re-run clean as regression checks. No
new migration.

**Epic CRM-09 (The Lost Opportunity Engine) is now complete: 8 of 8 P0 stories done**
(09.1 through 09.6, plus 09.2 and 09.5 covering the queue and its actions). P1 stories
09.7 (Response Quality Check) and 09.8 (Escalation Rules) remain for the P1 pass.

## CRM-15.1 (2026-09-11) -- already satisfied, no code change

Epic CRM-15 ("Permissions, Governance & Reliability") begins: "Tenant RLS." Acceptance
criteria are "every tenant-owned CRM row is constrained by `business_id`" and
"cross-business access tests fail safely." Verified both directly against the live dev
Supabase project rather than assuming prior work covers it:

- `select relname, relrowsecurity, (select count(*) from pg_policies ...) from pg_class
  where relnamespace = 'crm'::regnamespace` -- all 19 `crm.*` tables (every one built
  across CRM-01.2 through CRM-07.8, the old ticket-model tables included) have RLS
  enabled with exactly 4 policies each.
- Read every one of those 76 policies' `qual`/`with_check` expressions directly: all of
  them are the identical `business_id IN user_business_ids() AND business_id IN
  (write_)licensed_business_ids('crm')` shape ADR-4/ADR-8 require -- no table has a
  looser or table-specific policy that could leak across businesses.
- `get_advisors(type: "security")`: zero `rls_disabled_in_public` or
  `policy_exists_rls_disabled` findings for any `crm.*` table. The five
  `rls_enabled_no_policy` findings are all `core`/`discovery` tables unrelated to this
  story (pre-existing, e.g. `core.number_sequences`); the one `WARN` (leaked password
  protection) is an Auth-level setting, not a CRM tenant-isolation concern.
- "Cross-business access tests fail safely" is already covered exhaustively: both
  `scripts/test-crm-rls.mjs` and `scripts/test-crm-backlog-rls.mjs` assert "Bob cannot
  see/create/update Alice's ..." for essentially every table and cross-tenant reference-
  smuggling path, and both have been re-run clean after every single story this session.

No gap found, so no migration or code change -- documented per this audit's own "already
satisfied" pattern (CRM-05.1, CRM-06.1) rather than silently skipping the story. Verified
with both CRM RLS test suites (unchanged, re-run clean) and the live project's own
advisors.

## CRM-15.2 (2026-09-11)

"Role Permissions": seeds the backlog's own exact 9-key list into `core.permissions`
(C-7's catalog, already anticipating this: "FSM/CRM/GST's own permission catalogs get
seeded when those modules' own stories build them"). `core.permissions.key` is a global
primary key, not scoped per module, so 3 keys are prefixed (`crm_opportunities.manage`,
`crm_messages.send`, `crm_settings.manage`) specifically to avoid colliding with fsm's
already-seeded `opportunities.edit`/`messages.manage` and inventory's `settings.manage`
-- the other 6 (`crm.view`, `leads.manage`, `activities.manage`,
`channel_connections.manage`, `reviews.publish`, `analytics.view`) have no existing
collision and stay the plain `<noun>.<verb>` shape every other module's own keys use.
Owner/admin get all 9 (every other module's permission migration grants its own new
keys to owner/admin explicitly -- the base C-7 migration's owner/admin cross-join only
covered permissions that existed at that migration's own time). `sales_manager`
(already one of StockPilot's six operational roles) gets the day-to-day operating
subset -- everything except `channel_connections.manage`/`crm_settings.manage`, which
stay owner/admin-only, the same "configuration vs. operation" split inventory's own
`sales_manager` grant already draws against `settings.manage`.

Enforcement follows fsm's own precedent exactly (app-layer `requirePermission()` calls
in `mutations.ts`, not a DB-level rewrite of RLS policies/triggers the way gst's
`gst.generate` or inventory's approval-trigger checks do -- that's a materially heavier
lift this story's own brief text doesn't ask for, and fsm's comparable permission
stories didn't do it either). Wired into one representative, clearly-scoped mutation per
permission, not exhaustively into every helper across each domain:

| Permission | Wired into |
|---|---|
| `leads.manage` | `promoteProspectToLead()`, `updateLeadStatus()` |
| `crm_opportunities.manage` | `convertLeadToOpportunity()`, `updateOpportunityStage()` |
| `activities.manage` | `createActivity()`, `createFollowUp()` |
| `crm_messages.send` | `sendWhatsAppReply()`, `sendWhatsAppTemplate()` |
| `channel_connections.manage` | `connectWhatsApp()`, `disconnectChannelConnection()`, `createWhatsAppTemplate()`, `deactivateWhatsAppTemplate()` |
| `crm_settings.manage` | `createRoutingRule()`, `setRoutingRuleActive()` (gained a `businessId` param it was missing, so it can check this and scope its own update by tenant explicitly) |
| `crm.view` / `analytics.view` | catalog only, no enforcement point yet -- inventory's own base migration already documented this exact gap for itself ("the actual RLS policy rewrite... to check `has_permission()`... not yet done"), so CRM isn't behind its own most mature peer here |
| `reviews.publish` | catalog only -- no review-publish mutation exists yet (CRM-08.6, P1, not built) |

Deliberately NOT gated: `createLead()` itself -- it's the one primitive both a human
action (`promoteProspectToLead()`, `conversion-actions.ts`) and CRM-07.11's session-less
WhatsApp webhook share, and `has_permission()` needs a real `auth.uid()` the webhook
path has none of. Every other lead/opportunity/activity mutation this session built
(`assignEntity()`, `setLeadNextAction()`, `markInteractionNotActionable()`,
`updateInteractionIntent()`, the rest of `conversion-actions.ts`, ...) is likewise not
individually gated -- a real, working representative set per permission, not an
exhaustive sweep, matching this story's own brief scope.

One pre-existing unit test (`activities/mutations.test.ts`) broke and was fixed as part
of this change: it expected `createActivity()`'s own input-shape validation error before
any DB/session call, but `requirePermission()` (which needs a live request's cookies)
was added ahead of it, throwing a different error first in the vitest environment (no
request scope there). Reordered so the cheap, session-free validation still runs first --
correct regardless of the test, and the right sequencing (arguably right the way this
should have always been done in this whole session across mutations that both validate
and authorize).

Verified with full monorepo typecheck, a clean `next build`, `lint:boundaries`,
module-crm's vitest suite (92/92, including the one existing test whose expectation this
change required re-ordering for), and both CRM RLS test suites (unchanged, re-run clean
-- permission checks are app-layer, not RLS policy changes, so nothing there could
regress from this story). Confirmed the seed data directly against the live dev project
(`select role, permission_key from core.role_permissions where ...`): all 25 expected
role/permission grants present. Migration applied to the dev Supabase project.

## CRM-15.3 (2026-09-11) -- already satisfied for what's built, rest deferred

"External Action Approval Guard": every listed action must require explicit user
action -- send WhatsApp, send social reply, publish Google review reply, create FSM
quote/job, merge parties. Of the five, only **send WhatsApp** exists in this codebase
today; the other four are all later, not-yet-built P1 stories (CRM-08.2-08.4 social
reply, CRM-08.6 review publish, CRM-11.1/11.3 FSM quote/job, CRM-02.5 party merge) --
correctly deferred, not a gap this story needs to close early (CLAUDE.md: "do not
pre-build ahead of scope").

Verified send WhatsApp directly rather than assuming CRM-07.6/07.8's own "human user
explicitly presses Send" acceptance criterion still holds after everything built since:
`grep`'d every caller of `sendWhatsAppReply()`/`sendWhatsAppTemplate()` across the whole
monorepo -- the only two call sites are `conversations/actions.ts`'s
`sendWhatsAppReplyAction`/`sendWhatsAppTemplateAction`, both plain server actions bound
to a `<form>` submit in a client component (`useActionState`), never called from a cron
route, domain-event consumer, or any AI-generated-content path. Also read
`events/handlers.ts` (the one existing CRM domain-event consumer, `prospect.won`) in
full: it only ever inserts an internal `status: 'draft'` note, never sends anything --
confirming this codebase's "human-in-the-loop" discipline (backlog rule #11, CRM-09.6's
own "draft only, no auto-send") already extends to every reactive code path checked, not
just the ones with their own explicit acceptance criteria.

No gap found for the one action that exists; the other four have no code yet to guard.
Documented per this audit's own "already satisfied" pattern rather than silently
skipping. No code change, no new tests (nothing to test beyond the grep-confirmed call
graph above) -- both CRM RLS suites re-run clean as the standard regression check.

## CRM-15.4 (2026-09-11)

"Audit Events": assignment changes, stage changes, sends, external responses, AI draft
generation, external publishing, record merges, connection changes must all be
recorded to `core.audit_log`. Went through the backlog's own 8-item list one at a time
rather than assuming coverage:

| Item | Status |
|---|---|
| Assignment changes | Already audited (CRM-05.4, `crm_lead.assigned`/`crm_opportunity.assigned`/`crm_conversation.assigned`) |
| Stage changes | Already audited (CRM-04.2, `crm_opportunity.stage_changed`) |
| Sends | **Gap -- closed this story** |
| External responses | Covered by construction -- `crm.interaction` itself is the complete immutable record of every inbound message; a parallel audit_log row would duplicate it, not add anything |
| AI draft generation | Deliberately not logged (see below) |
| External publishing | Not built yet (CRM-08.6, P1) -- nothing to instrument |
| Record merges | Not built yet (CRM-02.5, P1) -- nothing to instrument |
| Connection changes | **Gap -- closed this story** |

Closed the two real gaps: `sendWhatsAppReply()` and `sendWhatsAppTemplate()`
(`whatsapp/messaging.ts`) now call `writeAuditLog()` on the success path only (after
`attachOutboundMessageId()`, never on a failed send), action `crm_interaction.sent`,
entityType `crm_interaction`, entityId the created interaction's own id -- `after`
records the conversation, channel, and (for a template send) which template. Fetches
`actorId` via `supabase.auth.getUser()`, same pattern as `updateOpportunityStage()`.
`connectWhatsApp()` and `disconnectChannelConnection()` (`channel-connections/mutations.ts`)
now log `crm_channel_connection.connected`/`crm_channel_connection.disconnected` the same
way -- `connectWhatsApp()`'s upsert gained a `.select("id").single()` it didn't need
before (nothing read the row back), since the audit entry needs a real entityId, not just
a business-scoped side effect. Both new action keys and their entity-type labels added to
`packages/core/src/audit/format.ts`'s `ACTION_LABEL`/`ENTITY_TYPE_LABEL` maps, per that
file's own "a future module's own trigger adds its action here" doc comment.

AI draft generation deliberately NOT logged, and not because it was missed:
`getDraftReplyForInteraction()` (CRM-09.6) runs on every conversation page render, not on
a discrete user-initiated "generate" action -- logging it would flood `audit_log` with an
entry per page view of a passive computation, which is the wrong scope for what
"audit" means everywhere else in this list (a consequential action a human or the system
took, not a read). The backlog's real intent here -- knowing whether a sent reply was
AI-assisted -- doesn't need a second audit-log entry at all: it's better captured as a
signal on the send event itself. Left as a documented gap rather than half-building it,
since threading a "used AI draft" flag from the reply form's "Use this draft" button
through to `sendWhatsAppReply()`'s own audit `after` payload is a small follow-on the
backlog doesn't explicitly ask for as its own line item, and CLAUDE.md rule 7 (no
speculative functionality) argues against adding it speculatively in this story.

No new migration (both audit action keys write against the existing `core.audit_log`
table and `write_audit_log()` RPC from D-10/C-7's own migrations). No new RLS-harness
cases needed -- `writeAuditLog()` is a thin, already-covered wrapper around an existing
RPC, not a new table or policy. Verified with full monorepo typecheck, `lint:boundaries`,
module-crm's vitest suite (92/92, no regressions -- these functions had no existing unit
tests asserting on their return shape that a new async call could break), both CRM RLS
suites (re-run clean, unchanged since this story touches no RLS policy), and a clean
`next build`.

## CRM-15.5 (2026-09-11)

"Integration Failure Handling": required states `connected`, `degraded`,
`reauthorization_required`, `disconnected`, `provider_error`; "user must have a visible
resolution path." The enum already carried all five values
(`crm.channel_connection_status`, `20260911000000_crm_backlog_schema_baseline.sql`, with
a comment explicitly attributing them to this story) and the WhatsApp admin page already
rendered a status badge for each -- what didn't exist was anything that ever *set* a
connection to `degraded`/`reauthorization_required`/`provider_error`, or a way out of one.

**Classifying a failure.** `whatsapp/failure-classification.ts` (new, pure,
unit-tested): `classifyWhatsAppFailure(statusCode)` maps a Graph API HTTP status to the
connection-level implication -- 401/403 -> `reauthorization_required` (the token itself
is dead, only a fresh one fixes it), 429 -> `degraded` (Meta's own rate limit,
self-resolving), 5xx or no status at all (a network failure that never got a response) ->
`provider_error` (Meta's side, not this connection's credentials), any other 4xx (bad
recipient, unknown template) -> `null` -- a single bad phone number never degrades a
perfectly healthy connection. `WhatsAppSendResult`/`WhatsAppProviderAdapter.connect()`/
`healthCheck()` (whatsapp/types.ts) and `postToGraphApi()`/`verifyCredentials()`
(cloud-api-adapter.ts) all gained an optional `statusCode` alongside their existing
error/detail so a caller can classify without re-parsing an error string.

**Applying it.** `channel-connections/mutations.ts#applyChannelConnectionHealthResult()`
(new): given one provider-call outcome, fetches the connection's current status, computes
what it should become (`classifyWhatsAppFailure()` on failure, `connected` on success),
and no-ops if that's null, unchanged, or the connection is `disconnected` (a human's own
explicit choice -- a stray delayed send/health-check for it must never resurrect it).
Wired into both halves of every WhatsApp send: `sendWhatsAppReply()`/
`sendWhatsAppTemplate()` (whatsapp/messaging.ts) call it after every send attempt,
success or failure, so a connection's own send traffic is itself a live health signal
with no extra polling needed for the common case.

**The periodic check + the visible resolution path.** A connection nobody sends through
for a while could sit silently broken with no send failure to surface it, so
`whatsapp/health.ts` adds two more callers: `checkAllWhatsAppConnectionsHealth()` --
CRM-07.1's own `healthCheck()` doc comment already anticipated this exact job -- sweeps
every non-disconnected WhatsApp connection across every business (admin-scoped, no
session to resolve a business from) via a new cron route
(`app/api/cron/check-whatsapp-health`, registered in `vercel.json`, same shared-secret
auth as the other three cron routes). `checkWhatsAppConnectionNow()` is the user-facing
half -- session-scoped, `channel_connections.manage`-gated, called from a new "Check now"
button the WhatsApp admin page now shows for `degraded`/`provider_error` connections
alongside an explanatory `Alert`; a `reauthorization_required` connection instead shows
the connect form again inline ("reconnect with a fresh token") since no amount of
rechecking fixes a dead token. This is the backlog's own "visible resolution path" --
every non-`connected` state now has plain-language text explaining what's happening and
a concrete action to take, not just a badge.

**The audit gap this reopened, and how it's closed correctly.** An automatic health-driven
status flip is a genuine "connection change" per CRM-15.4's own audit list, so
`applyChannelConnectionHealthResult()` writes a `crm_channel_connection.health_changed`
audit entry on every real transition (no-op, so a run of identical failures doesn't
flood the log). The cron path surfaced a real gap while building this: `writeAuditLog()`
(`packages/core/src/audit/mutations.ts`) always opens its own cookie/session-based
`core`-schema client internally -- in a cron request with no logged-in user at all, that
client authenticates as `anon`, which has no execute grant on `core.write_audit_log()`
(`revoke ... from public, anon; grant ... to authenticated;`,
`20260906109000_core_audit_log.sql`) and the call would fail. `service_role` *does* have
that grant (`20260907140000_grant_function_execute_to_service_role.sql`'s blanket
`grant execute on all functions in schema core to service_role`), and separately
`core.audit_log` itself has no client-facing RLS policy at all, only `GRANT ALL ... TO
service_role` (that migration's own comment) -- so the cron path
(`applyChannelConnectionHealthResult()`'s `adminClient` param, set only by
`checkAllWhatsAppConnectionsHealth()`) writes the audit row with a *direct insert* via a
freshly created core-scoped admin client instead of going through `writeAuditLog()`,
which is in fact the more idiomatic path for a service-role caller per that table's own
design intent, not a workaround. `messaging.ts`'s two send functions and
`checkWhatsAppConnectionNow()` all call `applyChannelConnectionHealthResult()` with no
explicit client (real session, `writeAuditLog()` is correct and safe there). This same
latent gap already exists in `module-inventory/events/handlers.ts`'s unconditional
`writeAuditLog()` call from the domain-events drain cron -- left alone here as a
pre-existing, unrelated issue (CLAUDE.md: no unrelated refactors), but worth flagging
since this story's own research is what surfaced it.

New RLS-harness coverage (`scripts/test-crm-backlog-rls.mjs`): reusing CRM-07.2's own
`aliceWhatsAppConnection` row, replicates `applyChannelConnectionHealthResult()`'s exact
logic at the SQL level -- a `provider_error` classification flips a connected connection,
a successful recheck recovers it, a `disconnected` connection is never touched by a later
outcome, and Bob's own business-scoped update against Alice's connection matches zero
rows. Verified with full monorepo typecheck, `lint:boundaries`, module-crm's vitest suite
(98/98, +6 for `classifyWhatsAppFailure()`), both CRM RLS suites (re-run clean, +4 new
assertions), and a clean `next build` (confirms the new cron route compiles).

## CRM-14.2 (2026-09-11)

"Potential Lost Business Dashboard" -- the last P0 story in Section 7's sequence
(seq #46). "This is a primary dashboard, not a hidden report," six metrics verbatim:
unanswered messages, unanswered social questions, unanswered reviews requiring action,
overdue leads, stale opportunities, open high-intent conversations. Deliberately distinct
from CRM-09.2's "Potential Lost Business" queue (a worklist of individual interactions to
act on one at a time, already built) -- this is the aggregate KPI view.

**New route, not a takeover of the existing root.** `/crm` today still serves the
pre-backlog ticket-based Inbox (`crm.tickets`/`crm.channels`) -- the retirement table's
own CRM-06.1 row only retired `crm.tickets`' data role by building `conversation`
alongside it; the old UI route and its "Inbox" nav entry were never actually swapped out,
a leftover from before this session's backlog work. Retiring that route is a bigger,
disruptive UI decision nobody chartered to this story, so rather than reinterpreting
"primary, not hidden" as "replace the module's root page," it's satisfied instead by nav
prominence: a new `/crm/dashboard` route (`packages/module-crm/src/lib/dashboard/`,
`apps/web/.../crm/dashboard/`) with its own "Dashboard" nav entry (icon
`LayoutDashboard`, matching inventory's own dashboard nav convention exactly) placed
*first* under "Overview," above "Inbox" -- hand-synced into both `manifest.ts` and
`module-registry/src/index.ts` as always.

**The six metrics, and what's genuinely new vs. reused:**
- *Unanswered messages* / *open high-intent conversations*: both derived from
  `getOpenCommercialInteractions()` (CRM-01.3/09.2's own query, raised to a 1000-row
  limit here since a dashboard count needs the true total, not one paginated page) --
  "messages" is that same row set minus the three social `channel_type` values
  (Instagram/Facebook Messenger/Google Business Messages), "high-intent conversations" is
  the distinct `conversation_id` count among that set filtered through CRM-09.4's already
  -built `isHighCommercialIntent()`.
- *Unanswered social questions* / *reviews requiring action*: real queries against
  schema CRM-01.2 already anticipated (`channel_type`'s social values; `crm.review_item`
  and its `review_item_status` enum) -- currently always 0 since nothing writes to either
  yet (CRM-08.2/08.3 social inbound, CRM-08.5 Google reviews, all P1, not built). Not
  placeholders or hardcoded zeros: the moment those stories ship, these numbers start
  reporting for real with no change needed here.
- *Overdue leads*: a genuinely new definition, since nothing in the schema has an
  "overdue" concept for a lead directly -- defined as a lead (not `won`/`lost`) with a
  `pending` `follow_up` row whose `due_at` has passed, reusing CRM-05.3's own due-date
  tracking rather than inventing a second one.
- *Stale opportunities*: CRM-04.6 "Stale Opportunity Detection" (the story that would
  define this properly, with per-stage thresholds) is a separate, not-yet-built P1 story
  not even in Section 7's own sequence. Rather than leaving the metric out or half-building
  CRM-04.6 ahead of its own turn, this uses the simplest defensible definition needing no
  new schema: an open opportunity whose `updated_at` (kept current by the generic
  `set_updated_at()` trigger every crm-schema table already has) is more than 14 days
  old. Documented here as a placeholder *definition*, not a placeholder *number* --
  a real, if simple, threshold a founder can act on today, superseded whenever CRM-04.6
  actually ships.

No new migration (every query reads existing tables/columns). No new RLS-harness cases --
every query is a straightforward `eq("business_id", ...)`-scoped read or count against
tables already covered by existing tenant-isolation tests (`review_item`, `follow_up`,
`opportunity`, `lead`, and `getOpenCommercialInteractions()`'s own `interaction` query),
with no new policy or column to verify. Verified with full monorepo typecheck (caught and
fixed a real mistake mid-story: the new `dashboard/queries.ts` file collided with an
existing one from S-5 holding `getOpenTicketsCount()`, used by the top-level
`/dashboard` widget grid and `contract/index.ts` -- restored it alongside the new
`getPotentialLostBusinessDashboard()` rather than losing it), `lint:boundaries`,
module-crm's vitest suite (98/98, unchanged -- a pure aggregation query with no new pure
logic to unit-test beyond what CRM-09.4's `isHighCommercialIntent()` already covers),
both CRM RLS suites (re-run clean, unchanged), and a clean `next build` (confirms the new
route compiles).

**Epic CRM-14 status**: 1 of 6 in-scope stories done (this one, the only P0 story in the
epic). The remaining five (14.1, 14.3-14.6) are P1, next in Section 7's sequence.

**All P0 stories are now complete** (46 of 46, seq #1-46). The P1 run begins next at
seq #47 (CRM-08.2, Facebook Messenger Inbound).

## CRM-08.2 + CRM-08.3 (2026-09-11)

"Facebook Messenger Inbound" / "Instagram Messaging Inbound" -- both combined here for
the same reason `api/webhooks/crm-meta/route.ts`'s own doc comment already gives:
Instagram DM and Facebook Page Messenger are reached through the identical Meta Graph API
webhook shape, one route with two `provider` values, not two separate builds. Acceptance
criteria (both stories, effectively identical): receive eligible page conversations, map
to `interaction` + `conversation`, reuse party matching, add `requires_response` as
needed.

**CRM-08.1 ("Social Provider Abstraction") is not in Section 7's own sequence** -- it
defines a `connect/receiveEvent/listInteractions/sendReply/getThread` interface, the
social analog of CRM-07.1's `WhatsAppProviderAdapter`, but Section 7 jumps straight from
seq #46 to seq #47 (CRM-08.2), skipping it. No full adapter interface was built here
either, matching the sequence's own omission -- this story's actual acceptance criteria
(receive + map, nothing about `sendReply`/`getThread`) don't need one yet, and building
the full CRM-08.1 interface ahead of any story that actually calls its other four methods
would be exactly the "speculative functionality" CLAUDE.md rule 7 rules out.

**The real design decision: which table resolves the webhook's tenant.** `crm-meta`'s
existing webhook (built for the pre-backlog ticket model) already resolves "which
business owns this Page/Instagram account" via `crm.channel_accounts` -- a real, working,
already-connected-in-practice table with its own admin UI (`/crm/channels`, still live,
unretired). No story in the required sequence charters a *new* `channel_connection`-based
connect flow for Instagram/Facebook (unlike WhatsApp, where CRM-07.2 explicitly did
exactly that) -- CRM-08.2/08.3's own acceptance criteria only ask for the inbound
*mapping*, not a new connection mechanism. Per the retirement table's own discipline
("each old piece is retired by the specific story chartered to rebuild its function"),
`crm.channel_accounts`'s connection-resolution role for these two providers is therefore
*not* retired by this story -- only its *ingest destination* changes.

**What actually changed**: a new `lib/social/ingest-inbound-message.ts#ingestInboundSocialMessage()`
replaces `lib/tickets/ingest-inbound-message.ts#ingestInboundCrmMessage()` as
`api/webhooks/crm-meta/route.ts`'s POST handler's ingest call -- signature verification,
the GET subscription handshake, and the payload parsing are all reused as-is. The new
function: looks up the connection via the existing (unretired)
`getConnectedChannelAccountByExternalId()`, then calls `recordInteraction()` with
`channel: "instagram" | "facebook_messenger"` -- which by itself satisfies all three
remaining acceptance criteria for free, since `recordInteraction()` already does CRM-06.4
party matching (falls through to the party-less "unresolved sender" path here, same as an
unmatched WhatsApp sender, since neither social provider has a phone/email to match on)
and CRM-09.1's `requires_response` rules engine (correctly evaluates to `false` for both
providers today -- neither is in `SUPPORTED_RESPONSE_CHANNELS` yet, since no send-reply
story for either exists in the required sequence; that list's own doc comment already
names "CRM-08.x social" as a future extension point).

**Deliberately dropped, not carried forward**: the old ingest function's
`instant_reply_mode` auto-reply (`instant_ack_then_human`, `draft_approve`) and its
auto-routing-rule assignment on ticket creation. Neither is asked for by CRM-08.2/08.3's
own acceptance criteria, and an unconditional automatic reply on first contact runs
against the platform's post-CRM-09 human-in-the-loop direction (CRM-09.6's own "draft
only, no auto-send"; backlog rule #11) rather than merely being an unbuilt nice-to-have.
Auto-routing-on-ingest is the same already-accepted gap CRM-07.3/07.4 left open for
WhatsApp (CRM-06.3's "Conversation Assignment" is manual/audited, not rule-based-on-
ingest) -- not a new omission specific to social.

`lib/tickets/ingest-inbound-message.ts#ingestInboundCrmMessage()` itself is now fully
unused (WhatsApp's own call site was already removed by CRM-07.3; this was its last real
caller) -- left in place rather than deleted, per this whole session's "retire by
building the replacement, not by deleting the old piece" discipline; an explicit decision
to actually remove it is a separate, smaller cleanup someone can make later.

No new migration (channel already accepts `instagram`/`facebook_messenger` as
`crm.interaction.channel` values, CRM-01.2's own baseline). No new RLS-harness cases --
`recordInteraction()`'s party-matching/conversation-creation logic for these exact two
channel values is already proven by CRM-01.5's own coverage ("an email interaction and an
Instagram interaction both fit the one crm.interaction table"), and
`getConnectedChannelAccountByExternalId()` is unchanged, already-relied-upon code, not
new logic this story introduces. Verified with full monorepo typecheck, `lint:boundaries`,
module-crm's vitest suite (98/98, unchanged), both CRM RLS suites (re-run clean,
unchanged), and a clean `next build`.

**Epic CRM-08 status**: 2 of 6 in-scope stories done. Next: CRM-08.4 (Instagram Comment /
Private Reply Recovery, seq #49).

## CRM-08.4 (2026-09-11)

"Instagram Comment / Private Reply Recovery." Goal: detect comments that indicate buying
intent and create a response opportunity. Acceptance criteria: a relevant comment can
become an interaction; CRM identifies the comment as reply-needed; the UI indicates
channel/provider limitations before sending.

**Comment ingest, new webhook field.** Instagram comments arrive under
`entry[].changes[]` with `field: "comments"` -- an entirely different shape from the DM
`entry[].messaging[]` array CRM-08.2/08.3 already parse. `crm-meta/route.ts` now handles
both in the same POST handler (comments gated to `payload.object === "instagram"` only --
Facebook Page feed comments are a separate, not-asked-for capability). A new
`lib/social/ingest-inbound-message.ts#ingestInboundInstagramComment()` maps a comment onto
the same `interaction`/`conversation` model as a DM, `interaction_type: "comment"` the
only thing distinguishing it (no parallel comments table -- CRM-01.5's own
provider-neutral principle), storing the Instagram media id in `metadata`. Reuses
`getConnectedChannelAccountByExternalId("instagram", ...)` for tenant resolution, same
as the DM path.

**"Identifies as reply-needed" without a fake promise to send.** CRM-09.3's intent
classifier already runs on every inbound interaction regardless of channel (unlike
`requires_response`, which stays gated to `SUPPORTED_RESPONSE_CHANNELS` -- still
`["whatsapp"]` only, since no send-reply story for Instagram exists in the required
sequence). So a high-commercial-intent comment is surfaced by a new, separate UI signal
on the Conversations page (`interaction.interaction_type === "comment" &&
isHighCommercialIntent(interaction.intent)`) rather than by adding Instagram to
`SUPPORTED_RESPONSE_CHANNELS`, which would have implied a working send path that doesn't
exist. That signal renders a "High intent -- response opportunity" badge plus the same
one-click Create Lead/Opportunity/Task buttons CRM-09.5 already built (new bound actions
in `conversations/actions.ts`, calling the same `conversion-actions.ts` mutations the
Lost Business Queue uses) -- satisfying "create a response opportunity" without a second
parallel conversion mechanism.

**"UI indicates limitations before sending."** The Conversations page's reply-composer
slot (previously `null` for every non-WhatsApp channel) now shows an `Alert` for an
Instagram conversation explaining replies aren't sendable from here yet and naming Meta's
own real restriction (private replies to comments are time-boxed and comment-eligibility-
gated).

No new migration (`interaction_type` is free text, no enum to extend). No new
RLS-harness cases, same reasoning as CRM-08.2/08.3 (the underlying `recordInteraction()`
path for this exact channel is already proven; `getConnectedChannelAccountByExternalId()`
is unchanged). Verified with full monorepo typecheck, `lint:boundaries`, module-crm's
vitest suite (98/98, unchanged), both CRM RLS suites (re-run clean, unchanged).
**`next build` was not re-run for this specific commit** (session ended before it could
run) -- typecheck passing across every workspace is strong evidence it would succeed, but
this should be the first thing verified before merging further work.

**Epic CRM-08 status**: 3 of 6 in-scope stories done. Next: CRM-08.5 (Google Business
Profile Review Inbox, seq #50).

## CRM-08.5 (2026-09-11)

"Google Business Profile Review Inbox." Goal: bring reviews into the same recovery
queue. Acceptance criteria: reviews can be listed for connected locations; a review
includes rating, comment, reviewer, create time, and reply state when available; a
review appears in the customer/reputation queue.

**New channel, not a new provider.** `crm.channel_connection.provider` is already free
text specifically so a new *provider* never needs a migration (CRM-01.2's own doc
comment, citing CRM-16.3) -- but Google Business Profile Reviews is a genuinely
different *channel* from `google_business_messages`: a different Google API (the legacy
Google My Business API v4's `accounts.locations.reviews` resource, cited by the backlog
itself as "[11]"), a different OAuth scope, and a different connection identity (a
location, not a phone number or a page). Reusing `google_business_messages` for a
connection that has nothing to do with messaging would have been the wrong kind of
reuse -- confusing, not simplifying. New migration
(`20260911001000_crm_review_channel_google_business_profile.sql`) adds
`'google_business_profile'` to `crm.channel_type` via `alter type ... add value if not
exists`, the same kind of "add a value when a real new surface needs one" extension
`20260906111000_inventory_procedural_layer.sql` already established for
`inventory.movement_type`. `crm.review_item` itself needed no schema change --
CRM-01.2 already anticipated this exact story ("content_retention_expires_at exists from
the start"), and its `unique (business_id, provider, external_review_id)` constraint is
already the right idempotency key for a re-sync.

**New `lib/reviews/` domain folder.** `google-business-profile-adapter.ts` follows the
same split `whatsapp/cloud-api-adapter.ts` established: a pure mapping function
(`normalizeGoogleBusinessProfileReview()`, unit-tested against real API response shapes
without a network mock) separated from the actual `fetch()`-calling functions
(`verifyGoogleBusinessProfileLocation()`, `listAllGoogleBusinessProfileReviews()`, the
latter following `nextPageToken` up to a fixed 5-page/250-review cap). `mutations.ts`
adds `connectGoogleBusinessProfileLocation()` (verifies the account id + location id +
token against a real `reviews.list` call before ever storing anything, same
"verify before persisting" discipline `connectWhatsApp()` established -- there is no
separate "get location" read this story's acceptance criteria need, so the connect check
reuses the same real read path the sync does) and `syncGoogleBusinessProfileReviews()`
(pulls every review for one connection and upserts `crm.review_item`). `queries.ts` adds
`listReviewItems()`.

**Reply state without ever downgrading a human's own triage.** `crm.review_item.status`
(CRM-01.2's own `review_item_status` enum: `new`/`in_progress`/`responded`/`dismissed`)
doubles as the "reply state" the acceptance criteria ask for -- `new` means unreplied,
`responded` means the location has replied on the provider's side. `syncGoogleBusiness
ProfileReviews()` only ever *sets* this on first sight (`responded` if the provider
already shows a reply, `new` otherwise) or bumps a still-`new` row to `responded` once a
reply appears later -- it never touches a row a human has already moved to
`in_progress`/`dismissed`, the same "a system-detected signal never overrides a human's
own explicit action" rule `applyChannelConnectionHealthResult()` already applies to
connection status. No party matching is attempted (a review carries no phone/email to
match on, unlike a WhatsApp/social sender) -- `party_id` stays honestly null, same
discipline `ingestInboundSocialMessage()` already established for an unmatched sender.

**UI: new `/crm/reviews` page**, gated the same way `/crm/whatsapp` is
(`channel_connections.manage` for connect/disconnect/sync; the page itself just needs the
`crm` license). Shows every connected location with a manual "Sync now" button (no cron
-- this story's acceptance criteria only ask for listing, not automatic polling; a
sync-on-demand button is the honest minimum, not a speculative background job) plus the
review list itself as its own reputation queue: rating (star icons), reviewer, comment,
posted date, and a reply-state badge, mobile compact cards + desktop table per
docs/design/claude-ui-design-rules.md rule 5. New "Reviews" nav entry in both
`module-crm/src/manifest.ts` and `module-registry/src/index.ts` (hand-kept in sync, same
as every other nav change), plus a `Star` icon added to `ModuleIcon`'s lookup map since
nav item icons resolve through it. `docs/design/crm-backlog-audit.md`'s own earlier
CRM-14.2 section already anticipated this: the dashboard's `unansweredReviewsRequiring
Action` KPI and the Lost Business page's review count "start reporting for real the
moment this story ships" -- confirmed true, since both already query `review_item` by
`business_id`/`status` with no code change needed.

**New RLS-harness coverage** (`test-crm-backlog-rls.mjs`): this is the first story to
actually exercise `review_item`'s write path beyond CRM-01.2's own sanity/uniqueness
checks, so added a same-tenant read-isolation assertion ("Bob sees none of Alice's
review_item rows") and a cross-tenant reference-smuggling assertion ("Bob cannot create a
review_item against Alice's channel_connection") exercising the pre-existing
`enforce_review_item_refs` trigger, which had no test of its own until now.

Verified with full monorepo typecheck (clean across every workspace), `lint:boundaries`
(907 files, no violations), `lint:migrations` (72 migrations, no violations),
module-crm's vitest suite (101/101 -- 3 new mapping tests), both CRM RLS suites (re-run
clean, including the 2 new review_item cases above), and a clean `next build` (32 routes,
`/crm/reviews` present). Migration applied live to the dev Supabase project
(`jazdtomcgqjxjueedmck`) via `apply_migration`; `get_advisors(security)` re-run
afterward shows the same 6 pre-existing findings as before this change (5 RLS-enabled-
no-policy tables unrelated to CRM, 1 leaked-password-protection warning) -- no new
finding introduced.

**Epic CRM-08 status**: 4 of 6 in-scope stories done. Next: CRM-08.6 (Review Response
Drafting, seq #51, P1) -- "AI drafts response, human approval required before
publishing, user sees the action is external and requires authorization" is a separate
acceptance criterion from this story's own listing/ingest scope (`reviews.publish` is
already seeded in the permission catalog for the eventual publish step). Note for that
story: module-crm has no sanctioned cross-module AI provider contract today -- its
existing "AI" features (intent classification, etc.) are deterministic keyword/template
heuristics, not real LLM calls -- so CRM-08.6 needs an explicit decision on what "AI
drafts response" means here before implementation, not an assumption that a real model
call is already wired up.

## CRM-08.6 (2026-09-11)

"Review Response Drafting." Acceptance criteria: AI drafts a response; human approval
required before publishing; the user sees that the action is external and requires
authorization. Scoping decision (put to the user given the prior entry's own flagged
gap): a real LLM call, not a deterministic template -- confirmed by the user rather than
assumed.

**A new, reusable `business_id`-scoped AI path in `core`, not a one-off in module-crm.**
`core.ai_runs`/`core.ai_provider_credentials` (S-4, `20260908140000_core_ai_usage.sql`)
already existed as forward-only infrastructure "any future non-discovery module that
calls an LLM" could use -- confirmed unused by any real caller before this story (grep
across every module; the two `module-gst` doc-comment hits that reference
"ai_provider_credentials" are citations of the encryption pattern for unrelated GSP
credentials, not actual callers). What was missing was the router: discovery's own
`resolveAiModelForAccount()` (`module-discovery/lib/ai/router.ts`) is workspace/account-
scoped and, per CLAUDE.md's architecture rule 3, unreachable from any other module
anyway. New `packages/core/src/ai/business-router.ts` is the `business_id`-scoped
counterpart -- `resolveBusinessAiModel(businessId, operation, client?)`, same BYOK-then-
platform-fallback shape (`core.ai_provider_credentials` first, `PLATFORM_AI_API_KEY`
env var second, confirmed already configured in this deployment), same
`AiProviderError`/`toAiProviderError` classification. Deliberately a near-duplicate of
discovery's router rather than a forced shared refactor -- discovery's own router is
working, tested code this story has no reason to touch (CLAUDE.md principle 10). New
`draft_review_response` operation added to the *already-shared* `packages/core/src/ai/
operation-registry.ts` (that registry, unlike the router, was core-owned from the
start) at the `balanced` tier, same tier `generate_outreach_message` uses for a
comparably bounded writing task. `core/ai/model-registry.ts`, `provider-factory.ts`,
`client.ts` (cost estimation), and `hash.ts` needed no change at all -- already fully
provider/module-agnostic.

**Caching without a second `ai_runs` lookup.** New migration
(`20260911001100_crm_review_item_draft_reply.sql`) adds `draft_reply`/
`draft_input_hash`/`draft_generated_at` directly to `crm.review_item` -- a re-open of a
review with nothing changed reuses the stored draft instead of re-billing the provider
(CLAUDE.md principle 5), the same "don't re-run the most expensive operation for
unchanged input" reasoning `research-prospect.ts#hasRecentSuccess` established, just
simpler here since the hash lives on the entity itself rather than needing a separate
`ai_runs` cache-index query. `core.ai_runs` itself still gets a row per real call either
way (usage/cost ledger, not the cache).

**`lib/reviews/mutations.ts#draftReviewResponse()`**: builds a plain templated prompt
(rating/comment/reviewer/business name; explicitly instructed not to promise
compensation/resolution for a low rating, not to invent facts), calls
`resolveBusinessAiModel(businessId, "draft_review_response")`, `generateObject` against
a one-field Zod schema, writes only `draft_reply`/`draft_input_hash`/
`draft_generated_at` -- never calls Google, never touches anything a human hasn't
approved. Bumps `status` from `new` to `in_progress` on first draft (never overwrites an
already `in_progress`/`dismissed`/`responded` row's status), same "system-detected
signal never overrides a human's own explicit state" rule CRM-08.5's sync already
established for this table. Gated by `reviews.publish` (drafting is preparatory to
publishing, so one permission covers the whole flow rather than adding a second key for
"can draft but not send").

**`publishReviewResponse()`** is the actual authorized, external, human-approved step:
takes the reply text as a parameter rather than silently re-reading `draft_reply`, so an
edit made in the UI is what actually reaches Google -- "human approval" means the human
can rewrite, not just click a button next to text they didn't write. Calls the new
`google-business-profile-adapter.ts#publishGoogleBusinessProfileReviewReply()` (`PUT
.../reviews/{reviewId}/reply`, the My Business API v4's real reply endpoint, which both
creates and overwrites a reply with the same call). On success, sets `status:
'responded'` and writes an audit-log entry (`crm_review_item.response_published`) --
the one action in this module that posts content to a real external service on the
business's behalf, so unlike the passive review sync it's worth an explicit audit trail.

**UI**: `reviews-list.tsx` (new client component, replacing the plain read-only rows
CRM-08.5 built) adds a "Respond" button per review (hidden once `responded`), opening a
dialog with an editable `Textarea` pre-filled from any existing draft, a "Generate AI
draft" / "Regenerate" button (calls `draftReviewResponse` outside the form-submission
cycle, since it never publishes anything), a plain-language `Alert` stating that
publishing posts directly to Google using the business's own connected authorization
(this story's third acceptance criterion, made literal rather than left as a tooltip),
and an "Approve & publish" submit button. Gated behind `hasPermission(businessId,
"reviews.publish")`, computed once in the server component and passed down as
`canRespond` rather than re-checked per row.

Verified with full monorepo typecheck (clean across every workspace), `lint:boundaries`
(909 files, no violations), `lint:migrations` (73 migrations, no violations), core's own
vitest suite (34/34 -- covers the extended operation registry) and module-crm's (101/101,
unchanged -- no new unit tests added for the plain prompt-string builder itself, judged
proportionate given its low complexity), both CRM RLS suites (re-run clean; no new RLS
case needed since the new columns carry no new access path beyond `review_item`'s
existing policy), and a clean `next build` (`/crm/reviews` present, unchanged route
count). Both migrations applied live to the dev Supabase project (`jazdtomcgqjxjueedmck`)
via `apply_migration`; `get_advisors(security)` re-run afterward shows the same 6
pre-existing findings as before this change -- no new finding introduced. Confirmed
`PLATFORM_AI_API_KEY` is a documented, already-used env var in this deployment
(`apps/web/.env.example`), so the platform-fallback path works for a business with no
BYOK credential connected, same default-UX discovery already gives founders.

**Epic CRM-08 status**: 5 of 6 in-scope stories done. Next: CRM-08.7 (Review Recovery
Task, seq #52, P1) -- rule-based: a 1-3 star review becomes a recovery task, an
unresolved negative review escalates, a 4-5 star review becomes an advocacy/follow-up
opportunity where appropriate, with no automatic promise of compensation or resolution.

## CRM-08.7 (2026-09-11)

"Review Recovery Task." Rules: 1-3 star review -> recovery task; unresolved negative
review -> escalation; 4-5 star review -> advocacy/review-follow-up opportunity where
appropriate; no automatic promise of compensation or resolution.

**`crm.follow_up`, not `crm.activity`, is what a review attaches to.** A review almost
never carries a `party_id` (CRM-08.5's own design -- no phone/email to match a reviewer
on), so `crm.activity`'s "attached to something" check (party/lead/opportunity/
conversation) can essentially never be satisfied by a review-triggered task. `crm.
follow_up` has no such constraint, so new migration
(`20260911001200_crm_follow_up_review_item.sql`) adds a nullable `review_item_id`
column there instead of forcing a fake attachment just to satisfy a check that was never
meant to cover this case. New partial unique index `(business_id, review_item_id) where
review_item_id is not null` makes rule application idempotent (a re-sync of an
already-handled review is a no-op); a separate plain index on `review_item_id` itself
covers the FK lookup the unique index's own leading column (`business_id`) doesn't
(caught by `get_advisors(performance)` immediately after the first version of this
migration -- fixed in the same story rather than left for a later cleanup pass, same
"29 unindexed FK columns" precedent this repo already established). Extended the
existing `crm.enforce_follow_up_refs()` trigger function (`create or replace`, not a
second trigger) with the new `crm.enforce_review_item_business_id()` check, same
cross-tenant-smuggling-prevention pattern every other `crm.follow_up` reference already
has.

**`lib/reviews/recovery-rules.ts#applyReviewRecoveryRules()`**, called from
`syncGoogleBusinessProfileReviews()` for every review a sync returns (idempotent, so
running it on already-handled reviews every sync is a correct no-op, not a bug to guard
against separately): rating 1-2 creates a `follow_up` at `high` priority due in 2 days,
rating 3 at `normal` priority (escalation, below, is what promotes it from there); rating
4-5 creates a `follow_up` at `normal` priority due in 7 days -- the literal
"review-follow-up" half of the rule's own name, always created. The "opportunity" half
only fires "where appropriate": appropriateness being the one actually-checkable
condition, whether `review_item.party_id` is set at all (a real party to open a sales
opportunity *for* -- `crm.opportunity.party_id` is `not null`). When it is, reuses
`createLead()` (`source: 'google'`, `sourceModule: 'review_item'`) +
`convertLeadToOpportunity()` verbatim -- the same lead-then-opportunity path
`conversion-actions.ts#convertInteractionToOpportunity()` already established, not a
parallel direct-insert. Without a party, the rule correctly stays at "just the
follow-up task," the same "honest gap until its own data exists" discipline CRM-09.2's
"related product" column and CRM-08.5's own `party_id` already established -- not a
shortcut invented for this story. "No automatic promise of compensation or resolution"
holds by construction: `crm.follow_up` has no note/body column at all, so there is no
channel for one to leak through even by accident.

**`escalateOverdueNegativeReviewFollowUps()`** is the third rule, "unresolved negative
review -> escalation": an admin-scoped cross-tenant sweep (same shape
`whatsapp/health.ts#checkAllWhatsAppConnectionsHealth()` already established) that finds
`pending`, still-`normal`-priority follow-ups attached to a rating-1-3 review whose
`due_at` has passed and whose review is still not `responded`/`dismissed`, and bumps
them to `high` -- this priority scale's own ceiling (`low`/`normal`/`high`, no fourth
tier invented for this). Never touches a review already at `high` (a 1-2 star review
starts there already) or one a human has already resolved. New cron route
`api/cron/escalate-review-recovery-tasks`, same shared-secret auth as every other cron
route.

**Follow-ups queue UI gap, closed in the same story.** A follow-up attached only via
`review_item_id` (the common case -- no party) would otherwise render as an unexplained
"Unknown contact" in the existing Follow-ups queue, since that page's own party/source/
channel resolution has nothing to fall back to. `listFollowUpQueue()` now also resolves
a `reviewSummary` string (rating as stars, reviewer, comment excerpt) for any row with a
`review_item_id`; the Follow-ups page renders `partyName ?? reviewSummary ?? "Unknown
contact"` instead of just the first two. Judged in-scope rather than a separate story:
without it, this story's own output would be practically invisible in the one screen
that's supposed to show it.

Verified with full monorepo typecheck (clean across every workspace, after fixing one
existing test fixture -- `follow-ups/queue.test.ts` -- to include the two new
`FollowUpQueueRow` fields), `lint:boundaries` (911 files, no violations), `lint:
migrations` (74 migrations, no violations), module-crm's vitest suite (101/101,
unchanged), both CRM RLS suites (re-run clean, including three new CRM-08.7 cases: a
review-only follow-up attachment, the duplicate-`review_item_id` rejection, and Bob
cannot create a follow-up against Alice's review_item), and a clean `next build`
(`/api/cron/escalate-review-recovery-tasks` present). Both migrations applied live to
the dev Supabase project (`jazdtomcgqjxjueedmck`); `get_advisors(security)` shows the
same 6 pre-existing findings as before (no new one); `get_advisors(performance)`
confirmed the missing-index gap was real and is now fixed (only pre-existing
"unused index" INFO findings remain, expected for a freshly-created index with no
production query volume yet).

**Epic CRM-08 status**: 6 of 6 in-scope stories done -- **epic complete.**

## CRM-09.7 (2026-09-11)

"Response Quality Check." Before send, optionally flag: unanswered question in draft;
unsupported product claim; missing price/availability fact; overly long response;
risky/uncertain statement; wrong customer/context. No autonomous send.

**Scope note.** Not put to the user as a fresh architectural question: CRM-08.6
(immediately prior in this same session) already settled "real LLM call, not a
deterministic template" for this epic's family of AI features, and this story's five
semantic checks are squarely the same kind of judgment task -- re-asking so soon after
an explicit answer would have been re-litigating a decision already made, not genuine
new ambiguity. Continued autonomously per the standing instructions.

**"Optionally flag" and "no autonomous send" both hold by construction.** New
`lib/conversations/response-quality.ts#checkResponseQuality()` only ever *returns*
flags; it never blocks, edits, or sends anything. Wired into the existing WhatsApp
reply composer (`reply-form.tsx`, CRM-07.6) as a new "Check before sending" button that
runs outside the form's own submission cycle (same pattern CRM-08.6's "Generate AI
draft" button already established) -- flags render as a dismissible warning list above
the still-always-clickable "Send" button, never disabling or gating it. Editing the
draft after a check clears the shown flags (state going stale silently would be worse
than no check at all).

**One deterministic check, five real LLM ones -- not six of either.** `overly_long` is
a plain character-count threshold (`checkOverlyLong()`, unit-tested, no model call --
CLAUDE.md principle 4: "do not use an LLM for deterministic operations"). The other
five (unanswered question, unsupported claim, missing price/availability, risky/
uncertain, wrong customer/context) are genuine semantic judgment calls, checked via
`resolveBusinessAiModel(businessId, "check_response_quality")` -- the same
`business_id`-scoped real-LLM path CRM-08.6 built, now serving its second caller. New
`check_response_quality` operation added to the shared `core/ai/operation-registry.ts`
at the `balanced` tier (a message about to reach a real customer is worth more than
`classify_reply`'s `fast` tier for a comparable-shaped single-label task).

**Grounding stays deliberately light.** Customer name and product-interest names come
from `getCustomer360()` (CRM-02.1's already-built aggregation, reused rather than
re-fetched piecemeal) -- no live inventory stock/price lookup: that would mean a
cross-module call into a possibly-unlicensed module (ADR-10) for a check whose own
acceptance criteria only ask whether the draft *addresses* price/availability at all,
not whether a quoted figure is factually correct against live stock. `missingPrice
OrAvailability` is worded accordingly ("didn't mention either, even approximately"),
not as a fact-verification claim.

No new migration, no new permission (gated by the same `crm_messages.send` the send
action itself already requires -- checking a reply a person can't send anyway has no
purpose). Verified with full monorepo typecheck (clean across every workspace),
`lint:boundaries` (913 files, no violations), `lint:migrations` (74 migrations,
unchanged, no violations), core's vitest suite (34/34, unchanged) and module-crm's
(105/105 -- 4 new tests for `checkOverlyLong()` and `responseQualityPrompt()`), both CRM
RLS suites (re-run clean, unchanged -- no new schema to cover), and a clean `next build`
(unchanged route count). `get_advisors(security)` re-confirmed the same 6 pre-existing
findings, as expected for a story with no schema change.

**Status**: 58 of 74 in-scope stories done. Next: CRM-09.8 (Escalation Rules, seq #54,
P1) -- a configurable timed sequence (new inquiry -> 15m reminder -> 1h owner escalation
-> 4h manager escalation).
