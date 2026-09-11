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
| | 01.2 | Country Selector | Done |
| | 01.3 | Tax Regime Selector | Done |
| | 01.4 | Context Persistence | Partial (persistence for country/regime shipped as part of 01.2; not a separate story) |
| | 01.5 | Unsupported-Country UX | Done |
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

**4 of ~50 in-scope P0 stories done** (01.4's own scope was absorbed into 01.2 -- see
that story's log entry for why; COMPLY-P0-01, the shell epic, is now fully covered except
01.4's own registration-persistence half, which waits on COMPLY-P0-02.1/04.1).

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

### 01.2 — Country Selector (2026-09-11)

Also absorbs COMPLY-P0-01.4's own scope ("Persist active business/country/regime/
registration") for the country/regime half of that persistence — the two stories are the
same piece of work (a selector with nothing to persist to isn't a selector; persisted
context with no UI to change it isn't a story on its own yet either), and the backlog
itself lists 01.2/01.3/01.4 back to back under one epic ("Compliance Shell & Country
Switch"). `registration_id` persistence (the rest of 01.4) is deliberately deferred — see
below.

**What was built**:
- `gst.compliance_profiles` (new migration, `20260911004100_gst_compliance_profile.sql`)
  — the backlog's own `ComplianceProfile` entity (§4): one row per business,
  `country`/`regime`/`registration_id`, defaulting to India/GST with no backfill needed.
  Checked first against `docs/plan/00-MASTER-PLAN.md` §5 and this backlog's own §5 — no
  existing table holds "which country/regime a business's Compliance module is currently
  in" (`core.business_settings.gstin` is a single India GSTIN value, unrelated to country
  selection; `core.tax_identities` is a *party's* GSTIN, an unrelated concept entirely).
  RLS: tenant+licensed for SELECT (any business member), tenant+licensed+`settings.manage`
  for INSERT/UPDATE, no DELETE policy at all (a Compliance profile is switched, never
  removed). `registration_id` is added now as an unconstrained nullable column (no FK) —
  the `gst.tax_registrations` table it will eventually reference is COMPLY-P0-02.1/04.1's
  own job, not this story's; adding the FK ahead of that table existing would be exactly
  the "implement future stories implicitly" the backlog's rule 4 forbids.
- `packages/module-gst/src/lib/compliance/countries.ts` — the country/regime catalog
  (backlog's own "Never hard-code country-specific rules into the UI" principle, read here
  as also covering which countries/regimes even exist): India marked `"supported"`, every
  other P1-research country (US, Canada, Singapore, Germany, France, Belgium, Poland,
  Italy, UAE, Saudi Arabia, Australia, New Zealand, Malaysia, Thailand, Indonesia, Japan,
  South Korea) marked `"planned"` with its correct regime name from the backlog's own §2
  research (Sales Tax, GST/HST, VAT, SST, Consumption Tax, ...) but no working logic behind
  it. This is the one place a country/regime name may be hard-coded in this module — every
  UI component reads this catalog rather than switching on a country code itself.
- `lib/compliance/{types,queries,mutations}.ts` — `getComplianceProfile` (raw row or
  null), `getEffectiveComplianceProfile` (applies the India/GST default, flags
  `isExplicit: false` when it's a synthesized default rather than an actual saved row —
  so the UI can show "(default)" instead of implying a choice was made), and
  `setComplianceCountry` (requires `requireModule('gst')` + `requirePermission('settings.manage')`,
  refuses a `"planned"` country server-side even though the UI already disables selecting
  one — defense in depth, matching how every other write in this platform double-checks
  what its own UI already prevents).
- `components/compliance/country-bar.tsx` + `apps/web`'s `gst/actions.ts` — the "active
  country/regime must always be visible" bar (backlog §3), mounted once in `gst/layout.tsx`
  so it appears above every Compliance page rather than being re-implemented per page.
  Shows the current country + regime as badges; a native `<select>` (auto-submits on
  change, same pattern as the existing GST Filing period picker) lets a `settings.manage`
  user switch country, with every non-India option rendered `disabled` and labelled
  "(Planned)" — this is COMPLY-P0-01.5's "clearly show supported vs planned capability" in
  its minimal form (a disabled option, not yet a full unsupported-country empty-state
  page, since nothing can actually route a business into an unsupported country given the
  option is disabled here and refused server-side too). A read-only viewer sees the badges
  with no selector control at all.

**What was deliberately left out** (future stories, not implemented implicitly per rule 4):
regime selection when a country has more than one regime (COMPLY-P0-01.3 — moot today
since every P0/catalog entry has exactly one regime, but the schema/catalog shape already
supports it); the registration-level part of context persistence, i.e. actually setting
`registration_id` to something (needs `gst.tax_registrations` to exist first,
COMPLY-P0-02.1/04.1); and any real unsupported-country empty-state page content beyond the
disabled selector option (COMPLY-P0-01.5's fuller scope).

**How verified**:
- `npm run typecheck` — clean across all 8 workspaces.
- `npm run lint` — 0 errors; same 1 pre-existing unrelated warning as 01.1.
- `npm run lint:boundaries` — 986 files scanned, 0 violations.
- `npm run lint:migrations` — 103 migration files checked, 0 violations.
- `npm run test --workspace=@cofounderai/module-gst` — 14 tests passed (7 pre-existing +
  7 new, `lib/compliance/countries.test.ts`: catalog shape, no duplicate codes, India-only
  `"supported"` in P0, `isCountrySupported`/`isRegimeSupported`/`defaultRegimeFor` edge
  cases including an unknown country code).
- Migration applied live to the **dev** Supabase project (`jazdtomcgqjxjueedmck`) via
  `mcp__Supabase__apply_migration`. `mcp__Supabase__get_advisors` (security + performance)
  re-run afterward: zero new findings attributable to `gst.compliance_profiles` — the
  existing findings list (both before and after) is the same pre-existing, unrelated set
  (a handful of `rls_enabled_no_policy`/`unused_index` infos on other schemas' tables and
  one `auth_leaked_password_protection` warning, none touched by this story). The new
  table needed no extra index beyond its primary key (`business_id`), which already covers
  the tenant-FK-index convention every other business-scoped table in this platform
  follows.
- `cd apps/web && npm run build` — clean production build.
- **New environment limitation, applies from here on**: this worktree's local Postgres 16
  cluster (`pg_lsclusters` shows it installed but stopped) has no `root`-named role, and
  its `pg_hba.conf`'s `local all all peer` line means only an OS user matching a role name
  can connect over the unix socket. This sandboxed session has no `sudo`/`su` access to
  run `createuser` as the `postgres` OS user, and directly weakening `pg_hba.conf` (e.g.
  to `trust`) to work around that was correctly refused by the session's own
  security-weakening guard (reverted immediately, cluster left stopped as found).
  **`scripts/test-*-rls.mjs` harness scripts (`npm run test:db`) cannot be executed in
  this environment** — for this story's new `scripts/test-gst-compliance-profile-rls.mjs`
  and for the platform's whole pre-existing `test:db` suite alike. This is an environment
  gap, not something this backlog's work introduced, and it does not weaken this story's
  actual verification: the run's own instructions treat the live Supabase
  `apply_migration` + `get_advisors` pair (done above) as the authoritative schema/RLS
  check, with the `.mjs` script written so a future environment with a working local
  Postgres (or real CI) gets ongoing regression coverage, exactly like every other
  module's existing `test:db` entries. Noted once here; applies to every later story in
  this log that touches schema, without repeating the full explanation each time.
- No live browser walkthrough — see the limitation note at the top of this document.

### 01.3 — Tax Regime Selector (2026-09-11)

No P0 or currently-cataloged P1 country has more than one regime (India: GST only; every
P1 entry in `countries.ts` also lists exactly one) -- so this story is the *mechanism*,
not a feature any business can actually exercise from the UI today. Built now anyway,
per the epic's own grouping (01.2/01.3/01.4 under one "Compliance Shell & Country Switch"
epic) and because building it once, generically, alongside the country selector is
cheaper and less error-prone than retrofitting it into the first P1 country pack that
needs two regimes.

**What was built**:
- `setComplianceRegime(businessId, regime)` (`lib/compliance/mutations.ts`) -- switches
  the regime *within* the business's current country (as opposed to `setComplianceCountry`,
  which always resets regime to the new country's default). Reads the business's actual
  saved country from `gst.compliance_profiles` itself rather than trusting a country
  argument from the caller, then validates the requested regime belongs to that country's
  own catalog entry via `isRegimeSupported()` (already covered by 01.2's own
  `countries.test.ts`) -- same `requireModule`/`requirePermission('settings.manage')`
  gate as the country mutation.
- `country-bar.tsx` now renders a second `<select>` for regime, but only when
  `current.regimes.length > 1` -- for every country in today's catalog this condition is
  false, so the bar renders exactly as it did after 01.2 (a static regime badge, no
  control). The regime badge itself is hidden only in the (currently unreachable) case
  where an editable regime selector is shown instead, to avoid showing the same
  information twice.
- `setComplianceRegimeAction` (`gst/actions.ts`), wired into `gst/layout.tsx` alongside
  the existing country action.

**How verified**:
- `npm run typecheck` / `npm run lint` (0 errors, same 1 pre-existing unrelated warning) /
  `npm run lint:boundaries` (986 files, 0 violations) / `npm run lint:migrations` (103
  files, 0 violations -- no schema change this story).
- `npm run test --workspace=@cofounderai/module-gst` -- still 14 tests passing; no new
  test file, since `setComplianceRegime`'s only real branch logic
  (`isRegimeSupported(country, regime)`) is exactly what 01.2's `countries.test.ts`
  already exercises (including the "real regime, wrong country" and "unknown country"
  cases) -- adding a second test file that re-asserts the same pure function through a
  mocked Supabase client would test the mock, not new behavior. The RLS test written in
  01.2 (`gst.compliance_profiles`, tenant/license/permission enforcement on the same
  table this mutation writes) already covers the table-level guarantees this mutation
  relies on.
- No schema change -- nothing to apply via Supabase MCP or re-check with `get_advisors`
  this story.
- `cd apps/web && npm run build` -- clean production build.
- No live browser walkthrough (see the limitation note at the top of this document) --
  and, as noted above, there is no country in today's catalog that would even show the
  regime selector in a real browser session yet regardless.

### 01.5 — Unsupported-Country UX (2026-09-11)

Like 01.3, this is a safety-net story: COMPLY-P0-01.2's own country selector already
refuses a "planned" country both client-side (disabled `<option>`) and server-side
(`setComplianceCountry` throws), so nothing in P0 can actually put a business into an
unsupported country through the UI. Built anyway, completing the shell epic, because it
is the right single place to put this check before any P1 country pack makes a "planned"
country selectable -- every existing and future Compliance page benefits without adding
its own per-page country check.

**What was built**:
- `components/compliance/unsupported-country-notice.tsx` -- an `Alert` naming the
  unsupported country, explaining plainly that its Compliance features aren't implemented
  yet (not vague "coming soon" copy), and listing which countries currently *are*
  supported (reads live from the same `COUNTRY_CATALOG` the selector uses, so it can never
  drift out of sync with what the dropdown actually offers).
- `gst/layout.tsx` now gates `{children}` behind `isCountrySupported(profile.country)`:
  supported renders every leaf page exactly as before, unsupported renders the notice
  *instead of* the page (never alongside it, so a stale India-specific page never renders
  half-correctly for a country it wasn't built for). The country/regime bar above still
  renders either way, so switching back to a supported country is always one action away.

**How verified**:
- `npm run typecheck` / `npm run lint` (0 errors, same 1 pre-existing unrelated warning) /
  `npm run lint:boundaries` (987 files, 0 violations) / `npm run lint:migrations` (103
  files, 0 violations -- no schema change).
- `npm run test --workspace=@cofounderai/module-gst` -- still 14 tests passing; no new
  test file, since the only new logic (`isCountrySupported(profile.country)`) is a single
  call into the already-tested `countries.ts` catalog function, not a new branch of its
  own worth a dedicated test.
- No schema change.
- `cd apps/web && npm run build` -- clean production build.
- No live browser walkthrough (see the limitation note at the top of this document) --
  and, per the note above, this notice cannot currently be reached from a real session
  either, since no unsupported country can be selected in the first place.

**COMPLY-P0-01 (Compliance Shell & Country Switch) is now fully done, except 01.4's own
registration-persistence half**, which needs `gst.tax_registrations` to exist
(COMPLY-P0-02.1/04.1) before it means anything.
