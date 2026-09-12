# Test cases: `gst` (Compliance)

Covers `packages/module-gst/src/**`. Originally split out from `inventory` (`1bd4b2d`);
the module's display name is now "Compliance" (CLAUDE.md non-negotiable #1: key/schema/
`routePrefix` stay `gst`). What began as India-only GST has since grown, via the
WonderArc Global Tax & Compliance backlog (`docs/design/compliance-backlog-audit.md`),
into a generic **country/regime + versioned tax-rules engine** now covering India GST
(P0, complete), EU VAT for five member states (P1), and US sales tax + 1099 information
returns (P1). Per `TESTING_STRATEGY.md` §4.4 this stays ONE file (one file per module,
regardless of how many country packs it contains) — sectioned below by regime, mirroring
the architecture itself (one generic engine, country packs are content, not code).

Numbering is sequential and never reused across sections.

## Cross-cutting / platform (shell, licensing, boundary, sidebar UI)

### TC-GST-001: e-Way Bill and e-Invoicing credentials are encrypted and business-scoped
**Feature:** `b857eb3` — credential settings forms, `test-gst-credentials-rls.mjs` covers RLS.
**Priority:** P0 · **Story:** post-split settings
**Steps:**
1. Save e-Way Bill/e-Invoicing credentials for Business A.
2. Inspect the stored value directly in the database.
**Expected result:** Encrypted at rest (same standard as BYOK keys in `core.crypto`) —
not plaintext.

### TC-GST-002: GST Filing generation history records a successful attempt — a failed one is not recorded at all
**Feature:** `b2a6f6d` — generation-history tables + `document.issued` consumer.
**Priority:** P0 · **Story:** S-2
**Correction:** `gst.einvoices`/`gst.eway_bills`' own check constraint only allows
`status in ('generated', 'cancelled')` — there is no `'failed'` state. A thrown error
exits before the insert runs, so a failed attempt leaves zero trace today. **Re-confirmed
three separate times since** by COMPLY-P0-05.4/05.6/10.2 and COMPLY-P0-09.5 (see
TC-GST-035/059 below) — this is a real, recurring, still-open gap, not a one-off.
**Steps:**
1. Configure valid e-Invoicing credentials, issue an invoice, trigger generation.
2. Check `gst.einvoices` for that document.
3. Configure credentials pointing at a GSP endpoint that returns an error (or omit
   credentials entirely), trigger generation again for a different document.
4. Check `gst.einvoices` for that second document.
**Expected result:** Step 2 finds exactly one row, `status = 'generated'`. Step 4 finds
**no row at all**.
**If a real audit trail of failed attempts is wanted later:** needs a schema change (a
`'failed'` status, or a separate attempts-log table) — flagged, not built speculatively.
**Automated coverage:** `scripts/test-gst-generation-history-rls.mjs`, `gsp-client.test.ts`.

### TC-GST-003: Manual generate/cancel UI matches the recorded history state
**Feature:** S-2's manual generate/cancel actions.
**Priority:** P1 · **Story:** S-2
**Steps:**
1. Manually cancel a previously generated filing.
**Expected result:** Generation-history reflects the cancellation; re-generating
afterward creates a new history entry rather than mutating the cancelled one.

### TC-GST-004: Inventory sales invoices call GST via contract, not direct import
**Feature:** Cross-module boundary enforcement (ADR non-negotiable #3).
**Priority:** P0 · **Story:** post-split
**Steps:**
1. Search `module-inventory`'s source for any import reaching into
   `module-gst/src/lib/**` or `src/db/**` directly (not `src/contract`).
**Expected result:** None found — `lint:boundaries` already catches this in CI.

### TC-GST-005: GST module degrades gracefully when not licensed
**Feature:** ADR-10, applied to the FSM/inventory→GST handoffs.
**Priority:** P0 · **Story:** ongoing
**Steps:**
1. With `gst` not licensed, issue an invoice from `fsm` or `inventory` that would
   normally trigger GST filing.
**Expected result:** Invoice issues normally; the contract call returns
`MODULE_NOT_LICENSED` and the caller proceeds without error.

### TC-GST-006: The module's sidebar scope stays complete under its current "Compliance" name
**Correction (this pass):** now **9** nav items across **3** groups, not 5 across 2 —
`packages/module-registry/src/index.ts`'s `gst` entry: "Overview" (Dashboard); "GST"
(GST Registrations, GST Profile, e-Way Bill, e-Invoicing, GST Filing, Reconciliation);
"Records" (Evidence, Audit Log). Traces to COMPLY-P0-04.1 (Registrations), COMPLY-P0-08.6
(Reconciliation), COMPLY-P0-10.1 (Evidence), COMPLY-P0-10.3 (Audit Log).
**Priority:** P2 · **Story:** af7a35b, extended by COMPLY-P0-04.1/08.6/10.1/10.3
**Steps:**
1. Confirm all 9 documented sidebar menu items for Compliance are reachable and none 404.
**Expected result:** All 9 present and functional.
**Automated coverage:** `apps/web/tests/menu-routes.test.ts` — generic, registry-driven,
already self-updates whenever this list changes; only the *description* here drifts.

### TC-GST-007: A failed GSP call surfaces a clean, actionable message — not a raw URL and HTTP status
**Feature:** `packages/module-gst/src/lib/gsp-client.ts#callGsp`.
**Priority:** P0 · **Story:** error-message audit
**Steps:**
1. Call `callGsp` against a URL returning HTTP 401/403.
2. Call it against a URL returning another non-2xx status (e.g. 500).
3. Call it against an unreachable host.
4. Call it against a URL returning HTTP 200 with a non-JSON body.
**Expected result:** Each throws a distinct, actionable `Error` with no request URL in it.
**Automated coverage:** `packages/module-gst/src/lib/gsp-client.test.ts`.

### TC-GST-008: Breadcrumbs read "Business / Compliance," matching inventory/fsm's generic pattern
**Priority:** P2 · **Story:** UX pass (regression)
**Steps:**
1. Navigate to any Compliance page for a business and read the breadcrumb trail.
**Expected result:** Exactly "Business / Compliance" — no business-specific name, no
"Control Center"/"Executive Dashboard" crumb.

### TC-GST-009: Notification bell surfaces GSTIN risk platform-wide, not just from inside Compliance
**Feature:** `contract/index.ts#getAlerts`.
**Priority:** P2 · **Story:** UX pass
**Steps:**
1. With `gst` licensed and at least one supplier/customer this month missing/holding an
   invalid GSTIN, open the topbar notification bell from any module's page.
2. Repeat with `gst` unlicensed.
**Expected result:** Step 1 shows one alert (`getComplianceDashboard()`'s `riskCount`,
linking to `/gst/filing`). Step 2 contributes nothing.
**Open gap (not yet closed):** `getAlerts` still only surfaces this one figure — it has
NOT been extended to surface any of COMPLY-P0-09.5's six Risk Dashboard signal kinds
(see TC-GST-059/060).

### TC-GST-010: A `settings.manage` user can switch Compliance country/regime; a viewer cannot; a "planned" country is refused
**Priority:** P0 · **Story:** COMPLY-P0-01.2/01.3
**Steps:**
1. As `settings.manage`, switch `gst.compliance_profiles.country`/`regime` for a business.
2. As a viewer-only role, attempt the same.
3. Attempt to select a country/regime the catalog marks `status: "planned"`.
**Expected result:** (1) succeeds. (2) denied server-side, not just hidden in the UI.
(3) refused by the mutation layer (`isCountrySupported`/`isRegimeSupported`), not merely
hidden — defense in depth.
**Covers:** `gst.compliance_profiles` RLS, `lib/compliance/countries.ts`.

### TC-GST-011: Selecting a "planned" country renders the unsupported-country notice instead of every Compliance page
**Priority:** P1 · **Story:** COMPLY-P0-01.5
**Steps:**
1. Select a `status: "planned"` country/regime for a business.
2. Visit any Compliance page.
3. Switch back to a `"supported"` country.
**Expected result:** Step 2 shows the unsupported-country notice everywhere, never
alongside a normal page. Step 3 restores normal pages.

### TC-GST-012: `gst.compliance_profiles` has no DELETE policy — a profile is only ever switched, never removed
**Priority:** P2 · **Story:** COMPLY-P0-01.2
**Covers:** `scripts/test-gst-compliance-profile-rls.mjs`.

## Generic tax-rules engine (cross-regime — exercised by every regime section below)

### TC-GST-013: Tenant isolation, permission gating, and the one-primary-registration invariant on `gst.tax_registrations`
**Priority:** P0 · **Story:** COMPLY-P0-02.1
**Steps:**
1. As Alice's business, create/promote/retire a tax registration.
2. As Bob's business, attempt to read/write Alice's registration rows.
3. Attempt to mark two registrations primary for the same business/country/regime.
**Expected result:** (1) succeeds via `createTaxRegistration`/`setPrimaryTaxRegistration`/
`setTaxRegistrationStatus`. (2) zero rows / denied. (3) rejected — at most one primary
per business/country/regime; a retired registration is status-flagged, never deleted.
**Covers:** `scripts/test-gst-tax-registrations-rls.mjs`.

### TC-GST-014: `getEffectiveTaxRule(asOf)` correctly resolves the version in effect on either side of a real cutover date
**Priority:** P0 (the engine every regulatory-fact case in this file depends on) ·
**Story:** COMPLY-P0-02.3
**Steps:**
1. Publish version 1 of a rule effective from date A; supersede it with version 2
   effective from date B (`publishTaxRule`/`supersedeTaxRule` — closes v1's
   `effective_to` at v2's `effective_from`).
2. Query `getEffectiveTaxRule` for a date just before B, on B, and after B.
**Expected result:** Just-before-B and on-B/after both resolve to the correct version;
no gap, no overlap.
**Covers:** `gst.tax_rules`, `scripts/test-gst-tax-rules-rls.mjs`.

### TC-GST-015: Known, deliberately unfixed limitation — two null-jurisdiction rows of the same lineage don't collide
**Priority:** P2 (documented limitation) · **Story:** COMPLY-P0-02.3, re-confirmed live by
COMPLY-P1-01.6/02.5/02.7
**Steps:**
1. Insert two `gst.tax_rules` rows with identical `(country, regime, rule_key, version)`
   and `jurisdiction = null`.
**Expected result:** Both insert successfully — the plain `unique(...)` index does not
catch this, since Postgres treats `NULL <> NULL`. **Open, currently-triggerable** — flag
before assuming this table's own uniqueness is airtight. (COMPLY-P1-02.7 hit exactly this
gap live and fixed it locally for `gst.return_periods` via a `coalesce(...)`-based
expression index — see TC-GST-079 — but `gst.tax_rules` itself remains unfixed.)

### TC-GST-016: `gst.tax_rules` has no write grant to `authenticated` — every write goes through `service_role`
**Priority:** P1 · **Story:** COMPLY-P0-02.3

### TC-GST-017: `gst.tax_determinations` is append-only; INSERT requires only module licensing, not `settings.manage`
**Priority:** P0 · **Story:** COMPLY-P0-02.5
**Steps:**
1. As a licensed viewer (no `settings.manage`), record a tax determination.
2. Attempt to UPDATE or DELETE an existing determination row, as any role.
**Expected result:** (1) succeeds — intentional, this is a read-derived computation, not
a settings change. (2) rejected — a recompute writes a new, later snapshot instead.
**Covers:** `scripts/test-gst-tax-determinations-rls.mjs`.

### TC-GST-018: The eight-code tax treatment vocabulary is fixed and closed
**Priority:** P2 · **Story:** COMPLY-P0-02.4
**Expected result:** `standard`/`reduced`/`zero_rated`/`exempt`/`out_of_scope`/
`reverse_charge`/`export`/`import` — validated in application code, not a DB enum.

## Existing-data integration (cross-module contracts)

### TC-GST-019: No future `gst` migration may create a table sharing a name with a `core`-owned master
**Priority:** P1 · **Story:** COMPLY-P0-03.5
**Covers:** `scripts/lint-gst-no-duplicate-masters.mjs` + its own fixture test. Correctly
stays silent on `discovery.products`' unrelated, pre-existing reuse of a reserved-sounding
name.

### TC-GST-020: FSM tax context is deliberately partial — no FSM-schema field beyond a job-id resolution
**Priority:** P2 (documents a real, open cross-module wiring gap) · **Story:** COMPLY-P0-03.3
**Expected result:** `getFsmJobReference` resolves `core.documents.source_ref` to a job
id only; service type/status/address aren't readable because `module-fsm`'s own contract
exposes no matching read yet.

### TC-GST-021: Party tax context distinguishes "no tax identity on file" from "explicitly unregistered"
**Priority:** P1 · **Story:** COMPLY-P0-03.4
**Expected result:** A caller must never collapse "no `core.tax_identities` row" (unknown)
into a default treatment the same way as an explicit "unregistered" row.

## India — GST

### Registrations & Profile

### TC-GST-022: Promoting a primary India GSTIN registration mirrors onto `core.business_settings`
**Priority:** P0 (cross-module data-integrity behavior) · **Story:** COMPLY-P0-04.1
**Steps:**
1. Add and promote a primary India GSTIN registration for a business.
2. Check `core.business_settings.gstin`/`state`.
3. Manually edit the legacy Profile form's GSTIN field.
**Expected result:** (2) mirrored automatically — `module-inventory`/`module-fsm`'s
existing CGST/SGST-vs-IGST math picks it up with zero code changes on their side. (3)
does NOT flow back onto the registration — the mirror is one-way, India/GST-only.
**Covers:** `shouldMirrorToBusinessSettings`/`mirrorPrimaryGstinToBusinessSettings`.

### TC-GST-023: GST registration profile fields round-trip through `metadata`; "unregistered" is rejected here
**Priority:** P2 · **Story:** COMPLY-P0-04.2
**Expected result:** Regular/composition, return frequency, self-declared e-invoice
eligibility all persist in `gst.tax_registrations.metadata`. A registration row can never
mean "unregistered" — that's the legacy form's own third option, deliberately not
representable here.

### TC-GST-024: HSN/SAC structural validation is kind-aware; never claims a specific code is currently assigned
**Priority:** P1 · **Story:** COMPLY-P0-04.3
**Steps:**
1. Validate an item with `kind: "good"`/`"part"` (needs HSN), `"service"` (needs SAC),
   and `"labour"`/`"expense"` (needs neither).
**Expected result:** Structural shape only — never a claim that a specific commodity
code is currently correct/assigned.
**Covers:** `lib/inventory-tax-context/hsn-sac.ts`.

### Place of Supply & Line Tax

### TC-GST-025: Place-of-supply classification is a backward-compatible superset of the existing state-code comparison
**Priority:** P0 · **Story:** COMPLY-P0-04.4
**Steps:**
1. Classify a supply with a buyer country clearly not India — expect `"export"`.
2. Classify with an unset/unknown buyer country — expect fall-through to state-code
   comparison, never a silent "assume domestic."
3. Classify an SEZ-destined supply.
**Expected result:** (1)/(2) as above. (3) has **no classification at all** — a named,
open data-model gap (no field anywhere records SEZ status).
**Covers:** `determinePlaceOfSupply`, `getPlaceOfSupplyForParty`.

### TC-GST-026: GST line tax determination applies export → reverse-charge → zero-rated → standard, in that precedence
**Priority:** P0 · **Story:** COMPLY-P0-04.5
**Steps:**
1. Determine tax for lines matching each precedence rung, and one whose place of supply
   is unresolvable.
**Expected result:** Correct precedence; a real intra-state CGST+SGST vs. inter-state
IGST split via `computeLineGst`; an *incomplete* (`treatment: null`) result is persisted,
never suppressed.
**Covers:** `determineGstLineTax`, `recordGstLineTaxDetermination`.

### TC-GST-027: Three named, still-open simplifications in GST tax determination
**Priority:** P2 (documents accepted simplifications) · **Story:** COMPLY-P0-04.5
**Expected result:** No UTGST/cess modeling at all; a 0%-rated item is always
`zero_rated`, never `exempt` (no per-item exemption flag exists); SEZ supplies have no
classification (same gap as TC-GST-025).

### TC-GST-028: GST invoice field validation is necessary-but-not-sufficient — never claims legal compliance
**Priority:** P1 · **Story:** COMPLY-P0-04.6
**Expected result:** Checks invoice number/date, per-line HSN/SAC, resolvable place of
supply. A tax-split-vs-place-of-supply disagreement is always a warning, never a hard
error. Never renders the words "GST compliant."

### TC-GST-029: India's 2025 GST rate rationalization is a real, dated two-version lineage
**Priority:** P0 (a dated regulatory change historical invoices must keep validating
against) · **Story:** COMPLY-P0-04.7
**Steps:**
1. Validate an invoice dated before 22-Sep-2025 against the 0/5/12/18/28% slabs.
2. Validate one dated on/after 22-Sep-2025 against the 0/5/18/40% slabs.
3. Validate one whose rate matches neither.
**Expected result:** (1)/(2) validate correctly against their own era's slabs. (3) a
warning, never a hard error. Each seeded row's `source` carries the "verify against the
current, authoritative CBIC notification... this is reference content, not tax advice"
caveat — assert its presence, not just the numbers.
**Covers:** `lib/tax-rules/india-rate-slabs.ts`, `getEffectiveIndiaGstRateSlabs`,
`20260912000000_gst_tax_rules_india_rate_slabs_seed.sql`.

### E-Invoice

### TC-GST-030: E-invoice mandate determination — a real, dated threshold, never guessed downward
**Priority:** P0 (real regulatory threshold, "never understate an obligation" safety
property) · **Story:** COMPLY-P0-05.1
**Steps:**
1. Determine eligibility for turnover exactly at, just below, and just above the current
   ₹5-crore threshold (itself a two-version lineage, down from ₹10 crore).
2. Determine eligibility when the threshold rule or turnover figure can't be resolved.
3. Determine eligibility when `everCrossedThresholdHistorically` is declared `true` but
   current turnover is now below threshold.
**Expected result:** (1) exactly-at does not mandate (strict `>`). (2) `mandated: null`,
never a guessed `false`. (3) `true` wins outright regardless of current turnover.
**Covers:** `determineEinvoiceEligibility`, `20260912010000_..._einvoice_threshold_seed.sql`.
**Caveat:** no cross-GSTIN/PAN aggregate-turnover ledger exists — "ever exceeded" is
entirely self-declared; the fallback turnover estimate is an explicit proxy, not real AATO.

### TC-GST-031: E-invoice schema validation distinguishes "no tax identity on file" from "confirmed unregistered"
**Priority:** P1 · **Story:** COMPLY-P0-05.2
**Expected result:** Flags a missing seller GSTIN outright; flags a missing buyer GSTIN
for every place-of-supply treatment except export.

### TC-GST-032: `IrpAdapter`'s formalized `submit`/`status`/`cancel`/`fetch` behave identically to the pre-existing inline calls
**Priority:** P0 · **Story:** COMPLY-P0-05.3
**Steps:**
1. Call `submit`/`cancel` — compare to pre-refactor inline GSP calls.
2. Call `status`/`fetch` with no URL configured.
3. Call `cancelEinvoice` with no IRN on record.
**Expected result:** (1) identical behavior. (2) throws a clear "not configured" error,
not a silent failure. (3) refuses outright rather than sending a bad request.
**Covers:** `lib/irp-adapter/gsp-adapter.ts`, `lib/gsp-client.ts#callGspGet`.

### TC-GST-033: A successful e-invoice generation persists the full government response verbatim, alongside the extracted fields
**Priority:** P1 · **Story:** COMPLY-P0-05.4
**Expected result:** `gst.einvoices.raw_response` holds the unmodified response, never
instead of the four already-extracted identifiers (IRN/ack_no/ack_date/qr_code). A cancel
response is never captured, by design.

### TC-GST-034: The 30-day e-invoice reporting-deadline window uses `>=` at the ₹10-crore threshold — a deliberately different operator than the mandate's own `>`
**Priority:** P0 (two similarly-shaped thresholds use different comparators — pin this
down so a future refactor doesn't silently unify them) · **Story:** COMPLY-P0-05.5
**Steps:**
1. Determine the reporting deadline for turnover exactly at the ₹10-crore threshold
   (itself a two-version lineage, down from ₹100 crore).
2. Determine it when the rule or turnover figure is unresolved.
**Expected result:** (1) exactly-at IS restricted (`>=`, unlike the mandate's `>`). (2)
returns `"unknown"`, never `"not_restricted"`.
**Covers:** `determineEinvoiceReportingDeadline`.

### TC-GST-035: Combined e-invoice status always trusts an already-recorded row over a forward-looking projection
**Priority:** P1 · **Story:** COMPLY-P0-05.6
**Expected result:** A recorded `'generated'`/`'cancelled'` row always wins. Three of the
eight status codes (`submitted`/`rejected`/`failed`) are permanently unreachable today —
a failed/rejected generation attempt persists nothing (same gap as TC-GST-002/059) —
documented as deliberate, not a bug.
**Covers:** `determineEinvoiceStatus`.

### E-Way Bill

### TC-GST-036: E-way bill eligibility compares against the ₹50,000 Rule 138(1) threshold with strict `>`
**Priority:** P0 · **Story:** COMPLY-P0-06.1
**Expected result:** Exactly at threshold does not require one. Does not model
goods-category exemptions or state-specific intra-state threshold variation (e.g. West
Bengal) — a named, open gap.

### TC-GST-037: E-way bill validity-period computation resolves pre-/post-2021 rules by the movement's own date
**Priority:** P1 · **Story:** COMPLY-P0-06.2
**Steps:**
1. Compute validity for a movement dated before 1-Jan-2021 and one dated on/after.
**Expected result:** Pre: 100 km/day non-ODC. Post: 200 km/day non-ODC (ODC unchanged at
20 km/day either era).
**Covers:** `lib/eway-bill-movement/validity.ts`, `20260912070000_..._validity_seed.sql`.

### TC-GST-038: Once a real e-way bill is generated for a document, movement data locks until it's cancelled
**Priority:** P0 (a real, enforced lock preventing silent divergence from what was
actually filed) · **Story:** COMPLY-P0-06.2/06.4
**Steps:**
1. Generate an e-way bill for a document, then attempt to edit its movement record.
2. Cancel the e-way bill, then edit the movement record.
3. Attempt to point a movement record at another business's own document.
**Expected result:** (1) refused. (2) succeeds. (3) rejected by trigger — a cross-tenant
document-id-smuggling attempt, not just RLS.
**Covers:** `scripts/test-gst-eway-bill-movements-rls.mjs`, `isEwayBillGenerated`.

### TC-GST-039: `EwayBillAdapter`'s `updateVehicle`/`extend`/`status` fail clearly when unconfigured
**Priority:** P1 · **Story:** COMPLY-P0-06.3
**Expected result:** Throws "not configured" when the URL is unset; `extendEwayBill`
persists a new `validUpto` only when the government response actually included one.

### TC-GST-040: Eligibility/movement/generation are three separate facts, never collapsed into one verdict
**Priority:** P2 · **Story:** COMPLY-P0-06.4
**Expected result:** `getEwayBillDocumentLink` surfaces all three separately; eligibility
never gates `generateEwayBill` itself (a deliberate, still-open product decision).

### Returns

### TC-GST-041: GSTR-1 preparation classifies each outward document against the real, versioned B2C Large threshold
**Priority:** P0 · **Story:** COMPLY-P0-07.1
**Steps:**
1. Classify documents into B2B/B2C Large/B2C Others/CDNR/CDNUR for a period spanning the
   ₹1,00,000 threshold's own dated change (down from ₹2,50,000).
2. Classify a document with an unresolvable place of supply.
**Expected result:** (1) correct bucket per the threshold in effect on the document's own
date. (2) excluded, never misclassified. Every populated row/bucket carries its own real
`documentId(s)` for drill-down.
**Covers:** `getGstr1Return`, `classifyGstr1Document`, `aggregateGstr1`.

### TC-GST-042: GSTR-1's `notModeled` field itemizes every real table this platform cannot populate today
**Priority:** P1 · **Story:** COMPLY-P0-07.1
**Expected result:** Names 4B/4C (reverse-charge/e-commerce), 6A–6C (exports/SEZ/deemed-
exports), Table 8 (nil-rated/exempt), 9A/10 (amendments), 11 (advances), 13 (document
counts), 14/15 (e-commerce) — a documented limitation, never silently discovered later.

### TC-GST-043: GSTR-3B reuses GSTR-1's own outward-document read; ITC reconciliation is hard-typed `false` until it exists
**Priority:** P0 (this hard-typed `false` must not regress) · **Story:** COMPLY-P0-07.2
**Expected result:** Table 3.1/3.2 auto-populated from the same read GSTR-1 uses (matches
real GSTN practice). `Gstr3bItcSummary.reconciledWithGstr2b` is `false` on every result
until COMPLY-P0-08 reconciliation exists.

### TC-GST-044: GSTR-9 reuses GSTR-1/3B's own classification; a documented mid-year threshold-change limitation
**Priority:** P1 · **Story:** COMPLY-P0-07.3
**Expected result:** Resolving the B2C Large threshold once at financial-year-end (not
per-document-date) can misclassify invoices when a threshold change falls mid-year — a
named, real limitation.

### TC-GST-045: Return drill-down recomputes a row's reported amount directly from its source documents
**Priority:** P0 · **Story:** COMPLY-P0-07.4
**Steps:**
1. Reconcile a row, then mutate one of its source documents, then reconcile again.
2. Request drill-down for a document id that doesn't resolve.
**Expected result:** (1) catches the discrepancy with the correct signed diff (`"net"` vs
`"raw"` per row type). (2) a `missingDocumentIds` entry, never silently dropped.
**Covers:** `reconcileReturnRow`, `getReturnRowSourceDocuments`.

### TC-GST-046: `gst.return_periods` forward-only lifecycle — no skip-a-stage, no reject-back-to-draft
**Priority:** P0 · **Story:** COMPLY-P0-07.5
**Steps:**
1. Attempt to jump Draft → Approved directly.
2. Attempt to move Filed back to Draft.
3. Race two concurrent transition attempts on the same period.
4. Attempt to reach `validated`+ with no frozen snapshot.
**Expected result:** (1)/(2) rejected. (3) the stale one is rejected — every transition
re-reads current status immediately before writing. (4) impossible — DB check constraint.
**Covers:** `gst.return_periods`, `assertCanTransition`, `scripts/test-gst-return-periods-rls.mjs`.

### TC-GST-047: A lock trigger prevents altering an approved/filed period's defining content, even via a direct RLS-bypassing write
**Priority:** P0 (verified to hold even against `service_role`/superuser writes) ·
**Story:** COMPLY-P0-07.6
**Steps:**
1. As `service_role` (bypassing RLS entirely), attempt to alter `business_id`/
   `return_type`/period range/`snapshot`/`created_at` on an approved period.
2. As the same role, append a `status_history` entry.
**Expected result:** (1) rejected by `gst.enforce_return_period_lock`. (2) allowed.

### TC-GST-048: `markReturnPeriodFiled` never submits anything to a government system
**Priority:** P0 (a scope/safety boundary) · **Story:** COMPLY-P0-07.5
**Expected result:** Only records that a human already filed elsewhere — filing is a
consequential external action requiring explicit human authorization, never automated.

### TC-GST-049: Filing reference/payment status — fill-in-once, then immutable; payment amount can't be negative
**Priority:** P1 · **Story:** COMPLY-P0-07.7
**Steps:**
1. Attach an ARN to an already-"filed" period with none yet.
2. Attempt to change it to a different value.
3. Record a negative `payment_amount`.
**Expected result:** (1) succeeds. (2) rejected — immutable once set. (3) rejected.
`payment_status` defaults to `"not_applicable"` (correct for GSTR-1/9, no payment
obligation).
**Covers:** `recordReturnPeriodPayment`, `markReturnPeriodFiled`.

### Reconciliation & IMS

### TC-GST-050: GSTR-2B import — no SELECT grant on credentials; re-import replaces wholesale; malformed rows are skipped, not fatal
**Priority:** P0 · **Story:** COMPLY-P0-08.1
**Steps:**
1. Attempt to `SELECT gst.gstr2b_credentials` as `authenticated`.
2. Re-import a GSTR-2B statement already imported once.
3. Import a statement containing one malformed row alongside valid ones.
**Expected result:** (1) no grant exists at all. (2) old `gst.gstr2b_documents` deleted,
new set inserted. (3) the malformed row is skipped with a warning; the rest import.
**Covers:** `scripts/test-gst-gstr2b-rls.mjs`, `importGstr2bStatement`, `parseGstr2bJson`.

### TC-GST-051: Purchase-to-2B matching is deliberately SUPPLIER-level, not invoice-level
**Priority:** P0 (a scope limitation a reviewer must understand before trusting the
reconciliation) · **Story:** COMPLY-P0-08.2
**Steps:**
1. Match purchases for a supplier with no GSTIN on file.
**Expected result:** Excluded from `missing_in_2b` (structurally can't appear in 2B),
never miscounted — its spend is surfaced separately. No field anywhere captures a
supplier's own invoice number for a purchase order, so matching cannot be invoice-level.
**Covers:** `matchPurchasesTo2b`.

### TC-GST-052: Match explanation is a small, fixed, deterministic candidate-cause list — never an LLM call
**Priority:** P2 · **Story:** COMPLY-P0-08.3
**Expected result:** Presented as possibilities to check, never a diagnosis.

### TC-GST-053: A cross-reference trigger rejects an IMS action against another business's GSTR-2B document
**Priority:** P0 (a real tenant-isolation gap RLS alone does not close) · **Story:**
COMPLY-P0-08.4
**Steps:**
1. Attempt to record an IMS action against a document belonging to a different business,
   as a caller licensed for their own business.
2. Read an IMS action's status for a document with none yet.
**Expected result:** (1) rejected by trigger, not RLS alone. (2) `no_action` — its own
distinct value, never silently relabeled `accepted` before deemed acceptance applies.
**Covers:** `scripts/test-gst-ims-actions-rls.mjs`.

### TC-GST-054: ITC availability applies the real four-way precedence — GSTN-ineligible always wins
**Priority:** P0 · **Story:** COMPLY-P0-08.5
**Steps:**
1. Compute availability for a document GSTN itself flagged ineligible, even after the
   business explicitly accepted it via IMS.
2. Compute for a pending-action document.
**Expected result:** (1) never "available" regardless of acceptance. (2) excluded from
both available and rejected buckets.
**Covers:** `computeItcAvailability`.

### TC-GST-055: The reconciliation exception queue is additive-only; resolve/dismiss are terminal
**Priority:** P1 · **Story:** COMPLY-P0-08.6
**Steps:**
1. Re-sync exceptions for a business with one already-open exception still outstanding.
2. Resolve an exception, then attempt to resolve it again.
**Expected result:** (1) never auto-closes it. (2) rejected — terminal once decided.
**Covers:** `syncReconciliationExceptions`, `resolveException`/`dismissException`.

### Calendar & Risk

### TC-GST-056: Filing calendar resolves the QRMP Category X/Y split, falling back to the later date when unclassifiable
**Priority:** P1 · **Story:** COMPLY-P0-09.1
**Expected result:** Uses the business's own registered jurisdiction; when it can't be
classified, falls back to Category Y's LATER due date, never the earlier one.

### TC-GST-057: Filing reminders are idempotent across repeated cron runs
**Priority:** P1 · **Story:** COMPLY-P0-09.3
**Steps:**
1. Run the reminder sweep twice for the same (business, return_type, period, lead_days).
2. Run it for an already-`"filed"` period, and for one already overdue.
**Expected result:** (1) fires exactly once — unique constraint on
`gst.filing_reminders_sent`. (2) never fires in either case.
**Covers:** `scripts/test-gst-filing-reminders-sent-rls.mjs`, `pendingReminderLeadDays`.

### TC-GST-058: Overdue detection returns a genuine three-way result, never guessing on unknown state
**Priority:** P1 · **Story:** COMPLY-P0-09.4
**Steps:**
1. Check overdue status for a QRMP installment payment past due (no persisted status
   anywhere in the platform for this).
**Expected result:** `"unknown"`, never guessed either way as `"overdue"`/`"not_overdue"`.

### TC-GST-059: Risk Dashboard's six signal kinds are backed by real, already-persisted state; one is structurally unreachable
**Priority:** P0 · **Story:** COMPLY-P0-09.5
**Expected result:** No invented data. `"failed_submission"` is named in the type system
but can never fire today — no table records a failed generation attempt (same root gap
as TC-GST-002/035). Must never silently start "working" without a corresponding schema
change being separately verified.

### TC-GST-060 (update to TC-GST-009): The notification bell has NOT been extended to surface any Risk Dashboard signal
**Priority:** P2 · **Story:** open gap since COMPLY-P0-09.5
**Covers:** `contract/index.ts#getAlerts` vs. `lib/risk/queries.ts#getRiskDashboard`.

### Evidence & Audit

### TC-GST-061: Compliance evidence is a thin categorization layer over `core.attachments` — two real, open gaps named but not fixed here
**Priority:** P0 (real, currently-live gaps in shared `core` infrastructure) · **Story:**
COMPLY-P0-10.1
**Steps:**
1. Point a `gst.compliance_evidence` row's `attachment_id` at another business's own
   attachment.
2. As an unlicensed `gst` business member, create a `gst_*`-typed attachment via the
   generic `core.attachments` path.
3. Delete an attachment that a `compliance_evidence` row references.
**Expected result:** (1) rejected by cross-reference guard trigger. (2) currently
succeeds — `core.attachments`' own RLS has no license check at all (an open gap, not
`module-gst`'s to fix alone). (3) currently cascades and destroys the evidence — this
whole epic exists to keep evidence permanent, and this is a live risk to that guarantee.

### TC-GST-062: Government Response Store combines e-invoice/e-way-bill raw responses; a cancelled record always shows the GENERATE response
**Priority:** P2 · **Story:** COMPLY-P0-10.2
**Expected result:** Never a cancel confirmation — neither adapter's `cancel()` returns a
response body.

### TC-GST-063: Four new audit-trail triggers write to `core.audit_log`; an unrelated field change writes nothing
**Priority:** P1 · **Story:** COMPLY-P0-10.3
**Steps:**
1. Change `gst.return_periods.status`/`payment_status`, `gst.ims_actions`,
   `gst.reconciliation_exceptions.status`, `gst.tax_registrations.registration_status`.
2. Change an unrelated field on each.
**Expected result:** (1) one audit row each. (2) nothing.
**Covers:** `scripts/test-gst-audit-trail.mjs`.
**Known cosmetic gap:** the four new action/entity-type strings aren't registered in
`packages/core/src/audit/format.ts`'s label maps — rows don't appear as selectable
options in the audit-log UI's own Entity filter, though they still display unfiltered.

### TC-GST-064: `resolveRuleRefs` never pads a stale rule reference with a placeholder
**Priority:** P2 · **Story:** COMPLY-P0-10.4
**Expected result:** A stale/non-resolving rule id is simply absent from the result.

### TC-GST-065: Retention date is computed once at creation, never recomputed live; the appeal-extension is a documented gap
**Priority:** P0 (a real regulatory-accuracy caveat) · **Story:** COMPLY-P0-10.5
**Expected result:** 72 months from GSTR-9's own due date (CGST Act §36), fixed at
evidence-creation time — if the law is later amended, an already-computed row's retention
date does not silently drift. The "one year after final disposal, whichever is later"
appeal/investigation extension is deliberately unmodeled — the computed date is a floor,
not a ceiling.

### UI

### TC-GST-066: New lists follow the responsive table/card convention; status is always icon+text+color
**Priority:** P2 · **Story:** COMPLY-P0-11.1–11.5
**Expected result:** Risk Signals/Upcoming Filings/Evidence/Exceptions lists all follow
the platform's desktop-table/mobile-card convention; row actions only render for legal
transitions on that row (e.g. Resolve/Dismiss only on a still-`"open"` exception).

### TC-GST-067: An `"invalid_classification"` risk signal deliberately renders with no action button
**Priority:** P2 · **Story:** COMPLY-P0-11.4
**Expected result:** No cross-module or broken link — the item it names lives in
`module-inventory`'s own page, out of scope to deep-link into.

## EU — VAT (Germany, France, Belgium, Poland, Italy)

### TC-GST-068: Flipping a country from "planned" to "supported" alone makes it selectable, with zero component changes
**Priority:** P1 · **Story:** COMPLY-P1-01.1

### TC-GST-069: Seeded EU VAT rates carry an explicit "verify before production use" caveat; lookups before the anchor date return `null`
**Priority:** P0 (regulatory-fact-accuracy caveat) · **Story:** COMPLY-P1-01.2
**Steps:**
1. Look up a EU country's standard/reduced VAT rate before its seeded `effective_from`
   anchor date (2024-01-01, a deliberately conservative anchor, not each country's own
   true historical rate-change date — every primary source was unreachable this session,
   WebSearch-sourced secondary trackers only).
**Expected result:** `null`, never a guessed rate. Every seeded row's `source` carries the
caveat.

### TC-GST-070: A missing and an invalid buyer VAT ID are treated identically — never a silent B2B assumption
**Priority:** P0 · **Story:** COMPLY-P1-01.3/01.4
**Steps:**
1. Determine treatment for an intra-EU sale with a missing VAT ID, and with an
   unvalidated/invalid one.
**Expected result:** Both collapse to B2C — a wrongly zero-rated intra-EU supply is the
seller's own liability under EU law.

### TC-GST-071: EU VAT ID validation does real format+checksum checks; VIES itself is not actually functional
**Priority:** P0 (a business relying on this for VAT ID verification must know VIES
checking doesn't actually work yet) · **Story:** COMPLY-P1-01.5
**Steps:**
1. Validate VAT IDs for all five countries (format + checksum, not a bare regex).
2. Call `ViesAdapter`'s only implementation, `StubViesAdapter`.
**Expected result:** (1) correct. (2) always throws a clearly-labeled "unreachable"
error, never fabricating a valid/invalid result.

### TC-GST-072: Each of the four EU e-invoicing country mandates has its own independent, deliberately un-unified shape
**Priority:** P1 · **Story:** COMPLY-P1-01.6
**Steps:**
1. Determine mandate applicability for Germany (turnover threshold), France (company-size
   category), Belgium (no gating), Poland (three-tier turnover+carveout).
2. Determine applicability when the caller-declared fact each needs is itself unknown.
3. Call any of the four adapter stubs.
**Expected result:** (1) each shape is independent, not unified behind one interface. (2)
`applies: null`, never `false`. (3) throws a clearly-labeled unreachable error — no real
sandbox/credentials exist for any of the four.

## United States — Sales Tax & 1099

### TC-GST-073: US economic nexus correctly implements all three real threshold shapes and two dated rule removals
**Priority:** P0 (a real, dated multi-state regulatory change with three distinct
comparison shapes) · **Story:** COMPLY-P1-02.2
**Steps:**
1. Determine nexus for a revenue-only state, a revenue-OR-transactions state (either
   known-true prong alone proves nexus), and New York's revenue-AND-transactions (either
   known-false prong alone disproves it).
2. Determine nexus for Illinois before/after its 1-Jan-2026 removal of the
   transaction-count prong, and North Carolina before/after its 1-Jul-2024 removal.
**Expected result:** All three shapes resolve correctly; the dated rule change resolves
by the sale's own date.

### TC-GST-074: `gst.us_physical_nexus_facts` allows only one active declaration per business/state/presence-type, but permits a new one after the prior ends
**Priority:** P1 · **Story:** COMPLY-P1-02.3
**Steps:**
1. Declare a physical-presence fact, end it (`ended_at`), declare a new one for the same
   business/state/presence-type.
**Expected result:** Both coexist as distinct rows (partial unique index, not a plain
one) — a hard DELETE is never used.

### TC-GST-075: Registration-obligation determination treats economic and physical nexus as independent, alternative bases
**Priority:** P0 · **Story:** COMPLY-P1-02.4
**Steps:**
1. Determine obligation with economic nexus confirmed true, physical unknown.
2. Determine with both confirmed false.
3. Determine for one of the 5 NOMAD states (no state-level sales tax at all).
**Expected result:** (1) obligated (either basis alone proves it). (2) not obligated —
only when BOTH are confirmed false. (3) `false` outright, a structural fact.

### TC-GST-076: A confused-deputy trigger rejects a category classification pointed at another business's own item category
**Priority:** P0 · **Story:** COMPLY-P1-02.5
**Steps:**
1. Point `gst.item_category_tax_classifications.category_id` at another business's own
   `core.item_categories` row, with `business_id` correctly set to the caller's own.
2. Resolve tax treatment for a goods-like category (general/clothing/groceries) with no
   override row, and for a service-like category (SaaS/services) with none.
**Expected result:** (1) rejected by trigger. (2) goods-like falls back to the general
state rate; service-like reports `resolved: false` instead — no safe universal default
exists for services.

### TC-GST-077: Illinois' grocery-tax elimination is a real dated lineage; NY's clothing exemption is a documented, real overstatement
**Priority:** P0 (a concrete, currently-live overstatement of an exemption) · **Story:**
COMPLY-P1-02.5
**Steps:**
1. Resolve Illinois grocery tax before and on/after 1-Jan-2026 (1% → exempt).
2. Resolve a $150 clothing item sold into New York.
**Expected result:** (1) correct per the dated lineage. (2) reported exempt — this
platform resolves by item CATEGORY, not NY's real per-item $110 price threshold, so this
case is a documented, real overstatement of the exemption, not a bug to silently trust.

### TC-GST-078: Exemption certificate validity is a pure recomputation of revoked/date/expiry, never a stale precomputed boolean
**Priority:** P0 · **Story:** COMPLY-P1-02.6
**Steps:**
1. Point a certificate's `party_id`/`attachment_id` at another business's own row.
2. Check validity for a certificate that is revoked, expired, or not-yet-issued.
**Expected result:** (1) rejected by two independent confused-deputy triggers. (2) each
combination recomputed live by `isExemptionCertificateValid`, no hard DELETE — only
`revoked`.

### TC-GST-079: US sales tax returns reuse `gst.return_periods`' entire India-built lifecycle via a widened natural key
**Priority:** P0 (both the reuse and a specific bug-fix pattern deserve a case — a future
country pack could reintroduce the same regression) · **Story:** COMPLY-P1-02.7
**Steps:**
1. Create two national returns (e.g. GSTR-1) with `jurisdiction = null` alongside the
   widened key.
2. Create two US state returns for the same business/period, different states.
**Expected result:** (1) a naive plain-SQL unique constraint would NOT catch a duplicate
here (the exact NULL-uniqueness gap TC-GST-015 documents) — fixed via a
`coalesce(jurisdiction, '')`-based expression unique index; confirm a genuine duplicate
national return IS still rejected. (2) both coexist as separate rows — the whole point of
the schema change.
**Covers:** `scripts/test-gst-return-periods-rls.mjs`.

### TC-GST-080: A valid exemption certificate overrides product taxability outright — never the reverse
**Priority:** P0 · **Story:** COMPLY-P1-02.7 (the 02.5/02.6 integration point)
**Steps:**
1. Resolve a sale line for a customer with a valid, in-force certificate for that state.
2. Resolve a line whose taxability genuinely cannot be resolved.
**Expected result:** (1) exempt outright, overriding whatever `getUsProductTaxability`
would have said. (2) lands in a separate `unresolvedSales` bucket, never folded into
either `taxableSales` or `exemptSales`.
**Covers:** `resolveUsSaleLines`.

### TC-GST-081: US sales tax sourcing is destination-based only — a named, real simplification
**Priority:** P2 · **Story:** COMPLY-P1-02.7
**Expected result:** Buyer's resolved state (shipping preferred over billing). A handful
of real origin-based states are not modeled.

### TC-GST-082: 1099 obligation determination applies the real, dated $600→$2,000 threshold and never guesses on a corporate party
**Priority:** P0 (a real, dated 2026 federal threshold change plus a documented
always-safe "never guess" case) · **Story:** COMPLY-P1-02.8
**Steps:**
1. Determine obligation for payments made in 2025 vs. 2026 at $600, $1,999, and $2,000.
2. Determine obligation for a `company`-kind party at any amount.
**Expected result:** (1) 2025 uses $600 (as `>=`, matching the IRS's own "$600 or more"
wording — a deliberate departure from this module's usual `>` elsewhere); 2026 uses
$2,000 (OBBBA). (2) ALWAYS `resolved: false`, regardless of amount — this platform has no
corporate-entity-type data to know if a 1099 exception applies; guessing either way risks
a false positive/negative.
**Known open gap:** `fsm.expenses` (a second real vendor-payment source) is not read —
`module-fsm` exposes no contract function for this yet.

---

## Known test-infrastructure gap (applies to two already-merged scripts, not itself a TC case)

`test-gst-tax-registrations-rls.mjs` and `test-gst-compliance-profile-rls.mjs` (both
pre-dating this backlog, COMPLY-P0-01.2/02.1) still use `assertThrows` around a
cross-tenant `UPDATE ... WHERE business_id = <other business>` — the wrong assertion,
since RLS makes the row invisible and the `UPDATE` succeeds with 0 rows affected rather
than raising. Every script from `test-gst-return-periods-rls.mjs` onward uses the
corrected "attempt the write, then read back as the rightful owner" pattern instead. A
real, currently-live false-negative risk in these two older scripts, worth fixing
opportunistically the next time either is touched.
