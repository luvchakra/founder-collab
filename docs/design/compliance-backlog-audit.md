# WonderArc Compliance — P0/P1 Global Tax & Compliance Backlog — Audit Log

Dated record of every story implemented from "WonderArc Compliance Module — P0/P1 Global
Tax & Compliance Backlog" (uploaded 2026-09-11), scoped to `module-gst` only (renamed
user-facing to **Compliance**; technical package/schema name `gst` is preserved per
CLAUDE.md's locked architecture section, which names the module `gst` — a package/schema
rename is an architecture change requiring explicit user approval this run does not have).

Branch: `comply-backlog`, merged into `main` after each story, same fixed git sequence as
the prior cross-module integration backlog (`int-backlog`) and Discovery offering backlog
(`disc-offering-backlog`) runs. Per the user's instruction this run, stories are
implemented one after another automatically — only genuine architectural/irreversible
decisions are raised.

**Limitation noted once, applying to every story below**: there is no seeded demo user or
`apps/web/.env.local` in this environment, so a live authenticated browser walkthrough is
not possible for any story in this log. Verification for UI stories is: typecheck, lint,
a clean `next build` (which type-checks and prerenders every route, including every
Compliance page), the module's own vitest suite, and manual reading of the rendered JSX
against `docs/design/claude-ui-design-rules.md`. This mirrors exactly how the Discovery
offering backlog's own audit log has been documenting the same limitation.

## Progress

| Epic | Story | Title | Status |
|---|---|---|---|
| P0-01 | 01.1 | Rename GST UI to Compliance | Done |
| | 01.2 | Country Selector | Not started |
| | 01.3 | Tax Regime Selector | Not started |
| | 01.4 | Context Persistence | Not started |
| | 01.5 | Unsupported-Country UX | Not started |
| P0-02 | 02.1 | Tax Registration | Not started |
| | 02.2 | Tax Jurisdiction | Not started |
| | 02.3 | Versioned Tax Rules | Not started |
| | 02.4 | Tax Treatments | Not started |
| | 02.5 | Tax Determination Snapshot | Not started |
| P0-03 | 03.1 | Core Transaction Contract | Not started |
| | 03.2 | Inventory Tax Context | Not started |
| | 03.3 | FSM Tax Context | Not started |
| | 03.4 | Party Tax Context | Not started |
| | 03.5 | No Duplicate Masters | Not started |
| P0-04 | 04.1 | GSTIN Management | Not started |
| | 04.2 | GST Profile | Not started |
| | 04.3 | HSN/SAC | Not started |
| | 04.4 | Place of Supply | Not started |
| | 04.5 | GST Tax Determination | Not started |
| | 04.6 | GST Invoice Validation | Not started |
| | 04.7 | GST Rule Versioning | Not started |
| P0-05 | 05.1–05.6 | India E-Invoice | Not started |
| P0-06 | 06.1–06.4 | India E-Way Bill | Not started |
| P0-07 | 07.1–07.7 | India Returns | Not started |
| P0-08 | 08.1–08.6 | India Reconciliation & IMS | Not started |
| P0-09 | 09.1–09.5 | Compliance Calendar & Risk | Not started |
| P0-10 | 10.1–10.5 | Evidence & Audit | Not started |
| P0-11 | 11.1–11.5 | Compliance UI | Not started |
| P1-01 … P1-12 | — | (EU, US, Canada, Singapore, UAE, Saudi, ANZ, Asia, gov adapters, AI assistant, risk center, cross-module intelligence) | Not started |

**1 of ~50 in-scope P0 stories done.**

## Pre-implementation reconnaissance (done once, up front)

Before writing any code, inspected the existing `module-gst` implementation and the `gst`
Postgres schema, per the backlog's own rule 1 ("Inspect the existing module-gst
implementation before creating anything"):

- **`module-gst` is *not* a skeleton in practice**, despite the root `CLAUDE.md`
  describing it as one — an earlier slice (`S-2`/`SP-7`, Epic 6) already built a working
  vertical: GST profile (GSTIN/state/registration type, stored on
  `core.business_settings`), e-Invoice and e-Way Bill credential storage
  (`gst.eway_bill_credentials` / `gst.einvoice_credentials`, encrypted secrets, no SELECT
  grant at all — service-role only), e-Invoice/e-Way Bill generation history
  (`gst.einvoices` / `gst.eway_bills`, one row per document ever, append-only), a GSP
  (GST Suvidha Provider) HTTP adapter (`lib/gsp-client.ts`), a GST filing view (purchase
  register / sales register with CSV export, `core.documents`-sourced), a compliance
  dashboard, and a `contract/index.ts` (`getGstDocumentStatus`, `generateDocumentEinvoice`,
  `cancelDocumentEinvoice`, `generateDocumentEwayBill`, `cancelDocumentEwayBill`,
  `getChatContextSummary`, `getAlerts`) already consumed by FSM's invoice detail page and
  the platform dashboard's alert bell. **Live source of truth wins over the frozen
  `CLAUDE.md` sentence per the platform's own rule** — this is flagged here rather than
  silently reconciled.
- **Tenancy is already `business_id`-scoped**, matching this backlog's explicit
  instruction (unlike `module-discovery`'s `workspace_id`) — confirmed in
  `lib/tenancy/queries.ts` (reads `core.businesses` by `business_id`) and every `gst.*`
  migration (`gst.eway_bill_credentials.business_id`, etc., all FK'd to
  `core.businesses`).
- **The module-registry entry already renamed the product to "Compliance"**
  (`packages/module-registry/src/index.ts`: `key: "gst", name: "Compliance", icon:
  "Receipt", routePrefix: "/gst"`), and so did the module's own breadcrumb
  (`gst/layout.tsx`'s `MODULE_NAME`) and dashboard page title ("Compliance dashboard").
  So COMPLY-P0-01.1 was already substantially done by that earlier slice — what remained
  was a handful of leftover literal `"GST"` strings that name the *module/product*
  (not the *tax*) in places the registry rename didn't reach. See the 01.1 story log
  entry below for the exact list.
- **Existing GST data model, relevant to future stories (02–04)**:
  - `core.business_settings.gstin` / `.state` / `.gst_registration_type` — the
    business's *own* single GSTIN. One row per business, no history, no support for a
    business with GST registrations in more than one state.
  - `core.tax_identities` (keyed by `party_id`) — a *customer/supplier's* GSTIN, for
    computing CGST/SGST vs. IGST on documents against that party. Also single-row,
    no effective-dating.
  - Neither of these is the generic, versioned, multi-registration `TaxRegistration`
    entity §4/§2.1 of this backlog calls for (multiple GSTINs per business, effective
    dates, source references, non-India regimes). COMPLY-P0-02.1/COMPLY-P0-04.1 will need
    a new `gst`-schema table for that — **not** a duplicate of `core.tax_identities`
    (that table's job, a party's own GSTIN for CGST/SGST-vs-IGST splitting, is unaffected
    and will keep being read, not replaced) but a genuinely new concept (the *filing
    business's own* registrations, plural, versioned) that only `core.business_settings`
    partially and singularly covers today. This will be flagged again, concretely, when
    COMPLY-P0-02.1 is implemented.
  - `core.items` already carries an HSN/tax-rate-shaped slice per the entity-ownership
    map ("Price / tax rate / HSN | on `core.items` + `core.tax_rates`") — COMPLY-P0-04.3
    (HSN/SAC) and COMPLY-P0-02.3 (Versioned Tax Rules) must read/extend this, not create a
    second item-classification table.
- **No `docs/plan/00-MASTER-PLAN.md` §5 rows yet for this backlog's own new generic
  concepts** (`TaxRegistration`, `TaxRegime`, `TaxJurisdiction`, `TaxRule`, `TaxRate`,
  `TaxTreatment`, `TaxDetermination`, `ReturnDefinition`/`ReturnPeriod`/
  `ReturnSubmission`, `Reconciliation`, `ComplianceIssue`, `ComplianceDeadline`,
  `ComplianceEvidence`, `GovernmentConnection`) — expected, since that document predates
  this backlog. This backlog's own §5 "Data ownership" section assigns all of these to
  Compliance (`gst` schema) and explicitly warns against duplicating a transaction/
  customer/product master inside it, which is the same discipline `00-MASTER-PLAN.md` §5
  already enforces platform-wide. Each new table created under this backlog will note, in
  its own migration's comment header, which of these ownership rules it satisfies.

## Story log

### 01.1 — Rename GST UI to Compliance (2026-09-11)

**What was found**: per the reconnaissance above, the module-registry name, module
breadcrumb, and dashboard page title already said "Compliance" from an earlier slice.
The remaining literal `"GST"` strings that name the *module/product itself* (as opposed
to the many correct, kept-as-is domain terms — GSTIN, CGST/SGST/IGST, GSTR-1/3B/9,
GST Suvidha Provider, "GST profile"/"GST Filing" as specific India-regime feature names
within the Compliance module) were:

- `apps/web/components/settings/pricing-tiers.tsx` — marketing copy: "GST module not
  included" / "Basic GST to get compliant" / "Full GST -- complete compliance suite" on
  the Free/Pro/Max plan cards, plus a doc-comment mentioning "CRM/GST tiers".
- `apps/web/app/layout.tsx` — site `<meta description>`: "...CRM and GST in one portal."
- `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/inventory/team/page.tsx` —
  the Team & Permissions page's per-module section-heading map (`MODULE_LABEL`), used to
  group permission rows by module: `gst: "GST"`.
- `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/fsm/invoices/[invoiceId]/actions.ts` —
  the `MODULE_NOT_LICENSED` error surfaced to the user: "GST module is not licensed for
  this business."
- `apps/web/app/(dashboard)/dashboard/settings/page.tsx` — the business quick-links row's
  chip label "GST profile" (alongside "Team & permissions", "API keys").
- `apps/web/components/gst/gst-document-panel.tsx` — the invoice-detail panel heading
  "GST compliance" (this panel is generic document-status UI mounted on FSM's invoice
  detail page; it will need to speak for other regimes' e-invoicing eventually, per P1, so
  the heading is now just "Compliance").

**What was built**: the six edits above, each swapping the module/product name for
"Compliance" while leaving every genuine GST/India tax-domain term untouched (GSTIN,
CGST/SGST/IGST, GST Suvidha Provider/GSP, GSTR-1/2B/3B/9, the "GST profile"/"GST Filing"
*feature* names inside the Compliance module's own India-GST sub-pages, and the
`gst.generate` permission key / `gst` schema / `@cofounderai/module-gst` package / `/gst`
route prefix, all of which are technical identifiers this backlog explicitly says to
preserve). No schema change, no new table, no new dependency.

**How verified**:
- `npm run typecheck` — clean across all 7 workspaces (`web`, `core`, `module-crm`,
  `module-discovery`, `module-fsm`, `module-gst`, `module-inventory`, `module-registry`).
- `npm run lint` — 0 errors; 1 pre-existing warning in an unrelated file
  (`crm/conversations/page.tsx`, unused `Package` import), untouched by this story.
- `npm run lint:boundaries` — 979 files scanned, 0 violations.
- `npm run lint:migrations` — 102 migration files checked, 0 violations (no migration
  touched by this story).
- `npm run test --workspace=@cofounderai/module-gst` — 7 tests passed (unchanged; this
  story touched no module-gst source, only `apps/web`).
- `cd apps/web && npm run build` — clean production build; every Compliance route
  (`/gst/dashboard`, `/gst/einvoicing`, `/gst/eway-bill`, `/gst/filing`, `/gst/profile`)
  compiles and is listed in the route manifest.
- No live browser walkthrough — see the limitation note above.
- **Environment note**: this worktree had no `node_modules` installed at session start
  (a fresh git worktree checkout, not the primary repo checkout, which does have one).
  `npm install` was run once against the existing `package-lock.json` to get a real
  dependency tree for typecheck/lint/build to mean anything (with no `node_modules`,
  `tsc`/`eslint` silently resolved from a *global* toolchain install and reported false
  "no errors" without actually seeing any workspace's dependencies). The install surfaced
  one pre-existing, unrelated lockfile drift line (`module-crm`'s `package.json` already
  declares a `zod` dependency the committed lockfile didn't yet reflect) — reverted via
  `git checkout -- package-lock.json` before committing, per this run's "don't commit
  unrelated lockfile drift" instruction. `node_modules` itself is untracked/gitignored and
  not part of any commit.
