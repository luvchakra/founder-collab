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

## No unrelated module changed

This audit and CRM-01.2's schema migration touch only `docs/design/`, this new audit
note, and `supabase/migrations/` (`crm` schema only, plus read-only foreign keys into
`core`). No other module's code, schema, or docs were changed.
