# AI replies to simple WhatsApp questions

Owner request 2026-10-14: "auto-reply to simple WhatsApp questions". This is the platform's
first AI output that may act on its own, so it was designed and approved before any of it
was built (CLAUDE.md, "AI, untrusted input and governed actions", rule 3). Stories:
PLATFORM-P1-12.1–12.6 in `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` §42.

## Owner decisions (2026-10-14)

1. **Draft first, then auto.** Phase 1 replaces today's canned `draft_approve` drafts with real
   AI answers that a person sends with one click. Phase 2 (auto-send per WhatsApp account) is
   built only after the owner has seen the drafts' quality.
2. **No "automated" tag** on the message the customer receives. The ticket thread still marks
   every AI reply as AI for the team.
3. **Topics it may answer:** hours/address/contact (business profile), products and prices
   (recorded prices only), product FAQs/knowledge, and the sender's own order/job status
   looked up by their phone number. The last one reveals order details to whoever holds the
   number; it is accepted, limited to the sender's own records, and stays a draft in phase 1.
4. **Daily limit:** 100 auto-replies per business per day (phase 2). Over the limit, the
   customer gets the normal "someone will reply" acknowledgement.

## How it works

1. An inbound WhatsApp message arrives (signature-verified webhook, idempotent on the
   provider's message id, as today).
2. Plain code gathers the **facts**: the business profile, recorded products and prices,
   product knowledge, and the sender's own open orders/jobs. Each fact has an id.
3. The model gets the facts and the customer's message as **quoted data** and returns, as
   validated JSON: whether it can answer, its confidence, the topic, the answer, and the ids of
   the facts it used. It may use nothing else; a fact id it didn't receive invalidates the
   answer.
4. **Plain code decides.** No draft (today's acknowledgement path instead) when: the model
   can't answer, confidence is low, the topic is a complaint, refund, payment, order change or
   opt-out, the output fails validation, or the provider is down.
5. Phase 1: the answer is stored as the ticket's draft, labelled "AI draft" with the facts it
   used; a person edits or sends it. Every call is recorded in `core.ai_runs`.
6. Phase 2 (built 2026-10-17, owner-approved; PLATFORM-P1-12.5/12.6): see below.

## Phase 2: "Send automatically"

The setting is `crm.channel_connection.ai_reply_mode` on the business's WhatsApp account:
`draft` ("Draft for review", the default) or `auto` ("Send automatically"), on CRM → WhatsApp
under **AI replies**. Changing it needs `channel_connections.manage`, checked in
`setWhatsAppAiReplyMode()` and again by a trigger, and is audited.

For a business in auto mode, each inbound message runs `processWhatsAppAutoReply()`
(`packages/module-crm/src/lib/ai/auto-reply.ts`), stopping at the first "no":

1. **Plain-code checks** (`preClaimSkipReason()`): CRM licence active; the AI switches
   `draft_customer_reply` and `auto_send_customer_reply` on and the platform-wide AI policy
   on (a failed read of any of them is "no"); WhatsApp connected; inside the 24-hour window;
   the sender hasn't opted out; it is still the conversation's newest inbound message and
   nobody has replied.
2. **The claim** (`crm.claim_ai_auto_reply()`): one `crm.ai_auto_replies` row per inbound
   message (unique), created before anything is sent, under a per-business lock that counts
   the limits: **100 per business and 3 per conversation per business day** (the business's
   timezone), counting `requested` and `sent`. A redelivered webhook or re-drained event gets
   the existing row back and stops, so at most one reply is ever sent per message.
3. **The answer**: the same `runReplyDraft()` pipeline as a draft (facts only, confidence
   ≥ 0.7, no needs_person topics, cited fact ids must exist), run as
   `auto_send_customer_reply` and recorded in `core.ai_runs`. Only an `answered` draft on
   hours/address/contact, products and prices, or product information is sent; the proposal
   (answer, topic, facts) is saved on the claim first.
4. **The send** through the WhatsApp Cloud API (`sendWhatsAppTextAsSystem()`, the free-form
   send path on service-role clients), recorded as an outbound interaction labelled "Sent
   automatically by AI" with the facts used, then the claim marked `sent` or `failed` with
   WhatsApp's reason. Triggers write every claim and outcome to `core.audit_log`.

Anything not sent is `skipped` with its reason and stays for a person; CRM → Conversations
shows the mode and, for the latest message, why it wasn't sent.

**Facts in auto mode** are the business profile and recorded products and prices only. Order
and job status and offering knowledge are read through other modules' session-scoped
contracts, which a webhook has no session for, so those questions stay with a person (and
`order_job_status` is never auto-sent).

**Opt-outs**: WhatsApp has no opt-out webhook, so a customer who sends just STOP,
UNSUBSCRIBE or OPT OUT is recorded in `core.communication_suppressions` (channel
`whatsapp`, a namespaced one-way hash of the number) and gets no automatic replies again. A
person can still reply.

**Timing**: the drain cron runs once a day, so the webhook route answers right after Meta
gets its 200 (Next's `after()`), and ingest also publishes `crm.whatsapp.auto_reply_requested`
as a fallback for the drain. Both are keyed to the message by the claim.

**Over the limit** the message is simply left for a person; the decision-4 "someone will
reply" acknowledgement is not sent automatically (no automatic acknowledgement exists on the
WhatsApp path today, and adding one would be a second automatic send).

## Out of scope

Anything that changes data (bookings, order edits, refunds), outbound messages that aren't
replies, and channels other than WhatsApp.
