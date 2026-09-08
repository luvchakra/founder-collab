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

## Sidebar nav now sourced from the module registry (resolved before S-5)

`docs/NEXT-ACTIVITIES.md` §1 flagged a wrinkle worth deciding before any more nav work:
`packages/module-registry/src/index.ts` (P-3) still had each module's `nav` as a single
placeholder `{ label: "Overview", href: "/x" }`, while the real per-module navigation
actually rendered in the sidebar (`INVENTORY_NAV`/`SERVICE_NAV`/`GST_NAV`) was hardcoded
separately inside `packages/core/src/components/shell/app-sidebar.tsx`, sourced from
neither the registry nor either module's own `manifest.ts`. Resolved as its own small
story now (per the plan doc's own suggested sequencing, item 3) rather than folded into
`S-5`, so the dashboard-widget work doesn't inherit the same shortcut.

- `ModuleManifest.nav` (module-registry) is now `ModuleNavGroup[]` (optional `heading` +
  `items: { label, slug, icon }[]`, `slug` relative to the module's own `routePrefix`,
  `""` = the module's own root route) instead of a single flat `{ label, href }[]`. The
  registry's `inventory`/`fsm`/`gst` entries now carry the real nav trees that used to
  live only in `app-sidebar.tsx`'s hardcoded consts; `discovery`/`crm` get a one-item
  placeholder since discovery's real sidebar content is a live per-business product
  list (not a static tree) and `crm` has no package yet (`S-1`).
- `module-fsm`/`module-inventory`'s own `manifest.ts` mirrors were updated to match --
  `moduleRegistry` still can't import either back (`lint:boundaries`: core/
  module-registry may not depend on any module), so the two stay hand-kept in sync
  rather than one importing the other, same as before this story.
- `packages/core/src/components/shell/types.ts`'s `ShellNavModule` gained a `nav:
  ShellNavGroup[]` field (duck-typed, still not importing `@cofounderai/module-registry`
  itself -- structurally identical to `ModuleNavGroup`/`ModuleNavItem`, so `moduleRegistry`
  passed straight through from `apps/web/app/(dashboard)/layout.tsx` needs no per-field
  mapping).
- `app-sidebar.tsx`'s `ModuleContent` lost its three copy-pasted `INVENTORY_NAV`/
  `SERVICE_NAV`/`GST_NAV` branches (and the consts themselves) in favor of one generic
  branch driven by `modules.find(m => m.key === selectedModule)`'s own `nav`/
  `routePrefix` -- discovery keeps its own special-cased branch (live product list).
  `module-icon.tsx`'s icon lookup table grew to cover every icon name the real nav
  trees use (it already had a name -> component fallback pattern from `P-3`).

No migration, no permission change, no new tables -- this is purely a sidebar-rendering
refactor; every route it links to is unchanged, so the sidebar renders identically to
before (same labels, same hrefs, same active-state highlighting), just sourced from
`moduleRegistry` instead of duplicated in `app-sidebar.tsx`.

Verified: `typecheck`/`lint`/`lint:boundaries` all clean; full `test` suite green across
every workspace including `module-registry`'s own manifest-shape tests (still checking
"every module has ≥1 nav group", now genuinely meaningful instead of trivially true) and
`core`'s existing shell tests; `npm run build --workspace=apps/web` succeeds. Not
exercised in an actual browser -- same documented gap as every other UI addition in this
session; the generated hrefs were hand-checked against the exact strings the removed
hardcoded consts used, module by module, to confirm no behavior actually changed.

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
