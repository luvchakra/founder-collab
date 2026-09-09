# Test cases: `crm`

Covers `packages/module-crm/src/**`. Grew past skeleton status this pass with
`docs/design/crm-module-design.md`'s Part A/B implementation (channel accounts +
inbound webhooks, instant-reply, Convert to prospect, Customer 360, ticket enrichment,
routing-rule conditions, domain events) — extend this file further as CRM keeps
growing, per `TESTING_STRATEGY.md`'s policy.

**Current scope, confirmed against the schema (`20260908130000_crm_schema.sql`,
`20260909080000_crm_channel_accounts.sql`, `20260909090000_crm_tickets_external_sender.sql`,
`20260909100000_crm_tickets_related_document.sql`,
`20260909110000_crm_routing_rules_extensions.sql`) and the actual ingestion code
(`lib/tickets/ingest-inbound-message.ts`):** `channels`/`tickets`/`routing_rules`/
`channel_accounts` tables, tenant+license RLS, cross-tenant reference-smuggling
triggers. There is still no fine-grained permission model (unlike `fsm`'s
`opportunities.edit` etc.). AI-detected-intent routing conditions are schema-only
(`detected_intent_filter`) — see TC-CRM-001's own note on why.

### TC-CRM-001: Routing rules route for real on known-sender and business-hours conditions; AI-intent is schema-only
**Feature:** Part B, B3 (`docs/design/crm-module-design.md`) — extends the S-1 skeleton.
**Priority:** P1 · **Story:** B3
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
