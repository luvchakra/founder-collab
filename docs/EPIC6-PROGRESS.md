# Epic 6 (Skeletons and convergence) build progress

Tracks story-by-story status for Epic 6 (`docs/plan/04-CLAUDE-CODE-BACKLOG.md`). Started
after Epic 5 (FSM) completed -- see `docs/FSM-PROGRESS.md` for that epic's own record,
and `docs/NEXT-ACTIVITIES.md` for the survey that produced this epic's sequencing.

## Status

| Story | Status | Notes |
|---|---|---|
| S-1 | Not started | `crm` module skeleton |
| S-2 | Mostly done | GST module already more built-out than "skeleton"; generation-history tables + `document.issued` consumer now built too -- remaining scope below |
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

## S-2 -- GST module, remaining scope

`docs/NEXT-ACTIVITIES.md` §1 listed four open items. This pass closes two (the
`document.issued` consumer and the generation-history tables/workflow) and explicitly
defers two (print/CSV-export panels, barcode/QR scanning) -- see "Deferred" below for why.

**Live-source discrepancy, flagged rather than silently reconciled** (per CLAUDE.md's own
"if the plan and the live source disagree, the live source wins" rule): the backlog's own
line for S-2 says "adopt the migrated `gst.einvoices`/`eway_bills` tables" as if a prior
migration already carried them. It doesn't -- confirmed by grep across every migration in
this repo, and by `docs/PORT-PROVENANCE.md`'s own credentials-schema note: "Only the
credential-storage half of upstream's two migrations is ported this slice... the
generation-history tables... are explicitly not ported this slice." Built fresh here
instead of "adopted."

Also discovered, and fixed as part of making this story's own consumer meaningful rather
than left stale: `00-MASTER-PLAN.md` §6's event catalogue claims `document.issued` is
published by "fsm, inventory" both -- true for fsm (`issueInvoice`, F-8) but not, until
now, for inventory (`generateSalesInvoice` never published anything at all). Added the
missing `publish()` call there too (inventory's own model has no separate "issue" step --
`generate_sales_invoice()` never sets `documents.status`, tracking via `payment_status`
instead -- so "generated" is that module's own equivalent of "issued").

One migration (`20260908120000_gst_generation_history.sql`):

- `gst.einvoices` (`business_id`, `document_id` → `core.documents`, `status`
  `generated`/`cancelled`, `irn`/`ack_no`/`ack_date`/`qr_code`, `cancel_reason`/
  `cancelled_at`) and `gst.eway_bills` (same shape, `eway_bill_number`/`valid_until`
  instead of the IRN fields). `unique(document_id)` on both -- one row per document,
  ever; a cancelled e-invoice/e-way-bill can't be regenerated under real GST rules
  (a fresh document would need a fresh IRN), and this schema doesn't model
  supersede-and-reissue, matching `core.documents`' own "void via credit note, never
  delete/reissue" precedent.
- Unlike the credentials tables, these get a normal SELECT policy (tenant + licensed,
  read-level) -- an IRN isn't a secret, it belongs on the invoice's own detail view.
  INSERT/UPDATE additionally require `gst.generate` (new permission, owner/admin only,
  seeded by this migration) and write-level license.
- `gst.enforce_document_business_id()` + a check trigger on both tables -- the same
  cross-tenant reference-smuggling guard every module-owned table with a bare reference
  into `core` already has (mirrors `fsm.enforce_document_business_id()` exactly).

`packages/module-gst/src/lib/{einvoicing,eway-bill}/{types,queries,mutations}.ts`:
`getEinvoiceForDocument`/`getEwayBillForDocument` (reads) and
`generateEinvoice`/`cancelEinvoice`/`generateEwayBill`/`cancelEwayBill` (writes), plus a
small shared `lib/gsp-client.ts#callGsp()` helper. **Every write runs via the admin
client end to end** (both the GSP-secret read and the history-row write) -- reading a
GSP credential's secret columns has no `authenticated` SELECT grant at all, by the
credentials migration's own design, so it can only ever happen through `service_role`,
regardless of whether the caller is an interactive "Generate" button (permission-gated at
the server-action layer) or the `document.issued` consumer (no signed-in user at all).
This means the new tables' own INSERT/UPDATE RLS policies are today's belt-and-suspenders
backstop rather than the literal enforcement path for this story's own mutations -- still
required by CLAUDE.md non-negotiable #2, and exactly the layered-defense reasoning that
non-negotiable already expects. Idempotent via `unique(document_id)`: a document that
already has a row is returned as-is, never re-generated.

The generate functions' request/response field names (`DocDtls`/`ValDtls`/`Irn`/`AckNo`/
`AckDt`/`SignedQRCode` for e-invoicing) are the real NIC IRP API shape, not invented --
grounded in the actual integration even though, same as every Resend email send
elsewhere in this platform, none of it was exercised against a live GSP sandbox in this
session (none is reachable, and no demo business here has real GSP credentials).

`packages/module-gst/src/contract/index.ts` -- this module's first `contract/index.ts`
(mirrors `module-fsm`'s/`module-inventory`'s own first ones from F-13/SP-9):
`getGstDocumentStatus`/`generateDocumentEinvoice`/`cancelDocumentEinvoice`/
`generateDocumentEwayBill`/`cancelDocumentEwayBill`, each `MODULE_NOT_LICENSED`-gated
(ADR-10). `apps/web` is this contract's first caller (exempt from the module-to-module
contract-only restriction, but using the contract anyway is still cleanest).

**The `document.issued` consumer** (`packages/module-gst/src/events/handlers.ts`, wired
into `apps/web/app/api/cron/drain-events/route.ts`'s side-effect imports): auto-generates
an e-invoice the moment an invoice is issued, for any business that has `gst` licensed
and has e-Invoicing credentials configured -- silently no-ops (not a failure) for a
business with no credentials configured, the common case in this demo platform. Both
`issueInvoice` (fsm) and `generateSalesInvoice` (inventory) now publish `document.issued`
with `requiredModule: 'gst'`, so `drainDomainEvents()` parks the event for an unlicensed
business rather than failing it permanently for lack of a handler -- and
`replay_parked_events()` (already wired into `activateLicense()`, C-4) un-parks it the
moment `gst` is bought, with zero code here needing to know that happened. This is
`00-MASTER-PLAN.md` §6's own degraded-mode row: "FSM invoice → e-invoice/IRN | GST module
generates IRN + e-way bill | plain invoice PDF, GST fields still computed and stored."

**Only e-invoice auto-generates -- e-way bill stays manual-only, deliberately.** A real
e-way bill needs transport details (vehicle number, transporter id, distance) that don't
exist anywhere in this schema at the moment an invoice is issued (no shipment exists
yet) -- `fsm.jobs`/`core.documents`/inventory's own tables have nowhere to capture them.
Auto-triggering e-way-bill generation from `document.issued` alone would be fabricating
data no real GST flow has at that point either, so it's manual-only, same as this story's
own UI panel below offers.

**Manual UI**: `apps/web/components/gst/gst-document-panel.tsx` (a `Generate`/`Cancel`
panel for both document types, showing IRN/ack-no/e-way-bill-number/validity once
generated) is mounted on FSM's own invoice detail page only
(`apps/web/app/.../fsm/invoices/[invoiceId]/page.tsx` + `actions.ts`) -- lives at the
`apps/web` layer (the composition root, exempt from the contract-only restriction)
because neither `module-fsm`'s nor `module-inventory`'s own invoice-detail component may
import anything from `module-gst` beyond its `contract/`. **Inventory's own Sales Invoice
detail deferred**: it's a client modal (`invoices-list.tsx`/`invoice-detail.tsx`) whose
data-fetch-on-open flow would need its own follow-up to thread gst status through, unlike
FSM's own invoice detail (already a plain server-rendered page). The automatic
`document.issued` consumer already covers both regardless of which one has a manual UI.

**Deferred (documented, not silently dropped)**:
- **Print/CSV-export panels on Sales Invoices** -- still open from the original
  credentials-schema slice's own deferral; independent of the generation-history work
  above (doesn't touch GST at all, a plain export/print feature).
- **Barcode/QR scanning** -- SHOULD/LATER tier throughout the inventory port, never
  picked up; no camera-integration infrastructure exists anywhere in this platform yet,
  and CLAUDE.md's own development principles ("do not introduce a new dependency unless
  necessary", "never implement speculative functionality") argue against reaching for one
  just to close this checklist item.

New SQL-level test: `scripts/test-gst-generation-history-rls.mjs` (wired into `test:db`)
-- no-license-denies-read-and-write, grace-period still denies write but allows read,
viewer-without-`gst.generate`-denied, owner-allowed, the one-row-per-document constraint,
the cross-tenant `document_id`-smuggling trigger, tenant isolation on both tables, the
cancel-via-update flow, and confirming no delete policy exists at all.

Live-verified against the dev Supabase project inside one self-cleaning (rolled-back)
transaction: confirmed `gst.generate` permission seeding (owner + admin), inserted a
generated e-invoice row, confirmed the `unique(document_id)` idempotency guard rejects a
second row for the same document, confirmed the cross-tenant smuggling trigger rejects a
fabricated foreign `business_id` claiming a real `document_id`, and confirmed the
cancel-via-update flow. No assertion failures, zero residue after rollback. The actual
GSP HTTP call in `generateEinvoice`/`generateEwayBill`/their cancel counterparts was
**not** exercised live -- same documented gap as every other external-integration
mutation in this session (no live GSP sandbox is reachable from here).

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean (40
migrations); full `test`/`test:db` suites green (permission count now 43, up from 42 --
the new `gst.generate` row; including the new `test-gst-generation-history-rls.mjs`);
`npm run build --workspace=apps/web` succeeds; migration applied to the dev Supabase
project and live end-to-end verification as described above; Supabase security advisor
shows no new findings.

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
