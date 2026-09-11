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
