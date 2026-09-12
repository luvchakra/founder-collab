# Test cases: `crm`

Covers `packages/module-crm/src/**`.

**⚠ Architectural supersession (2026-09-12):** TC-CRM-001..011 below document the
original ticket/channel model (`docs/design/crm-module-design.md` Part A/B, S-1). Since
2026-09-11 that model was superseded by the WonderArc CRM backlog's full lead/
opportunity/conversation/interaction model (`docs/design/crm-backlog-audit.md`, 74
stories, all P0+P1 done) plus 29 cross-module integration stories
(`docs/design/integration-backlog-audit.md`). The old ticket-creation ingestion path
(`ingestInboundCrmMessage`) is **now dead code** — WhatsApp moved off it in CRM-07.3,
Instagram/Messenger in CRM-08.2 — so TC-CRM-001/002/003/007/008/011 describe a flow
nothing live actually reaches any more. Kept below (not deleted) as a historical record
per `TESTING_STRATEGY.md`'s "update, don't just delete" policy, each flagged inline; the
current model starts at TC-CRM-012.

**Current real scope:** `lead`/`opportunity`/`conversation`/`interaction`/`activity`/
`follow_up`/`product_interest`/`assignment`/`channel_connection`/`review_item`/
`whatsapp_template`/`opportunity_contact`/`escalation_config`/`customer_summary`/
`conversation_summary`/`buying_intent_score`/`click_to_chat_link` (19 tables, all
`tenant AND licensed` RLS), a 14-entry `CrmEventType` domain-event vocabulary, WhatsApp/
Instagram/Facebook/Google-Business-Profile channel integrations, a deterministic
`requires_response` rules engine + Lost Business queue, AI-assisted (never
auto-sending) drafts/summaries/quality-checks, a 9-permission RBAC model
(`crm_settings.manage`, `channel_connections.manage`, `reviews.publish`, etc.), and
cross-module contracts into Inventory (fulfillment/availability), FSM (assessments/
quotes/jobs), and Discovery (relationship detection on handoff).

### TC-CRM-001: Routing rules route for real on known-sender and business-hours conditions; AI-intent is schema-only
**Feature:** Part B, B3 (`docs/design/crm-module-design.md`) — extends the S-1 skeleton.
**Priority:** P1 · **Story:** B3
**⚠ Superseded (2026-09-12):** the ticket-creation path this case's own steps exercise
(`ingestInboundCrmMessage`) is now unreachable — no live channel creates tickets any
more. `crm.routing_rules`/`evaluate.ts` themselves still exist and are still correct as
described; only the "this fires on a real inbound message" premise is stale.
**Update (this pass):** this case previously described `crm` as having no routing
engine at all. It now does, but only for the two conditions
`lib/routing-rules/evaluate.ts` actually evaluates against a real inbound message —
channel, `condition_known_sender` (`any`/`known`/`new`), and `business_hours_start`/
`business_hours_end` (with correct midnight-wraparound handling). "Known sender" means
"crm has resolved this exact handle to a `core.parties` row before" (via phone match or
a prior ticket), not literally "has an active fsm job or inventory order" as the design
doc's prose puts it — checking those directly would mean `module-crm` importing
`module-fsm`/`module-inventory` internals, which only `apps/web`'s composition root may
do (CLAUDE.md rule #3). `detected_intent_filter` exists as a column with **no**
evaluator — populating it needs an AI classification call this module can't make yet
(BYOK credentials are `discovery`-schema-owned with no contract exposing them); a rule
with it set is simply never matched, not silently mismatched.
**Steps:**
1. Create a routing rule scoped to a channel, `condition_known_sender: 'new'`, and an
   assigned employee.
2. POST a first-ever message from a brand-new WhatsApp number through
   `ingestInboundCrmMessage` against that channel's connected account.
3. Repeat with `condition_known_sender: 'known'` and a sender whose phone number
   already matches an existing `core.parties` row.
4. Create a rule with `business_hours_start`/`end` set, and call
   `findMatchingRule`/`ruleMatches` (`lib/routing-rules/evaluate.test.ts`) with a `now`
   inside and outside the window, including one window that wraps past midnight.
**Expected result:** Step 2's new ticket comes back `assigned_to` the rule's
`assign_to_employee_id`; step 3 matches only when a `known` rule exists. The
business-hours cases match/reject exactly at the boundary, and the overnight window
matches both sides of midnight correctly.
**Automated coverage:** `packages/module-crm/src/lib/routing-rules/evaluate.test.ts`
(18 cases, pure logic, no DB) for the matching algorithm itself;
`scripts/test-crm-rls.mjs` for the underlying rule storage/RLS. No end-to-end test
drives an actual webhook payload through `ingestInboundCrmMessage` yet (it needs a live
`channel_accounts` row and a running Postgres with the admin client wired up) — a real
gap, not one this pass closed.

### TC-CRM-002: Multiple channels feed into one ticket queue without cross-talk
**Feature:** S-1's channel model.
**Priority:** P1 · **Story:** S-1
**⚠ Superseded (2026-09-12):** no active ingestion writes to `crm.tickets` any more —
see TC-CRM-001's own note. The Conversations inbox (TC-CRM-016) is the current
equivalent.
**Steps:**
1. Create tickets from two different channels for the same business.
**Expected result:** Both appear in the business's ticket queue, correctly tagged
with their originating channel; no channel-specific data leaks into the other's ticket view.
**Automated coverage:** `scripts/test-crm-rls.mjs` (tenant-isolation section) — creates
Alice's and Bob's tickets against their own separate channels and confirms neither
business's query surfaces the other's rows.

### TC-CRM-003: Inbound webhook messages now round-trip through the shared `core.threads/messages` layer
**Feature:** Part A, A2 (`docs/design/crm-module-design.md`).
**Priority:** P0 · **Story:** A2 (was P2 before this pass, promoted per this case's
own earlier note: "re-test... and promote this case's priority back to P0" once the
real ingestion story landed)
**Update (this pass):** `lib/tickets/ingest-inbound-message.ts#ingestInboundCrmMessage`
now creates/appends `core.threads` (`entity_type: 'crm_ticket'`) and `core.messages`
rows exactly the way F-11's job-scoped threads already do — the same shared store, not
a parallel CRM-only messages table, per this case's own original expectation.
**⚠ Superseded again (2026-09-12):** this path itself has since been replaced by
`ingestInboundWhatsAppMessage()` (CRM-07.3) and `ingestInboundSocialMessage()`/
`ingestInboundInstagramComment()` (CRM-08.2/08.3/08.4), which write to
`crm.interaction`/`crm.conversation`, **not** `core.threads`/`core.messages`. See
TC-CRM-020.
**Steps:**
1. POST a first inbound message for a new external sender through
   `ingestInboundCrmMessage` (WhatsApp, Instagram, Facebook Messenger, or Google
   Business Messages shape via `/api/webhooks/crm-meta` or `/api/webhooks/crm-whatsapp`).
2. POST a second message from the exact same sender handle before the ticket closes.
3. Read back `core.threads`/`core.messages` for `entity_type='crm_ticket'`,
   `entity_id=<ticket id>`.
**Expected result:** One ticket, one thread; both messages appear as `direction:
'inbound'` rows on that same thread in order, not two separate tickets/threads.
**Automated coverage:** None at the DB/RLS-harness level yet (this repo's harness is
raw-SQL only and can't drive the TypeScript ingestion function or a signed webhook
request) — the same structural gap TC-CRM-001 flags for the routing engine. Signature
verification itself (`lib/webhooks/verify-meta-signature.ts`) has full unit coverage
(6 cases) independent of this gap.

### TC-CRM-004: `crm` RLS holds even at skeleton stage, including the grace-period read/write split (ADR-9)
**Feature:** Sanity check that `test-crm-rls.mjs` (already in `test:db`) stays
green as CRM grows, extended this pass to explicitly cover ADR-9's licensing
lifecycle for CRM's own tables specifically (previously only exercised generically via
`fsm` data in `test-core-license-lifecycle.mjs`).
**Priority:** P0 · **Story:** ongoing
**Steps:**
1. With no `crm` license at all, confirm both read and write are denied.
2. With a `grace`-status license (not yet expired), confirm reads of existing
   channels/tickets/routing rules still succeed, but both new inserts and updates to
   existing rows are denied.
3. Reactivate the license and confirm writes succeed again.
4. Run `node scripts/test-crm-rls.mjs` after any CRM schema change.
**Expected result:** All of the above hold — a lapsed license degrades to read-only
per ADR-9's "cancelling a license never deletes data" guarantee, it doesn't either wipe
data or keep write access; reactivating restores full read/write immediately. Passes;
if it doesn't, that's a release blocker regardless of which other CRM feature was being
worked on.
**Automated coverage:** `scripts/test-crm-rls.mjs`, "Cancelling back into grace" section.

### TC-CRM-005: An update denied by a lapsed license fails with a real, actionable error — not a silent no-op
**Feature:** `updateTicketStatus`/`assignTicket`/`setChannelActive`/`setRoutingRuleActive`
in `packages/module-crm/src/lib/{tickets,channels,routing-rules}/mutations.ts`.
**Priority:** P0 · **Story:** error-message audit (this pass)
**Background — a real bug found and fixed this session:** Postgres RLS's `using`
clause on an `UPDATE` silently excludes non-matching rows from the affected set rather
than raising an error (unlike an `INSERT`'s `with check`, which does throw). Before this
fix, all four of the functions above did a plain `.update(...).eq("id", ...)` with no
`.select()` and only checked `error` — so if the target row's RLS check failed (most
realistically: the business's `crm` license had lapsed into its read-only grace period
between page load and the button click), the call would return successfully having
changed nothing, with no error, no thrown exception, and no way for the caller to tell
the user why their click did nothing. Fixed by adding `.select("id")` and throwing an
actionable `Error` when the returned array is empty, mirroring the same
zero-rows-means-denied pattern `fsm`'s `jobs/mutations.ts#transition()` already used for
its own status-transition guards (see TC-FSM-017).
**Steps:**
1. License a business for `crm`, create a ticket.
2. Let (or force, for the test) the license lapse into `grace`.
3. Call `updateTicketStatus` on the existing ticket.
4. Repeat for `assignTicket`, `setChannelActive` (on an existing channel), and
   `setRoutingRuleActive` (on an existing routing rule).
**Expected result:** All four throw `"This <ticket/channel/routing rule> could not be
updated -- it may have been removed, or your access to it may have changed."` — a
clean, actionable message a UI can toast directly — instead of silently succeeding with
zero rows changed.
**Automated coverage:** `scripts/test-crm-rls.mjs` proves the underlying DB-level fact
(a grace-period `UPDATE` returns zero rows via `returning id`, not an error) that this
fix's `.select("id")` + length check now correctly surfaces as a thrown error at the
application layer. As with `fsm`'s permission checks (TC-FSM-015..017), this repo's
harness is raw-SQL only, so the actual TypeScript `throw new Error(...)` call sites in
`mutations.ts` are not independently exercised by an automated test yet — this is the
same structural testing-boundary gap noted throughout this pass, not unique to CRM.

### TC-CRM-006: Meta/WhatsApp webhook signature verification rejects tampered or wrongly-signed payloads
**Feature:** Part A, A2 (`docs/design/crm-module-design.md`) — `/api/webhooks/crm-meta`,
`/api/webhooks/crm-whatsapp`.
**Priority:** P0 · **Story:** A2
**Steps:**
1. Sign a payload with the configured `CRM_META_APP_SECRET`/`CRM_WHATSAPP_APP_SECRET`
   and POST it with a correct `X-Hub-Signature-256` header.
2. POST the same payload with the signature computed over a *different* (tampered)
   body.
3. POST with a signature computed using the wrong secret.
4. POST with the header missing entirely, and with the header present but using the
   wrong `sha1=` scheme prefix.
5. GET the route with `hub.mode=subscribe`, a correct `hub.verify_token`, and a
   `hub.challenge` (Meta's one-time webhook-registration handshake).
**Expected result:** Only step 1 and a correct-token step 5 succeed; steps 2-4 are
rejected (401/403) without ever reaching `ingestInboundCrmMessage`.
**Automated coverage:** `packages/module-crm/src/lib/webhooks/verify-meta-signature.test.ts`
(11 cases) covers every one of the above at the pure-function level (`verifyMetaSignature`/
`verifyMetaSubscription`); no test drives an actual HTTP POST against the route files
themselves.

### TC-CRM-007: Instant-reply mode `instant_ack_then_human` fires once per new conversation, never on a follow-up
**Feature:** Part A, A3.
**Priority:** P1 · **Story:** A3
**⚠ Superseded (2026-09-12):** this auto-acknowledgment behavior was deliberately
dropped for every new ingestion path (CRM-08.2's own audit note: it "runs against the
platform's post-CRM-09 human-in-the-loop direction," not merely an unbuilt nice-to-have).
Nothing live triggers this any more.
**Steps:**
1. Connect a channel account with `instant_reply_mode: 'instant_ack_then_human'`.
2. Ingest a first message from a new sender.
3. Ingest a second message from the *same* sender on the still-open ticket.
4. Repeat step 2 with `instant_reply_mode: 'off'` and `'draft_approve'`.
**Expected result:** Step 2 sends the fixed acknowledgment template and records it as
an `outbound` `core.messages` row (`status: 'sent'`, or `'failed'` if the provider send
call itself failed — the inbound message is kept either way). Step 3 sends nothing
further. Step 4's `'off'` sends nothing; `'draft_approve'` also currently sends
nothing (no AI drafting path exists yet — see TC-CRM-001's own note on why AI-backed
CRM features are deferred), which is today's real (if incomplete) behavior for that
mode, not a bug to silently work around.
**Automated coverage:** None yet — `sendInstantAcknowledgment`/`sendCrmChannelMessage`
need either a live provider token or a mocked `fetch`, neither of which this repo's
current harness provides. A real gap.

### TC-CRM-008: "Convert to prospect" carries the ticket's own context into a real prospect, reusing an existing party rather than duplicating it
**Feature:** Part A, A4.
**Priority:** P0 · **Story:** A4
**⚠ Superseded (2026-09-12):** `convertTicketToProspectAction` still exists but is
orphaned from any live inbound flow. The *reverse* direction (Discovery→CRM handoff via
`promoteProspectToLead()`, CRM-03.1) is now the primary path — see TC-CRM-013.
**Steps:**
1. Ingest an inbound message that creates a new lead-only `core.parties` row and an
   open ticket with `external_sender_handle` set.
2. Call `convertTicketToProspectAction` on that ticket.
3. Repeat on a ticket whose `channel_id` has no connected account, and on one with no
   `external_sender_handle` (manually created).
4. Repeat step 2 with `discovery` unlicensed for the business, and with the business
   having zero products/workspaces.
**Expected result:** Step 2 creates a `discovery.prospects` row whose `description`
includes the channel, handle, and first message, linked to the *same* `party_id` the
ticket already had (`existingPartyId`) — not a second, disconnected party — and adds
the `'prospect'` role to it. Step 3 returns a clear inline error, no prospect created.
Step 4 returns `"Discovery isn't licensed..."` / `"This business has no product
yet..."` respectively, per `ContractResult`'s `MODULE_NOT_LICENSED`/`NOT_FOUND`
branches (ADR-10) — never a thrown exception.
**Automated coverage:** None yet — this spans two modules' live mutations
(`createProspect`, `addPartyRole`, the ticket lookup) and needs a real Postgres
connection plus both modules' RLS-scoped clients; a real gap, same class already noted
for TC-CRM-001/003/007.

### TC-CRM-009: Customer 360 shows exactly the licensed modules' data, gracefully omitting the rest
**Feature:** Part B, B1.
**Priority:** P1 · **Story:** B1
**Update (2026-09-12):** core claim still holds but is now incomplete — the panel has
since grown Contacts (CRM-02.2), Relationship Timeline (CRM-02.3), AI Summary
(CRM-12.1), Buying Intent Score (CRM-12.5), and an FSM-quote timeline entry (CRM-11.4),
none of which this case's own steps exercise. See TC-CRM-036/046.
**Steps:**
1. Visit `/dashboard/businesses/{id}/crm/customers/{partyId}` for a party with
   Discovery prospect history, Inventory orders/invoices, and FSM jobs, on a business
   licensed for all three.
2. Repeat on a business licensed for only one of the three.
3. Repeat for a party belonging to a *different* business than the URL's `businessId`.
4. Visit with `?ticketId=` set to an open ticket for that same party, and click "Link
   to ticket" on one order and one job.
**Expected result:** Step 1 shows all four sections (outstanding balance, Discovery,
Inventory, Service) with real data, including the invoice's own GST e-invoice status
chained via `getGstDocumentStatus`. Step 2 shows only the licensed module's section(s)
— the others simply don't render (`MODULE_NOT_LICENSED`, not an error banner). Step 3
404s (the page's own `party.business_id !== businessId` check). Step 4's "Link to
ticket" sets `crm.tickets.related_module`/`related_document_id` to that exact
order/job, and the button shows "Linked" on exactly one row at a time per document
kind.
**Automated coverage:** None yet — needs live data across four modules' schemas. A
real gap.

### TC-CRM-010: A ticket's related-document link is always both-or-neither, never a mismatched pair
**Feature:** Part B, B2 (`crm.tickets.related_module`/`related_document_id`).
**Priority:** P1 · **Story:** B2
**Steps:**
1. Call `setTicketRelatedDocument(ticketId, { module: 'inventory', documentId })`.
2. Call `setTicketRelatedDocument(ticketId, null)`.
3. Attempt a raw `update` setting only `related_module` (leaving `related_document_id`
   null) directly against the table, bypassing the mutation function.
**Expected result:** Steps 1-2 succeed and clear together. Step 3 is rejected by
`tickets_related_module_requires_document`'s check constraint — the database itself
refuses a mismatched pair, not just the application-layer function.
**Automated coverage:** None yet at the RLS-harness level (the constraint itself was
verified once manually via `lint:migrations` + a local apply during development, not
via a repeatable test script) — a real gap worth closing before this feature grows
further.

### TC-CRM-011: `ticket.created`/`ticket.resolved`/`ticket.converted_to_prospect` are emitted at the right moments, through the right client
**Feature:** Part B, B4 (emit side only — see the note below on the consume side).
**Priority:** P2 · **Story:** B4
**⚠ Superseded (2026-09-12):** ticket-lifecycle events are effectively unreachable now
that no live channel creates tickets. The new model has its own 14-entry `CrmEventType`
vocabulary (CRM-01.4) — see TC-CRM-014.
**Note on scope:** B4's own design doc text also calls for *consuming* `prospect.won`
(surface it on an open ticket) and a generic `document.status_changed`. Deliberately
not built this pass — `docs/design/crm-module-design.md`'s own prioritization says so
explicitly ("nice-to-have once the reactive support panel (B1) is working; don't build
the proactive layer before the panel it's meant to enhance exists"), and B1 (TC-CRM-009)
already surfaces `prospect.won` reactively (the Customer 360 panel's own live query),
which covers the same founder-facing need without a push-based consumer duplicating it.
**Steps:**
1. Ingest a first inbound message (new ticket) and read `core.domain_events` for
   `type: 'ticket.created'`.
2. Call `updateTicketStatus(ticketId, 'closed')` and check for `'ticket.resolved'`.
3. Call `updateTicketStatus(ticketId, 'pending')` (not `'closed'`) and confirm no event
   fires.
4. Successfully convert a ticket to a prospect and check for
   `'ticket.converted_to_prospect'` with the real `prospectId` in its payload.
**Expected result:** Exactly the three events above fire at exactly those moments.
`ticket.created` is written directly via the admin client (the webhook context has no
session to `publish()` through); the other two go through
`core/events/mutations.ts#publish()` since both are real signed-in-user actions.
**Automated coverage:** None yet — same DB-access gap as the cases above.

---

## The current model (WonderArc CRM backlog, 74 stories, `docs/design/crm-backlog-audit.md`)

Primary automated coverage for everything below: **`scripts/test-crm-backlog-rls.mjs`**
(the tenant-isolation/cross-reference-smuggling/idempotency harness for all 19 backlog
tables — not mentioned by any case above since it postdates all of them) plus ~20 new
`packages/module-crm/src/**/*.test.ts` files (`conversations/queue.test.ts`,
`interactions/response-rules.test.ts`, `escalation/mutations.test.ts`,
`whatsapp/window.test.ts`, `reviews/google-business-profile-adapter.test.ts`,
`relationships/detect.test.ts`, `journey/queries.test.ts`,
`opportunities/fulfillment.test.ts`, and more — see each section below for which).

### CRM-01 — Backlog schema & interaction model

### TC-CRM-012: Inbound/outbound interaction dedup never double-records the same message
**Priority:** P0 · **Story:** CRM-01.6
**Steps:**
1. Call `recordInteraction()` twice with the same `external_message_id`.
2. Repeat with the same `client_dedupe_key` (an outbound send retried by the client).
**Expected result:** Both calls are idempotent — no duplicate `crm.interaction` row.
**Covers:** `lib/interactions/mutations.ts`, `scripts/test-crm-backlog-rls.mjs`.

### TC-CRM-013: Tenant + license RLS holds across all 19 backlog tables
**Priority:** P0 · **Story:** CRM-15.1
**Expected result:** 4 policies/table (`tenant AND licensed`), verified for every one of
the 19 new `crm.*` tables, not spot-checked on a subset.
**Covers:** `scripts/test-crm-backlog-rls.mjs`.

### TC-CRM-014: The provider-neutral interaction model stores channel detail in metadata, never per-channel columns
**Priority:** P1 · **Story:** CRM-01.5

### CRM-03/04/05 — Lead → Opportunity pipeline

### TC-CRM-015: Promoting the same Discovery prospect to CRM twice never creates a duplicate lead
**Priority:** P0 (race-safety, cross-module) · **Story:** CRM-03.1
**Steps:**
1. Call `promoteProspectToLead()` twice, concurrently, for the same prospect.
**Expected result:** Exactly one `crm.lead` row — `lead_source_reference_uq` rejects the
second insert; the caller treats the conflict as "already promoted," not an error.

### TC-CRM-016: Converting a lead to an opportunity carries source/activity/product-interest history forward
**Priority:** P0 · **Story:** CRM-03.4
**Expected result:** `convertLeadToOpportunity()` preserves the lead's own history on
the resulting opportunity, never starting it from a blank slate.

### TC-CRM-017: Dragging an opportunity onto a won/lost stage writes audit_log and publishes the right event
**Priority:** P0 · **Story:** CRM-04.2
**Steps:**
1. Move an opportunity's Kanban stage to a `won`-flagged stage.
2. Move a different opportunity to a `lost`-flagged stage.
**Expected result:** Both write a `core.audit_log` entry and publish
`crm.opportunity.won`/`crm.opportunity.lost` respectively; `status` flips accordingly.

### TC-CRM-018: Multi-product opportunities are gated on the Inventory license
**Priority:** P1 · **Story:** CRM-04.4
**Expected result:** Adding a product line to an opportunity with `inventory`
unlicensed is refused server-side (`requireModule`), not just hidden in the UI.

### TC-CRM-019: An opportunity can have at most one primary contact
**Priority:** P1 · **Story:** CRM-04.5
**Expected result:** Setting a second contact primary demotes the first, never leaving
two primaries.

### CRM-06 — Conversations & party matching

### TC-CRM-020: Party matching never resolves a sender to another tenant's party
**Priority:** P0 (RLS/tenant-isolation) · **Story:** CRM-06.1
**Steps:**
1. As Bob's business, ingest a message from a phone number that matches Alice's
   business's own `core.parties` row.
**Expected result:** `matchPartyForActor()`'s three-tier hierarchy
(`known_external_id`/`contact_exact`/`unmatched`) never crosses the tenant boundary —
Bob's lookup creates/matches only within his own business, never Alice's party.
**Covers:** `lib/interactions/matching.ts`, `scripts/test-crm-backlog-rls.mjs`.

### TC-CRM-021: The Conversations inbox correctly applies its own filter/queue rules
**Priority:** P1 · **Story:** CRM-06.2
**Covers:** `conversations/queue.test.ts`.

### CRM-07 — WhatsApp (epic complete, 8/8 P0)

### TC-CRM-022: The WhatsApp webhook resolves the connection via an admin client; an RLS-scoped equivalent query cannot see it cross-tenant
**Priority:** P0 (tenant-isolation, session-less webhook context) · **Story:**
CRM-07.3/07.4
**Steps:**
1. Ingest a WhatsApp webhook for a connection belonging to Business A.
2. As Business B's own RLS-scoped session, attempt to read Business A's connection row.
**Expected result:** (1) succeeds via the admin client (no session exists in a webhook
context). (2) zero rows — the admin-client override never leaks into a normal session's
own reach.

### TC-CRM-023: Outside the 24-hour customer-service window, only a template send is permitted
**Priority:** P0 · **Story:** CRM-07.6/07.7
**Steps:**
1. Attempt a free-form reply more than 24h after the customer's last inbound message.
2. Send a pre-approved template in the same state.
**Expected result:** (1) blocked client- and server-side, with a hint to use a template
instead. (2) succeeds.
**Covers:** `lib/whatsapp/window.test.ts`.

### TC-CRM-024: Connect flow verifies the token against the Graph API before persisting it; it's never rendered back
**Priority:** P0 (secret handling) · **Story:** CRM-07.2
**Expected result:** An invalid token is rejected before any row is written. Once
connected, the UI never displays the stored token value again.

### TC-CRM-025: A sender with no matching party is automatically captured as a new lead
**Priority:** P0 · **Story:** CRM-07.11
**Expected result:** `captureLeadFromWhatsAppMessage()` creates exactly one lead per
unmatched sender; a second inbound message from the same sender does not create a
second lead.

### CRM-08 — Social + Reviews (epic complete, 6/6)

### TC-CRM-026: A published review reply requires explicit human approval — drafting never publishes
**Priority:** P0 (external-action safety) · **Story:** CRM-08.6/08.7
**Steps:**
1. Generate an AI draft review reply.
2. Confirm nothing was sent to Google at that point.
3. Edit the draft, then click "Approve & publish."
**Expected result:** Step 1/2 — draft-only, gated by `reviews.publish`, no external
call. Step 3 — publishes exactly the (possibly-edited) approved text, never the raw
AI output unconditionally.
**Covers:** `lib/reviews/mutations.ts`.

### TC-CRM-027: Google Business Profile review sync is idempotent
**Priority:** P1 · **Story:** CRM-08.5
**Expected result:** Re-syncing the same review never creates a duplicate
`crm.review_item` row — `unique(business_id, provider, external_review_id)`.
**Covers:** `lib/reviews/google-business-profile-adapter.test.ts`.

### CRM-09 — Lost Opportunity Engine (epic complete, 8/8 P0)

### TC-CRM-028: A reply clears `requires_response` on every prior unanswered interaction in the conversation, not just the one replied to
**Priority:** P0 · **Story:** CRM-09.1
**Covers:** `lib/interactions/response-rules.test.ts` (`evaluateRequiresResponse`).

### TC-CRM-029: One-click convert-to-lead/opportunity/task reuses the existing party, never duplicating it
**Priority:** P0 · **Story:** CRM-09.5

### TC-CRM-030: An AI-suggested draft reply never auto-fills or auto-sends
**Priority:** P0 (no-autonomous-send guarantee) · **Story:** CRM-09.6
**Expected result:** "Use this draft" only writes into the textarea; sending is still a
separate, explicit human action.

### TC-CRM-031: Response quality pre-send checks never block Send
**Priority:** P1 · **Story:** CRM-09.7
**Expected result:** All five LLM checks plus the one deterministic length check are
advisory only — dismissing or ignoring them still allows Send.
**Covers:** `lib/conversations/response-quality.test.ts`.

### TC-CRM-032: The escalation ladder only escalates forward, never regresses a stage already reached
**Priority:** P1 · **Story:** CRM-09.8
**Covers:** `lib/escalation/mutations.test.ts` (`computeTargetEscalationStage`, 6 cases).

### CRM-10/11 — Inventory & FSM continuity

### TC-CRM-033: Inventory availability in a conversation degrades gracefully when Inventory is unlicensed
**Priority:** P1 (ADR-10) · **Story:** CRM-10.2
**Expected result:** Availability reads `null`, never throws; the catalog picker is
hidden, not broken.

### TC-CRM-034: Out-of-stock waitlist → back-in-stock follow-up fires from a real Inventory event
**Priority:** P1 · **Story:** CRM-10.3/10.4
**Expected result:** `inventory.stock.replenished` triggers a suggested follow-up for
every open waitlist entry for that item; nothing is auto-sent to the customer.

### TC-CRM-035: The CRM↔FSM bridge is a bare pointer, never a cross-schema FK
**Priority:** P1 · **Story:** CRM-11.1-11.4

### CRM-12 — AI Relationship Intelligence (epic complete, 5/5)

### TC-CRM-036: Buying-intent score recalculation writes a before/after audit entry; viewing the page never recalculates
**Priority:** P1 (this score is deterministic, not AI — explainable/auditable) ·
**Story:** CRM-12.5
**Expected result:** Score changes only on an explicit recalculation action, always
logged to `core.audit_log`.

### TC-CRM-037: AI summary/conversation-summary generation is cached by input hash
**Priority:** P2 · **Story:** CRM-12.1/12.2
**Expected result:** Regenerating with no underlying change performs no second model
call.

### CRM-14/15 — Dashboards/Analytics + Governance

### TC-CRM-038: A business without the right permission cannot connect/disconnect a channel or edit routing/escalation config
**Priority:** P0 · **Story:** CRM-15.2/15.3
**Expected result:** `crm_settings.manage`/`channel_connections.manage` gate every
listed mutation server-side.

### TC-CRM-039: Every send/connection change is captured in the audit log
**Priority:** P0 · **Story:** CRM-15.4

### TC-CRM-040: A WhatsApp connection auto-flips to `reauthorization_required` on 401/403 and never auto-resurrects a manual disconnect
**Priority:** P0 · **Story:** CRM-15.5
**Covers:** `lib/whatsapp/failure-classification.test.ts`.

### Cross-module Integration backlog (`docs/design/integration-backlog-audit.md`, 29/29 done)

### TC-CRM-041: A won opportunity with an unfulfilled commitment reads `won_in_progress`, not `won_complete`, until Inventory confirms fulfillment
**Priority:** P0 · **Story:** INT-01/INT-02
**Covers:** `journey/queries.test.ts`, `opportunities/fulfillment.test.ts`.

### TC-CRM-042 (regression guard): FSM job material requirements read from `fsm.jobs`, never `core.jobs`
**Priority:** P0 · **Story:** INT-03.1
**Background:** `listJobPartLines()` originally queried `core.jobs` where jobs actually
live in `fsm.jobs` — every caller swallowed the resulting throw, so the entire reserve/
consume/release mechanism silently no-opped from the moment it shipped until this fix.
**Expected result:** Reservation/consumption/release actually execute — this case exists
specifically to catch a regression back to the wrong schema.

### TC-CRM-043: An opportunity with `assessment_requirement` set blocks quote creation until an outcome is recorded
**Priority:** P1 · **Story:** INT-04.2/04.3

### TC-CRM-044: Completing a job with outcome `warranty_revisit_required` auto-creates a fresh revisit job
**Priority:** P2 · **Story:** INT-06.4

### TC-CRM-045: The business-wide Cross-Module Exception Center auto-closes an exception via audit trigger, never silently
**Priority:** P1 · **Story:** INT-07

### TC-CRM-046: The Unified Journey Timeline and Linked Object Graph resolve back-navigation links correctly
**Priority:** P2 · **Story:** INT-08
**Covers:** `object-graph/queries.test.ts`.

### Discovery → CRM handoff (ships in `module-crm`)

### TC-CRM-047: Sending a Discovery prospect to CRM when a match already exists shows a warning naming it before confirming
**Priority:** P1 · **Story:** DISC-OFFER-P0-08.2/08.3
**Expected result:** `classifyExistingRelationship()`'s priority ladder (customer > open
opportunity > open lead > fuzzy name > new prospect) surfaces the amber warning before
the founder confirms the handoff — never a silent duplicate creation.
**Covers:** `relationships/detect.test.ts`.
