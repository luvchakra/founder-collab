# CRM Module — Full Design

**Implementation status (2026-09-09):** P0 (A1-A4) and P1 (B1-B2) are built and live —
`crm.channel_accounts`, the Meta/WhatsApp inbound webhooks with real signature
verification, instant-reply's `instant_ack_then_human` mode (fixed-template, not
AI-drafted — see below), `module-discovery`'s new `contract/index.ts` +
`createProspectFromExternalLead`, the Customer 360 panel, and ticket enrichment
(`related_module`/`related_document_id`) are all real, working code, not stubs. B3's
routing conditions (known-vs-new sender, business hours, and now detected-intent —
see below) are wired into a real evaluator; B4's three emit-side events
(`ticket.created`/`resolved`/`converted_to_prospect`) fire for real, and B4's
`prospect.won` consume side is now also real (see below). See
`docs/testing/test-cases/crm.md` for the exact test coverage (and gaps) against each
piece.

**Built this pass (2026-09-09), with an honesty caveat on the AI pieces:**
- **`draft_approve` mode + `detected_intent_filter` routing** now have real, working
  code behind them — `lib/ai/classify-intent.ts` and `lib/ai/draft-reply.ts` — but
  both are **deterministic keyword/template heuristics, not a real AI call**.
  `module-discovery`'s BYOK routing (`resolveAiModel`) remains discovery-schema-owned
  with no contract exposing it across the module boundary (CLAUDE.md rule #3), so
  module-crm has no sanctioned way to call a real LLM today. The upgrade path is
  unchanged from what this doc said before: expose a generic "generate/classify text
  for this workspace's connected provider" call from `module-discovery`'s
  `contract/index.ts`, then swap `classify-intent.ts`/`draft-reply.ts`'s bodies for
  that call — `ingest-inbound-message.ts`, the caller, doesn't need to change. Until
  that contract call exists, treat every classification/draft here as a rough,
  explainable guess a human should double-check, not a graded model output.
- **B4's `prospect.won` consume side** (`events/handlers.ts`) is real: when Discovery
  marks a prospect won, every open CRM ticket for that same party gets an internal
  (`status: "draft"`, never sent to the customer) note on its thread, idempotent
  against replay. This is in addition to — not instead of — B1's Customer 360 panel's
  existing reactive surfacing; the panel is a pull when someone opens it, this note is
  a push onto the ticket itself so an agent working the ticket sees it without also
  opening Customer 360.
- `core/events/registry.ts` was upgraded from one handler per event type to many, so
  this new `prospect.won` consumer coexists with `module-fsm`'s own unrelated
  `prospect.won` handler instead of silently overwriting it.

**Still explicitly deferred, not silently skipped:**
- **Google Business Messages (P1.7):** no webhook route, no send path. Lower volume
  than WhatsApp/Instagram/Facebook per this doc's own sequencing ("sequence after those
  three are solid"), needs a real GBM API integration this sandbox has no credentials
  to build against, **and as of this writing Google has sunset Business Messages
  (shut down mid-2024)** — the real-world API this section specs against no longer
  exists to integrate with. Recommend striking P1.7 rather than building toward a
  discontinued product; a real replacement (Google's Business Communications successor
  offerings, if any fit) would need its own design pass, not a mechanical port of this
  section.
- **Proactive `document.status_changed` updates** (the other half of B4's consume
  side): still not built, and for a concrete reason found while implementing the
  `prospect.won` half above — **`document.status_changed` is not a real, published
  domain event anywhere in this codebase today.** It exists only as an audit-log label
  (`core/audit/format.ts`); no module publishes a `core.domain_events` row of that
  type. GST's own filing consumer listens for the differently-scoped `document.issued`
  event instead. Building this for real needs new publish-side work in whichever
  modules own the relevant documents (Inventory sales orders shipping, GST filings,
  FSM invoices) before CRM has anything real to consume — that's a follow-up story of
  its own, not something fakeable from the CRM side alone.

---

Status: design proposal, ready to break into stories for Claude Code.
Grounded in the actual current state: `module-crm` today is a 3-item skeleton
(Inbox, Channels, Routing Rules) with `crm.channels`/`crm.tickets`/`crm.routing_rules`
and no live connection to any external channel yet — `ChannelKind` already includes
`"whatsapp"` and `"social"` as values, but nothing sends or receives through them.
This design fills that in, and turns CRM into the platform's shared
customer-communication and support layer other modules plug into, per
`00-MASTER-PLAN.md`'s own module ownership model.

## Vision

Two problems, one module:
1. **Messages arriving on a business's external channels (WhatsApp, Instagram,
   Facebook, Google Business Messages) go unanswered today** because nothing in the
   platform even sees them — they sit in Meta/Google's own apps. A prospective
   customer messaging a business's Instagram gets silence, and moves on to a
   competitor who replied in five minutes.
2. **Support requests need context from whichever modules a business actually
   runs** — "where's my order" needs Inventory, "when's my technician coming"
   needs FSM, "did my invoice get filed" needs GST — and today CRM has no way to
   see any of that.

## Part A — Unified inbox, instant reply, and conversion to Discovery

### A1. Channel accounts (new)

`crm.channels` today is just a label. Add `crm.channel_accounts`: one row per
actually-connected external account.

```
crm.channel_accounts
  id, business_id, channel_id (fk crm.channels)
  provider: 'whatsapp_business' | 'instagram' | 'facebook_messenger' | 'google_business_messages'
  external_account_id (the page/number/location ID on the provider's side)
  access_token_encrypted, refresh_token_encrypted   -- same encryption pattern as BYOK (core.crypto)
  status: 'connected' | 'expired' | 'revoked'
  last_synced_at
```

**Note on providers:** Instagram DMs and Facebook Page Messenger are both reached
through the same Meta Graph API and the same app review process — implement them
as one integration with two `provider` values, not two separate builds. WhatsApp
Business Platform (Cloud API) and Google Business Messages are each their own
integration.

### A2. Inbound webhooks

One endpoint per provider family, following the exact pattern already established
by `apps/web/app/api/webhooks/email-inbound` and `email-status` (signature
verification against a shared secret, normalize into `core.threads`/`core.messages`):

- `/api/webhooks/crm-meta` (Instagram + Facebook, verified via Meta's signature scheme)
- `/api/webhooks/crm-whatsapp` (WhatsApp Cloud API)
- `/api/webhooks/crm-google-business-messages`

Each inbound message: resolve the sender to an existing `core.parties` row by
phone/handle if one exists (so a WhatsApp message from an existing customer links
to their history automatically), otherwise create a new lead-only party. Create or
append to a `crm.tickets` row and the underlying `core.threads`/`messages` row —
the same shared messaging tables FSM and Discovery already use, so this isn't a
fourth parallel inbox implementation.

### A3. Instant reply — configurable, not fully autonomous

Per channel (or overridden per routing rule), three modes:
- **Off** — manual only, current behavior.
- **AI drafts, human approves** — same draft-then-approve discipline Discovery
  already uses for outreach messages, applied here to replies.
- **Instant acknowledgment, then human** — the mode that actually solves "messages
  go unanswered": the moment a first message arrives from a new contact, an
  AI-drafted acknowledgment sends immediately ("Thanks for reaching out — someone
  from our team will follow up shortly. In the meantime, could you tell me a bit
  about what you're looking for?"), and anything beyond that opening exchange
  requires a human, or an explicit second AI-drafted reply once the person has said
  more. This keeps a real person in the loop for anything substantive, while
  closing the "we took six hours to reply and they'd already messaged someone
  else" gap this whole feature exists to solve.

Reuse Discovery's existing reply-classification vocabulary (`interested` /
`not_interested` / `question` / `objection` / `out_of_office` / `unsubscribe` /
`other`, from `lib/ai/classify-reply.ts`) for inbound CRM messages too — one shared
taxonomy across CRM and Discovery, not two teams inventing separate labels for the
same underlying signal.

### A4. Convert to prospect — the Discovery handoff

A "Convert to prospect" action on any ticket whose sender shows buying intent.
**This requires `module-discovery` to gain a `contract/index.ts`** — checked
directly against the current repo: `module-inventory`, `module-fsm`, and
`module-gst` each already expose one (`00-MASTER-PLAN.md` §6 mechanism 2); Discovery
is currently the only module of the five with no public contract surface for
others to call into. Add:

```ts
// packages/module-discovery/src/contract/index.ts (new file)
export async function createProspectFromExternalLead(
  businessId: string,
  input: {
    companyName: string;
    contactName?: string;
    contactChannel: "whatsapp" | "instagram" | "facebook_messenger" | "google_business_messages";
    contactHandle: string;
    firstMessage: string;
    sourceTicketId: string;
  },
): Promise<ContractResult<{ prospectId: string; workspaceId: string }>>
```

Same `ContractResult`/`MODULE_NOT_LICENSED` pattern every other contract already
uses (ADR-10) — if Discovery isn't licensed for this business, "Convert to
prospect" is simply not offered (checked before rendering the button, not
discovered as a runtime error after clicking it).

The created prospect's research should seed from `firstMessage` and the
conversation so far — the same principle already identified for the Discovery
auto-discovery flow (`prospects-pipeline-redesign-requirements.md` R5: carry the
"why" forward, don't discard context at a handoff).

## Part B — Full-fledged customer support system

### B1. The "Customer 360" panel on a ticket

When a ticket's sender resolves to a known `core.parties` row, show one panel with
live status pulled from every licensed module — not a static CRM-only record.
Each section calls that module's own contract and simply doesn't render if the
module isn't licensed (`MODULE_NOT_LICENSED` is a normal, expected result per
ADR-10, not an error state to display):

- **Discovery** — prospect/deal stage, if this party is or was a prospect.
- **Inventory** — recent orders and their status, any open stock issue relevant to
  what they ordered.
- **FSM** — upcoming/recent jobs, technician assigned, invoice status.
- **GST** — filing status of their invoices (chained from whichever document ID
  Inventory/FSM's contract already returned — GST's existing
  `getGstDocumentStatus(businessId, documentId)` is sufficient here as-is).
- **Core** — outstanding balance/aging, from `core.payments` directly (no
  module-specific contract needed, this is core-owned data already).

**Two new contract functions are needed to make this possible** (confirmed by
reading both modules' current contracts — neither has a party-scoped lookup today,
only Discovery-handoff-specific or stock-specific ones):

```ts
// packages/module-inventory/src/contract/index.ts (add)
export async function listRecentOrdersForParty(
  businessId: string, partyId: string, limit?: number,
): Promise<ContractResult<ContractOrderSummary[]>>

// packages/module-fsm/src/contract/index.ts (add)
export async function listRecentJobsForParty(
  businessId: string, partyId: string, limit?: number,
): Promise<ContractResult<ContractJobSummary[]>>
```

### B2. Ticket enrichment fields

Add to `crm.tickets`: `related_document_id` (nullable fk-by-id into
`core.documents`, cross-schema so stored as a plain uuid, not a real FK) and
`related_module` (`'inventory' | 'fsm' | 'gst' | null`), settable when an agent
links a ticket to "the thing they're actually asking about" (a specific order,
job, or invoice) — this is what makes B1's panel able to highlight the *relevant*
order/job rather than just listing everything the party has ever done.

### B3. Support-specific routing rule conditions (extends existing routing rules)

Today routing rules match on channel + priority only. Extend the condition set:
- **By AI-detected intent/sentiment** (reusing A3's classification) — e.g. route
  `objection`-classified messages to a senior agent, `question`s to whoever's
  fastest to respond.
- **By known-vs-new sender** — an inbound message from a party with an active FSM
  job or a recent Inventory order routes differently than one from a stranger
  (existing customers reaching a support queue, not a sales queue).
- **By business hours** — outside configured hours, the instant-reply (A3) fires
  with different copy acknowledging the delay, rather than the same message
  around the clock.

### B4. Domain events CRM should both emit and consume

Per ADR-5 (`core.domain_events`, drained by the existing job pattern) — no new
event mechanism, use what exists:

**Emits:** `ticket.created`, `ticket.resolved`, `ticket.converted_to_prospect`.

**Consumes:**
- `prospect.won` (from Discovery) — surface it on any open ticket tied to that
  prospect, so a support agent sees "this lead just closed" without cross-checking
  Discovery manually.
- A generic `document.status_changed` (already the shape GST's filing consumer
  listens for, per `gst.md`'s filing-history design) — lets CRM surface "your
  order shipped" / "your invoice was filed" proactively on an open ticket thread,
  rather than only reactively answering when the customer asks.

## Proposed nav (extends the existing 3-item registry entry)

| Item | Slug | Purpose |
|---|---|---|
| Inbox | `` (root, existing) | All tickets, across every connected channel |
| Channels | `channels` (existing) | Connect/manage WhatsApp, Instagram, Facebook, Google Business Messages, email, SMS |
| Routing Rules | `routing-rules` (existing) | Extended per B3 |
| **Auto-Reply** *(new)* | `auto-reply` | Configure instant-reply mode (A3) per channel, business-hours copy, and the shared classification taxonomy |
| **Customer 360** *(new)* | `customers/[partyId]` | The cross-module panel from B1, also reachable directly from a ticket, not just as a standalone list |

## Prioritized requirements for Claude Code

**P0 — the core "don't lose the lead" loop:**
1. `crm.channel_accounts` schema + Meta (WhatsApp/Instagram/Facebook combined
   effort per A1's note) inbound webhook + normalization into `core.threads`.
2. Instant-reply mode A3, "instant acknowledgment then human" as the default for
   new channel connections.
3. `module-discovery` contract/index.ts + `createProspectFromExternalLead` (A4) —
   blocking dependency for the "Convert to prospect" button to exist at all.

**P1 — the support system:**
4. `listRecentOrdersForParty` (inventory) + `listRecentJobsForParty` (fsm) contract
   additions.
5. Customer 360 panel (B1) consuming both, gracefully omitting unlicensed modules.
6. Ticket enrichment fields (B2).
7. Google Business Messages integration (separate from the Meta combined effort,
   lower volume than WhatsApp/Instagram/Facebook for most businesses — sequence
   after those three are solid).

**P2 — refinement:**
8. Routing rule extensions (B3) — depends on A3's classification existing first.
9. Domain event consumption for proactive updates (B4's second half) — nice-to-have
   once the reactive support panel (B1) is working; don't build the proactive
   layer before the panel it's meant to enhance exists.
