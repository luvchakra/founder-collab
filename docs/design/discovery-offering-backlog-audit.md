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
| | 02.2 | Offering ICP | Done |
| | 02.3 | Buyer Personas | Done |
| B | 03.1 | Offering Context Selector | Done |
| | 03.2 | Offering Overview | Done |
| | 03.3 | Offering Navigation | Done |
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

**9 of 68 in-scope stories done.** (§10's own "Recommended P1 Sequence" and §29's Phase F
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

### 02.2 — Offering ICP (2026-09-11)

Checked the existing ICP model before building anything: `discovery.icp_profiles.workspace_id`
is already `unique`, and every offering already has exactly one workspace -- so "ICP is
linked to the offering" and "one business can have different ICPs for different
offerings" were **already true by construction**, before this story touched anything.
The two real gaps: the field list was missing five of the backlog's own asks (revenue,
business model, technology, growth stage, existing tools -- had industries/company
sizes/geographies/roles/pain points/exclusions already, plus one extra, buying_signals,
left alone since it's used elsewhere in scoring), and "ICP can be cloned" wasn't built at
all.

Migration (`20260911003800_discovery_offering_icp_fields.sql`) adds the five missing
columns, same `text[] not null default '{}'` shape as every existing list field, so nothing
needs backfilling. Extended `IcpProfileSchema` (the AI generator's own output schema) and
`generate-icp.ts`'s write to cover them too, rather than leaving them AI-blind fields
manually-entered-only -- an approved ICP is untouched by this (the freshness gate only
regenerates a draft or an explicit force), so no founder-approved ICP loses data;
newly-generated/regenerated ones just also fill these five now.

New `cloneIcpProfileToWorkspace()`: since one workspace can have at most one ICP, "clone"
upserts the target's own row with the source's values (creating it if the target had
none, overwriting if it did) rather than creating a second row -- reset to `draft`
either way, needing its own re-approval like any edit. New
`listCloneableIcpSourcesForBusiness()` finds every *other* offering in the business that
already has an ICP to clone from (three small queries -- products/workspaces/icp_profiles
have no PostgREST embed between them, same "join in JS" convention this module already
uses everywhere). UI: a `CloneIcpButton` (offering picker + `AlertDialog` confirmation,
since cloning overwrites) in both the "no ICP yet" empty state and the header of an
existing ICP.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(974 files, no violations), `lint:migrations` (100 migrations, no violations),
`npm run lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (19/19, unchanged), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings), and a clean `next build`. Same
live-browser-walkthrough constraint noted in 01.3/02.1 (no seeded demo user in this
environment).

**Status**: 5 of 68 in-scope stories done. Next: 02.3, Buyer Persona Definition.

### 02.3 — Buyer Persona Definition (2026-09-11)

Grepped for "persona" across every `lib`/`components`/`prompts` directory and every prior
migration first -- zero relevant matches, confirming this is a genuinely new entity
(distinct from `icp_profiles.roles`, which is a flat list of job titles describing the
target company's makeup, not a buying-committee model with its own priority).

New `discovery.buyer_personas` table, one-to-many against the offering's workspace
(unlike `icp_profiles.workspace_id`, this FK is *not* unique -- the backlog's own example
has three personas per offering). `role_in_committee` and `priority` are both `check`-
constrained enums (executive_buyer/decision_maker/influencer/budget_stakeholder/user/other;
high/medium/low) rather than free text, matching every other closed-vocabulary field in
this module (`offering_type`, `status`). RLS: the exact same four-policy pattern against
`discovery.user_workspace_ids()` as `product_knowledge`/`prospect_discovery_locks`, read
directly from the schema migration before writing it rather than assumed. Caught one real
gap myself after applying the migration: `get_advisors`' `unindexed_foreign_keys` check
flagged the new `workspace_id` FK with no covering index -- every *other* workspace-scoped
table in this schema (`product_knowledge`, `prospects`, `ai_runs`, etc.) has one, so this
was a genuine miss, fixed with a same-day follow-up migration
(`20260911004000_discovery_buyer_personas_index.sql`) rather than folded silently into the
first one, since the first had already been applied live.

`lib/personas/{types,queries,mutations}.ts` follow the same shape as `lib/icp/`:
`listBuyerPersonas()` is `cache()`-wrapped and exported cleanly enough that Phase C's
Buyer Intelligence (06.3) can consume it later without any interface change -- this
story's own scope is only "personas are available to research/scoring" (i.e. a real query
function exists), not any actual scoring integration.

UI: a new `PersonaSection` (create/edit/delete) on the ICP page, shown in *every* branch
of that page -- including "no product profile yet" and "no ICP yet" -- since personas
belong to the offering's workspace independent of whether an ICP or product profile
exists. Deliberately built as a list of compact cards rather than a `<Table>`: each
persona is only a title + two badges + optional notes, so there's no wide-table/mobile-
card split to design in the first place (CLAUDE.md non-negotiable #12 doesn't bite when
there's no table to begin with). Edit reuses the same dialog as create (`PersonaFormDialog`,
mirroring `OfferingFormDialog`'s own two-mode pattern); delete goes behind the same
`AlertDialog` confirmation every other destructive action in this module already uses.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(979 files, no violations), `lint:migrations` (102 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (19/19, unchanged), two live migration applies +
`get_advisors` for both `security`/`performance` (the missing-index finding above was
caught and fixed this way; no other new findings), and a clean `next build`. Same
live-browser-walkthrough constraint noted in every prior story this run (no seeded demo
user in this environment).

**Status**: 6 of 68 in-scope stories done -- **Phase A complete**. Next: Phase B, 03.1
Offering Context Selector.

### 03.1 — Offering Context Selector (2026-09-11)

Checked what already existed before building anything: the product layout's own
`Breadcrumbs` call passed the *literal strings* `"Business"` and `"Product"` as labels --
not the actual business/offering names -- so "the user must always know Business: X /
Offering: Y" was genuinely not true before this story, not merely under-decorated. Fixed
that first: the breadcrumb now carries `business.name` (already fetched by this layout)
and `product.name`, so the real names are visible on every page under an offering.

Added `OfferingSwitcher` (`components/offerings/offering-switcher.tsx`): a `NativeSelect`
next to the offering's `EditableName` heading, listing every other offering in the same
business (`listOfferings(businessId)`, already existing from 01.1 -- no new query), that
navigates straight to another offering on selection. It preserves whichever *tab* the
founder is currently on (icp/prospects/conversions/usage) by inspecting `usePathname()`
and re-attaching the same known tab segment under the new offering id, but drops anything
deeper (e.g. a specific prospect id) and falls back to that tab's own root, since a
specific record from one offering has no counterpart under another -- "context persists
through relevant navigation" without inventing a page that doesn't exist. Hidden entirely
when the business has only one offering (nothing to switch to). "Results from another
offering do not leak" was already true by construction -- every query under this layout
is scoped server-side by `workspace_id`/`business_id`, RLS-enforced; this story only adds
the ability to *navigate* between offerings; it changes no data access. Desktop/mobile:
a native `<select>` needs no separate mobile treatment, same reasoning as `CloneIcpButton`'s
own offering picker.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(980 files, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (19/19, unchanged -- no lib code changed,
UI/layout only), and a clean `next build`. No schema change, so no migration/advisor step
this story. Same live-browser-walkthrough constraint noted in every prior story this run.

**Status**: 7 of 68 in-scope stories done. Next: 03.2, Offering Discovery Overview.

### 03.2 — Offering Discovery Overview (2026-09-11)

The backlog's own suggested section list for this page (Offering Overview, ICP Health,
Active Discovery Plays, Today's Opportunities, Recent Signals, Watchlist, CRM Handoffs)
includes five sections backed by entities that don't exist yet -- Discovery Plays
(04.2), Opportunities (05.x-07.x), Signals (part of the opportunity model, 05.x),
Watchlist (P1-01.3), CRM Handoffs (08.x). Built only the three that have real data
today -- Offering (type/status/category), ICP Health, and a Prospect funnel -- plus a
Buyer Personas summary and a single deterministic "What should I do today?" recommendation
computed from real state (no ICP -> define one; ICP still draft -> approve it; no
personas -> add them; no prospects -> discover some; otherwise -> review prospects). The
other five sections are left for their own stories to add, each with real content, rather
than stubbed now with placeholder/fake numbers -- the same "no false precision" call
already made in 01.3 for the offerings table's "Active Discovery" column.

New `OfferingOverviewSummary` component, shown on the existing Overview tab (`page.tsx`)
above the existing `ProductOverviewShell` (knowledge sources / profile generation), gated
on `product.product_profile` existing: before a profile exists, the setup wizard already
*is* the "what to do today" answer (generate a profile), so showing a mostly-empty
ICP/persona/prospect dashboard above it would be noise, not help. Once a profile exists,
this becomes the workspace's actual home; the setup shell (still useful for revisiting
sources or regenerating the profile later) stays below it, not replaced.

Deliberately reused this route rather than creating a second "Overview" page: 03.3
(Offering Navigation, next story) is what formally restructures navigation/labels around
the doc's own suggested IA, so a route/nav decision was left to that story rather than
made piecemeal here.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(981 files, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (19/19, unchanged -- no lib code changed),
and a clean `next build`. No schema change this story. Same live-browser-walkthrough
constraint noted in every prior story this run.

**Status**: 8 of 68 in-scope stories done. Next: 03.3, Offering Navigation.

### 03.3 — Offering Navigation (2026-09-11)

The doc's own recommended "Offering" nav group (Overview/ICP/Discovery/Opportunities/
Signals/Watchlist/Research) lists five destinations with no page behind them yet
(Discovery is 04.2, Opportunities/Signals are 05.x-07.x, Watchlist is P1-01.3, Research
has no single owning story so far). Adding them now would mean dead links -- worse than
the "no false precision" numbers problem already avoided twice this run, since a click
would 404 rather than just under-inform. Left them out; the real, deliverable part of
this story is what "Do not create unnecessary nested navigation. Preserve the existing
WonderArc shell" actually asks for structurally, which `ProductNav` already satisfies
(flat, single level, shell untouched) -- so the genuine gap here was elsewhere.

`ProductNav` was a numbered stepper (1/2/3/4 circles, progress-line connectors) --
correct framing for a brand-new offering's first pass through Overview -> ICP ->
Prospects -> Conversions, but wrong once that's done: from then on this is an ongoing
workspace a founder jumps around in constantly, not a checklist to complete once in
order, and a stepper visually implies otherwise. Switched `ProductNav` to a flat,
equal-weight tab bar once `completed.overview` is true (i.e. once a profile exists --
the same gate 03.2 already uses for the overview dashboard), keeping the exact same four
destinations/hrefs; the stepper is unchanged and still shown during initial setup, where
"do these in order once" is the correct message.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(981 files, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (19/19, unchanged), and a clean `next
build`. No schema change this story. Same live-browser-walkthrough constraint noted in
every prior story this run -- this one in particular (a purely visual/structural nav
change) would benefit most from an actual browser check, which remains unavailable here.

**Status**: 9 of 68 in-scope stories done. Next: 04.1, Discovery Definition (still
Phase B -- EPIC DISC-OFFER-P0-04 is grouped into Phase B alongside 03.1-03.3 per the
progress table above).
