# Epic 6 (Skeletons and convergence) build progress

Tracks story-by-story status for Epic 6 (`docs/plan/04-CLAUDE-CODE-BACKLOG.md`). Started
after Epic 5 (FSM) completed -- see `docs/FSM-PROGRESS.md` for that epic's own record,
and `docs/NEXT-ACTIVITIES.md` for the survey that produced this epic's sequencing.

## Status

| Story | Status | Notes |
|---|---|---|
| S-1 | Not started | `crm` module skeleton |
| S-2 | Partially done (pre-existing) | GST module already more built-out than "skeleton" (Profile/e-Way Bill/e-Invoicing credentials, GST Filing reports all real) -- remaining scope below |
| S-3 | Done | `core.threads`/`messages`/`message_templates` |
| S-4 | Not started | Promote `ai_runs`/`ai_provider_credentials`/`usage_events` to `core` |
| S-5 | Not started | Platform dashboard from module-contributed widgets |

Also unblocked and shipped by S-3 (an Epic 5 story, not part of Epic 6 itself, but tracked
here since it depended on this epic's own S-3): **F-11 (FSM Messages tab)** -- see
`docs/FSM-PROGRESS.md`'s own F-11 section for the full narrative.

## S-3 -- `core.threads` + `core.messages` + `core.message_templates`

**Deliberate scope decision, made with the user before building this**: the backlog's
own line ("migrate `public.messages`/`public.conversations` onto them") predates the
`discovery` schema rename and, on inspection, doesn't fit anyway --
`discovery.messages`/`discovery.conversations` are AI-outreach-drafting-specific
(`classification`, `recommended_action`, `provider_message_id`, a
draft→approved→sent AI workflow), a genuinely different and richer concept than the
generic "a customer reply lands on this job's thread" store FSM's Messages tab (F-11)
actually needs. Per explicit user choice (offered as a two-way decision, not assumed):
**build the new generic store for FSM/CRM going forward; leave `discovery.messages`/
`conversations` untouched.** "One message store" applies to new consumers from here,
not retroactively to a working, tested AI feature.

One migration (`20260908100000_core_messages.sql`):

- `core.threads` (`business_id`, `entity_type`/`entity_id` bare polymorphic reference --
  same pattern `core.attachments` already uses, since a thread can attach to a job, an
  opportunity, a future CRM ticket, none of which `core` can point a real FK at without
  importing that module's own schema; `subject`).
- `core.messages` (`thread_id` → `threads`, `direction` (`inbound`/`outbound`),
  `channel` (`email`/`sms`), `from_address`/`to_address`, `subject`, `body`, `status`,
  `sent_at`, `created_by` nullable -- null for inbound/system messages with no signed-in
  author).
- `core.message_templates` (`name` unique per business, `subject`, `body`) -- reusable
  canned messages any module's own send action can offer.

Tenant-only RLS (`business_id in core.user_business_ids()`), no license gate on these
tables themselves -- same treatment `core.tags`/`taggings`/`custom_field_defs`/
`attachments` (D-8) already get: the message store isn't itself a licensed feature;
whichever module reads/writes it (FSM, later CRM) enforces its own license at the
route/action layer, same as F-11 will do via `fsm`'s own RLS on the job a thread is
attached to. A dedicated `enforce_message_thread_business_id()` trigger blocks a
`core.messages` insert whose `thread_id` belongs to a different business than the row's
own `business_id` claims -- same cross-tenant-smuggling class of guard every other
child-of-parent table in this platform already has (`core.document_lines.document_id`).

`packages/core/src/messages/{types,queries,mutations}.ts`:
`getThreadForEntity`/`listMessagesForThread`/`listMessageTemplates` (reads) and
`getOrCreateThread`/`postMessage`/`createMessageTemplate`/`updateMessageTemplate`/
`deleteMessageTemplate` (writes) -- `getOrCreateThread` is idempotent (find-or-create),
same pattern `getOrCreateEstimate`/`getOrCreateInvoiceForJob` already use for their own
per-entity documents. No UI yet -- F-11 (Messages tab) is the first consumer and is the
next story.

New SQL-level test: `scripts/test-core-messages-rls.mjs` (wired into `test:db`) --
thread find-or-create, inbound/outbound message round-trip, the direction check
constraint, the cross-tenant `thread_id`-smuggling trigger, tenant isolation on all
three tables, and the per-business unique template-name constraint.

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: created a thread for a job-shaped entity, posted an outbound send and an
inbound reply onto it, confirmed a smuggled cross-tenant `thread_id` is rejected by the
enforce trigger, and confirmed a message template round-trips. No assertion failures,
zero residue after rollback.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (38
migrations); full `test:db` suite green (including the new
`test-core-messages-rls.mjs`); `npm run build --workspace=apps/web` succeeds; Supabase
security advisor shows no new findings; live end-to-end verification against the dev
Supabase project as described above.
