# WonderArc Discovery — Offering-Centric Upgrade — Audit Log

Dated record of every story implemented from the "WonderArc Discovery — P0/P1
Offering-Centric Upgrade" backlog (uploaded 2026-09-11), scoped to `module-discovery`
only. Sequence and phase names below are the doc's own §29 "Master Implementation
Sequence" (Phases A–F), which folds the foundational Offering/ICP/Opportunity stories
and the autonomous website-to-offering pipeline into one coherent P0, per that section's
own explicit "the website pipeline is P0, not an optional appendix." P1 (§7, §20–24)
follows once all of P0 is done.

Branch: `disc-offering-backlog`, merged into `main` after each story, same fixed
git sequence as the prior cross-module integration backlog run (`int-backlog`). Per the
user's instruction this run, stories are implemented one after another automatically —
only genuine architectural/key decisions are raised.

## Progress

| Phase | Story | Title | Status |
|---|---|---|---|
| A | 01.1 | Business Offering | Done |
| | 01.2 | Existing Product Compatibility | Done |
| | 01.3 | Offering CRUD UI | Done |
| | 02.1 | Offering Setup | Done |
| | 02.2 | Offering ICP | Not started |
| | 02.3 | Buyer Personas | Not started |
| B | 03.1 | Offering Context Selector | Not started |
| | 03.2 | Offering Overview | Not started |
| | 03.3 | Offering Navigation | Not started |
| | 04.1 | Discovery Definition | Not started |
| | 04.2 | Discovery Plays | Not started |
| C | 05.1 | Opportunity Model | Not started |
| | 05.2 | Opportunity Score | Not started |
| | 05.3 | Multi-Signal Correlation | Not started |
| | 05.4 | Why Now | Not started |
| | 05.5 | Negative Signals | Not started |
| | 06.1 | Evidence-Backed Research | Not started |
| | 06.2 | Research Brief | Not started |
| | 06.3 | Buyer Intelligence | Not started |
| | 07.1 | Next Best Action | Not started |
| | 07.2 | Today's Opportunities | Not started |
| | 07.3 | Opportunity Detail | Not started |
| D | 08.1 | Offering-Aware CRM Handoff | Not started |
| | 08.2 | Existing Relationship Detection | Not started |
| | 08.3 | Handoff Status | Not started |
| E | 09.1 | Website URL Business Onboarding | Not started |
| | 09.2 | Website Crawl & Content Discovery | Not started |
| | 09.3 | AI Offering Extraction | Not started |
| | 09.4 | Offering Review Before Activation | Not started |
| | 10.1 | Run AI Discovery CTA | Not started |
| | 10.2 | Persistent Pipeline Stage Model | Not started |
| | 10.3 | Pipeline Progress UI | Not started |
| | 11.1 | Editable Pipeline Stages | Not started |
| | 11.2 | Run From This Stage | Not started |
| | 11.3 | Stage Dependency Graph | Not started |
| | 12.1 | Offering-Specific Website Research | Not started |
| | 12.2 | External Opportunity Research | Not started |
| | 13.1 | Structured Stage Outputs | Not started |
| | 14.1 | Discovery Run History | Not started |
| | 14.2 | Versioned Stage Results | Not started |
| | 15.1 | Final Human Action Gate | Not started |
| F (P1) | P1-01.1 | Scheduled Offering Re-Discovery | Not started |
| | P1-01.2 | Incremental Re-Run | Not started |
| | P1-02.1 | Review Required Indicators | Not started |
| | P1-02.2 | Rerun Impact Confirmation | Not started |
| | P1-03.1 | Offering Definition Quality | Not started |
| | P1-03.2 | Missing Information Suggestions | Not started |
| | P1-04.1 | Learn From User Edits | Not started |
| | P1-04.2 | Learn From Outcomes | Not started |
| | P1-05.1 | Offering Pipeline Workspace | Not started |
| | P1-05.2 | Desktop Stage Tables | Not started |
| | P1-05.3 | Editable Stage Rows | Not started |
| P1 (extra) | P1-01.3 | Account Watchlist | Not started |
| | P1-01.4 | Grouped Opportunity Alerts | Not started |
| | P1-02.3 (dup) | Offering Performance Analysis | Not started |
| | P1-03.3 | Provider-Agnostic Data Contracts | Not started |
| | P1-04.3 | Offering-Specific Contact Relevance | Not started |
| | P1-05.4 | Offering Overview UX Polish | Not started |

**4 of 68 in-scope stories done.** (§10's own "Recommended P1 Sequence" and §29's Phase F
list the P1 stories slightly differently — §10 has 17 P1 stories including three §29
omits (Account Watchlist, Grouped Alerts, Offering Performance Analysis, Provider
Contracts, Contact Relevance, UX Polish); all are tracked above under "P1 (extra)" so
nothing from either list is silently dropped.)

## Pre-implementation reconnaissance (done once, up front)

Before writing any code, inspected the existing `module-discovery` implementation, per
the backlog's own explicit "Claude Code must inspect the actual current implementation
before changing it. This document is the target-state backlog, not permission to rebuild
the existing module from scratch":

- **Tenancy chain today**: `discovery.products` (business_id) → `discovery.workspaces`
  (product_id, exactly one per product — `20260909120000_discovery_workspaces_unique_product.sql`
  enforces this) → `icp_profiles`/`prospects`/`contacts`/`prospect_research`/
  `prospect_scores`/`outreach_strategies`/`conversations`/`messages` (all keyed off
  `workspace_id`, ADR-4's own tenant boundary for this module). `lib/tenancy/{queries,mutations}.ts`
  is the existing CRUD layer (`listProducts`/`getProduct`/`createProduct`/`updateProduct`/
  `disableProduct`/`enableProduct`/`createProductsBulk`/`deleteProduct`), used across ~10
  components (business page, product overview shell, import wizard, nav).
- **`discovery.products.product_profile` (jsonb) already covers most of what the backlog
  calls "Offering Profile"**: `ProductProfileSchema` (`lib/ai/schemas.ts`) already has
  `category`, `problem` (= the backlog's `primary_problem`), `target_industries`/
  `target_roles`, `competitive_positioning` (≈ `value_proposition`), `differentiators`,
  `use_cases`, `pricing_summary`, `confidence` — generated by `lib/ai/understand-product.ts`,
  which is already substantially DISC-OFFER-P0-02.1's "Offering Setup Wizard" AI half
  (natural-language description → structured fields, user-editable, never silently
  saved as fact until the user accepts). This backlog's own instruction ("reuse
  existing... AI runs... research/signal records") means later Offering-profile stories
  should build on this existing pipeline, not duplicate it with a second AI flow.
- **Already exists, unrelated to this epic but worth knowing about**: `products.linked_item_id`
  (bridges to `core.items` when Inventory is licensed, `20260910090000_discovery_products_inventory_item_link.sql`)
  and `discovery.prospects.outcome` — neither interacts with Offering work but both live
  on tables this epic touches.
- **No existing offering/opportunity/signal-intelligence code**: confirmed
  `docs/plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md` (a separate, earlier-drafted
  epic covering similar ground — Discovery Opportunity Score, Signal Correlation, Why Now,
  Research Brief, etc.) was never started; this backlog supersedes it in practice (same
  ground, offering-centric framing) rather than the two being built in parallel. Flagging
  this rather than silently building both: **the P0/P1 doc's own opportunity/signal/research
  concepts (Phase C) should be treated as satisfying `08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md`'s
  intent too**, not as a second, competing implementation once Phase C lands.

## Story log

### 01.1 — Business Offering (2026-09-11)

Reused `discovery.products` as the canonical Offering table rather than creating a
parallel `discovery.offerings` table: a product already IS a business_id-scoped
commercial thing, and every downstream table (`workspaces`, `icp_profiles`, `prospects`,
...) already keys off this row's own id chain — 00-MASTER-PLAN.md §5's entity-ownership
rule (check before creating a table; use the canonical one if the concept already
exists) applies just as much to this backlog's own new concepts as to the platform's
original ones. Purely additive migration (`20260911003600_discovery_business_offering.sql`):
new nullable columns `category`/`offering_type`/`value_proposition`/`primary_problem`/
`target_market`/`detailed_description`, plus widening `products.status`'s check
constraint from binary `active`/`archived` to a real third `inactive` state (the schema
change DISC-OFFER-P0-01.3's later CRUD UI will need for a real three-way
activate/deactivate/archive action — `disableProduct()`/`enableProduct()` still only
ever write active/archived, unchanged by this story). `short_description` isn't a new
column: the existing `description` column already fills that role, aliased (not
duplicated) at the new Offering-vocabulary layer.

New `lib/offerings/` (types.ts, queries.ts, mutations.ts): `Offering` is a type alias for
the existing `Product` type (same row, new vocabulary for new code — existing code keeps
importing `Product` from `lib/tenancy/types` completely unchanged, satisfying "existing
workflows continue to work during transition"), `OFFERING_TYPE_LABEL`/`OFFERING_STATUS_LABEL`
display maps, `listOfferings`/`getOffering` (thin wrappers over the existing
`listProducts`/`getProduct` — same RLS-scoped read, no second query implementation), and
`updateOfferingProfile()` — a new, separate mutation for the six new fields rather than
widening `updateProduct()`'s own input type, since every existing caller of that function
only ever collects name/description/website and would otherwise have to reason about
fields it doesn't present.

New `listOfferingsForBusiness()` on Discovery's `contract/index.ts` (+ `OfferingSummary`
in `contract/types.ts`) satisfies the story's own explicit "Offering is available through
a stable Discovery contract" acceptance criterion — no cross-module consumer exists yet
(added because the story asks for it by name, not speculatively).

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(968 files, no violations), `lint:migrations` (98 migrations, no violations),
`npm run test -w @cofounderai/module-discovery` (19/19, unchanged — no unit test added
for the new thin wrappers, matching the same "DB-composing functions don't get one"
precedent the cross-module backlog established), `node scripts/test-module.mjs discovery`
(same expected no-local-Postgres RLS harness failure every module in this environment
has shown all session, not a regression), a live migration apply + `get_advisors` for
both `security`/`performance` (no new findings), and a clean `next build`. Confirmed the
widened `status` union breaks nothing by grep (no exhaustive `Record<Product["status"], ...>`
or `"active" | "archived"` literal-union dependents exist anywhere in `module-discovery`
or `apps/web`).

**Status**: 1 of 68 in-scope stories done. Next: 01.2, Existing Product Compatibility.

### 01.2 — Existing Product Compatibility (2026-09-11)

Because 01.1 was built by extending `discovery.products` in place (not renaming the
table or creating a parallel `offerings` table), most of this story's own acceptance
criteria were already true by construction: nothing was renamed, removed, or made
non-nullable, so every existing product/prospect/research/signal/ICP record stayed
exactly as it was, and every existing caller of `lib/tenancy/queries.ts`/`mutations.ts`
was already confirmed unaffected during 01.1's own verification. The one genuine,
story-specific gap: every pre-existing product had `offering_type = null`, and future
Offering-centric screens (01.3 onward) will want a real type to display/filter/badge by.

New data-only migration (`20260911003700_discovery_offering_type_backfill.sql`)
backfills `offering_type = 'product'` for every row where it's still null. Not
inventing a business fact -- it's the literal, honest statement that a row previously
modeled exclusively as a "Product" defaults to the `product` offering type, the same
answer a founder would give if asked directly. Live-applied and confirmed: all 20
existing dev products now read `offering_type = 'product'`, no other column touched.

Verified with full monorepo typecheck (clean across all 9 workspaces -- no code
changed), `lint:boundaries` (968 files, unchanged), `lint:migrations` (99 migrations, no
violations -- a plain `update`, no `create`/`alter table` for the schema-per-file
checker to look at either way), `npm run lint` (0 errors, 1 pre-existing unrelated
warning), and a live migration apply confirmed against dev data. No test suite or build
re-run needed -- no TypeScript/UI changed this story.

**Status**: 2 of 68 in-scope stories done. Next: 01.3, Offering CRUD UI.

### 01.3 — Offering CRUD UI (2026-09-11)

Replaced the business page's "Products" section (a two-column card grid with only
Delete/disable-toggle actions and a plain bottom form for Create) with a real,
responsive Offering management screen, per the Global UI Design Rule: `OfferingsTable`
(`module-discovery/src/components/offerings/`) renders a desktop `<Table>` (`Offering |
Type | Target market | Status | Updated | Actions`, per the backlog's own suggested
columns) and a one-card-per-row mobile list (CLAUDE.md non-negotiable #12) from the
exact same row data. Omitted the backlog's suggested "Active Discovery" column
deliberately, not by oversight: it needs a real Discovery Definition to report
against, which doesn't exist until DISC-OFFER-P0-04.1 -- adding a column with nothing
real behind it would be the same false-precision problem §5.2 of the backlog itself
warns against for opportunity scores. A natural, non-breaking column to add once 04.1
lands.

One dialog (`OfferingFormDialog`) handles both Create and Edit -- same field set either
way, grouped into always-visible basics (name/type/category/website/short description)
and a "Commercial details" section below a divider (target market/primary
problem/value proposition/detailed description) so the dialog doesn't read as one
undifferentiated wall of inputs. "Long descriptions are truncated with a way to view
full content": the table truncates target market to one line; the pre-filled Edit
dialog (not a separate read-only viewer) is the way to see the rest -- a second,
read-only surface would just duplicate the same form.

Row actions follow this platform's own "[Edit] [•••]" convention (established by the
cross-module Exception Center/Follow-up Queue rows earlier this session): a direct Edit
icon, and a "•••" `DropdownMenu` (Duplicate, then whichever of Active/Inactive/Archived
the row *isn't* currently, then Delete behind the existing `AlertDialog` confirmation
pattern, naming the prospect count at stake exactly like `delete-product-button.tsx`
already did). `DropdownMenu` is vendored shadcn that had zero adopters anywhere in the
platform before this -- exactly the tool this backlog's own row-action mockups (`[•••]`
→ `Edit / Watch / Change Priority / Dismiss`) call for, not a new dependency.

New mutations (`lib/offerings/mutations.ts`): `createOffering()` (wraps the existing
`createProduct()` for the base insert -- keeping its inventory-item-mirror side effect
-- then `updateOfferingProfile()` for the new fields), `setOfferingStatus()` (the real
three-way active/inactive/archived setter DISC-OFFER-P0-01.1's schema change was for),
`duplicateOffering()` (copies every field except the AI-generated `product_profile` --
cloning stale research onto a fresh row would misrepresent it as current). New actions
in the business page's own `actions.ts`: `createOfferingAction`/`updateOfferingAction`
(the latter writes through both `updateProduct()` and `updateOfferingProfile()` -- one
dialog submit, two calls onto the same row, matching why those stayed separate
functions), `setOfferingStatusAction`, `duplicateOfferingAction`; `deleteProductAction`
(unchanged) is reused directly for Delete, no new function needed.

**Verification note**: this environment has no seeded demo-user credentials or
`apps/web/.env.local`, so an authenticated live-browser walkthrough of the new dialog/
table/menu interactions isn't practically reachable here (same constraint the prior
cross-module integration backlog's ~15 UI-touching stories operated under all session).
Verification is typecheck/lint/build plus disciplined reuse of already-proven
components (`Table`/`Dialog`/`AlertDialog`/`DropdownMenu`/`NativeSelect`/`EmptyState`,
each already used correctly elsewhere in this codebase) rather than a rendered
screenshot -- flagged explicitly rather than silently claimed as done.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(971 files, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (19/19, unchanged), and a clean
`next build` (confirmed `/dashboard/businesses/[businessId]/business` -- the page this
story rewrote -- builds with no errors). No migration this story (schema landed in
01.1/01.2).

**Status**: 3 of 68 in-scope stories done. Next: 02.1, Offering Setup Wizard.

### 02.1 — Offering Setup Wizard (2026-09-11)

Checked what already exists before building anything: `understandProduct()`
(`lib/ai/understand-product.ts`) already does "natural-language/website input → AI
structures fields → founder reviews" for the *deep* research profile
(`ProductProfile`) -- but it hard-requires a website ("there's nothing to research
without one"), and critically, the existing Overview tab renders that profile as
read-only `<dd>` text, not editable fields -- a real gap against this story's own "AI
suggestions are editable" criterion (the only correction path today is editing the
source description/website and regenerating the whole profile, not fixing one field).
Fixing that for the deep profile (arrays of features/differentiators/use cases, etc.)
would be a much larger editable-array-fields UI investment than this story's own scope
("What do you sell / what problem / who buys it / where / why / optional context" --
six flat questions), so 02.1 targets the flat Offering fields DISC-OFFER-P0-01.1 already
added instead, where an editable form already exists (01.3's dialog).

New `suggestOfferingProfile()` (`lib/offerings/ai/`): takes a founder's own free-text
description (no website, no crawling -- genuinely different from `understandProduct()`,
not a duplicate), returns a structured, nullable-field proposal
(`OfferingProfileSuggestion` -- offering type/category/primary problem/target
market/value proposition + confidence) via a new small prompt
(`prompts/offerings/suggest_offering_profile_v1.ts`) and Zod schema. Registered as a new
BYOK operation (`suggest_offering_profile`, fast tier, no web search --
`packages/core/src/ai/operation-registry.ts`) and wired through the same
`resolveAiModel`/`assertWithinUsageLimit`/`recordAiRun`/`hashInput`/`toAiProviderError`
scaffolding `understandProduct()` already uses -- same metering/audit discipline, not a
parallel one. Deliberately has **no write path of its own**: "AI does not silently save
inferred information as fact" is enforced structurally, the function can only return a
proposal, never persist it.

Only offered from the **Edit** dialog, not Create: AI-usage accounting is
workspace-scoped (`ai_runs.workspace_id not null`), and a not-yet-created offering has
no workspace yet (one is only created alongside the product row). "You can complete
setup without AI" already holds in Create, which stays plain manual fields. Converted
`OfferingFormDialog`'s type/category/target-market/primary-problem/value-proposition
fields from uncontrolled to controlled React state so a "Suggest fields with AI" click
can fill them as edited-before-save proposals, added a "Describe it in your own words"
textarea + button above the existing fields (only rendered when a `suggestAction` prop
is passed, i.e. Edit mode).

Verified with full monorepo typecheck (clean across all 9 workspaces -- caught and fixed
one real gap along the way: `resolveAiModel()` requires a registered `AiOperation`, so
the new operation had to be added to `core`'s own registry, not just called ad hoc),
`lint:boundaries` (973 files, no violations), `npm run lint` (0 errors, 1 pre-existing
unrelated warning), `npm run test -w @cofounderai/module-discovery` (19/19, unchanged),
and a clean `next build`. Same live-browser-walkthrough constraint as 01.3 (no seeded
demo user/`.env.local` in this environment) -- verification is typecheck/lint/build plus
disciplined reuse of the already-proven AI scaffolding and 01.3's own dialog, not a
rendered screenshot. No migration this story.

**Status**: 4 of 68 in-scope stories done. Next: 02.2, Offering ICP.
