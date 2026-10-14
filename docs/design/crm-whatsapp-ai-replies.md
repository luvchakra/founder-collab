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
6. Phase 2 (not built yet): with the account's mode set to auto, the proposal is saved, checked
   (mode on, CRM licensed, account connected, inside WhatsApp's 24-hour window, the daily
   limit, at most 3 auto-replies per conversation, sender not opted out), keyed to the inbound
   message id so a redelivery can't send twice, written to `core.audit_log`, then sent. A
   failed send is recorded as failed. The AI kill switch (Platform → AI) stops it everywhere.

## Out of scope

Anything that changes data (bookings, order edits, refunds), outbound messages that aren't
replies, and channels other than WhatsApp.
