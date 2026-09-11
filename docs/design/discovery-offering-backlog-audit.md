# WonderArc Discovery — Offering-Centric Upgrade — Audit Log

Dated record of every story implemented from the "WonderArc Discovery — P0/P1
Offering-Centric Upgrade" backlog (uploaded 2026-09-11, saved verbatim as
`docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md` as of the 05.3 session below), scoped
to `module-discovery` only. Sequence and phase names below are the doc's own §29 "Master Implementation
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
| | 04.1 | Discovery Definition | Done |
| | 04.2 | Discovery Plays | Done |
| C | 05.1 | Opportunity Model | Done |
| | 05.2 | Opportunity Score | Done |
| | 05.3 | Multi-Signal Correlation | Done |
| | 05.4 | Why Now | Done |
| | 05.5 | Negative Signals | Done |
| | 06.1 | Evidence-Backed Research | Done |
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

**17 of 68 in-scope stories done.** (§10's own "Recommended P1 Sequence" and §29's Phase F
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

### 04.1 — Discovery Definition (2026-09-11)

New `discovery.discovery_definitions` table -- one-to-many against the offering's
workspace like `buyer_personas` ("multiple definitions per offering" is an explicit
acceptance criterion), distinct from `icp_profiles` (who to target) and `buyer_personas`
(who's on the buying committee): a definition is the monitoring strategy itself --
target geographies/industries, buyer roles, desired/excluded signals, disqualifiers, a
minimum score, and a monitoring frequency (daily/weekly/monthly/manual), plus
`is_enabled` for the "enable/disable" acceptance criterion. `icp_id` is a soft reference
(nullable, `on delete set null`) snapshotting the workspace's current ICP at creation
time -- per ADR-10's no-hard-coupling rule, a definition keeps working even if that ICP
is later replaced or deleted, rather than breaking or cascading. "Every result can be
traced to its definition" is satisfied structurally for now by the definition itself
being a real, queryable row with a stable id that later stories (the actual monitoring/
signal-matching pipeline, Phase C/E) can foreign-key results to -- this story's own scope
is definition management, not signal-matching execution, which doesn't exist yet.

Added a real "Discovery" tab to `ProductNav`'s ongoing (post-setup) flat tab bar, between
ICP and Prospects, matching the doc's own suggested order -- this is the first Phase B/C
destination that now has a genuine page behind it, unlike Discovery/Opportunities/
Signals/Watchlist in 03.3, which were correctly left out as dead links at that point.
Not added to the setup-wizard stepper: a Discovery Definition is optional ongoing
configuration, not a required step in a fixed setup order.

UI: `DefinitionList` (compact cards, same pattern as `PersonaSection`) with a `Switch`
for enable/disable (first use of the vendored `Switch` primitive in this module),
`DefinitionFormDialog` (create/edit, plain per-line Textareas for the six list fields --
IcpField's collapse/expand treatment is built for a whole page sharing one form; a
dialog is already compact enough not to need it), and delete behind the same
`AlertDialog` confirmation as every other destructive action in this module.

Caught and fixed one gap myself via `get_advisors` after the first migration apply: the
new `icp_id` soft-reference FK had no covering index either (same class of miss as
02.3's `workspace_id` catch) -- fixed with a same-day follow-up migration
(`20260911004200_discovery_definitions_icp_index.sql`) since the first was already
applied live. The `workspace_id` FK itself was indexed from the start this time.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(988 files, no violations), `lint:migrations` (104 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (19/19, unchanged), two live migration applies +
`get_advisors` for both `security`/`performance` (the missing-index finding above was
caught and fixed this way; no other new findings), and a clean `next build` (the new
`/discovery` route builds and appears in the route list). Same live-browser-walkthrough
constraint noted in every prior story this run.

**Status**: 10 of 68 in-scope stories done. Next: 04.2, Discovery Play.

### 04.2 — Discovery Play (2026-09-11)

New `DISCOVERY_PLAYS` registry (`lib/discovery-definitions/plays.ts`) with the backlog's
own exact ten presets (Recently Funded, Rapid Growth, Hiring Relevant Roles, New
Executive, Technology Migration, Competitor Customers, Regulatory Pressure, Negative
Reviews, Expansion, Multiple Buying Signals) -- fixed, hand-written data, no AI call
involved, each just a name + a starter `desiredSignals` entry.

`DefinitionFormDialog` gained an `initialValues`/`triggerLabel` pair (create-mode only):
plain `defaultValue` pre-fill, no controlled-state refactor needed since these are only
ever read at mount, never updated afterward. New `PlayPicker` renders one button per
play, each its own `DefinitionFormDialog` instance pre-filled with that play's name and
signal, wired into `DefinitionList` right below the plain "New definition" button. A play
never creates a definition on its own -- it opens the exact same create dialog the founder
would see manually, pre-filled as a starting point they still review and can edit before
clicking Create, the same "pre-filled but not auto-saved" discipline as the Offering
Setup Wizard's AI suggestions (02.1). "Each play must inherit the active offering
context" holds structurally: `PlayPicker` takes the same `createAction` already bound to
the current business/offering that the plain create button uses, so a play-started
definition always writes into this offering's own workspace.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(990 files, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (19/19, unchanged), and a clean `next
build`. No schema change this story. Same live-browser-walkthrough constraint noted in
every prior story this run.

**Status**: 11 of 68 in-scope stories done -- **Phase B complete**. Next: Phase C,
05.1 Discovery Opportunity Model.

### 05.1 — Discovery Opportunity Model (2026-09-11)

Checked `discovery.prospects`/`prospect_scores`/`prospect_research` in full before
creating anything. None fit: `prospects.status` (new/qualified/disqualified) is a
persistent, one-row-per-company qualification state; `prospect_scores` is append-only
per prospect (a score *history*, not a distinct trackable thing); `prospect_research` is
one row per prospect. None can represent the doc's own "a company can have separate
opportunities for different offerings" in the sense actually meant here: a *single*
prospect, re-evaluated by different discovery definitions over time, can surface several
distinct, time-bound buying-signal moments concurrently (e.g. one from a "Recently
Funded" definition, a separate later one from "Hiring Relevant Roles"), each with its own
independent 7-state lifecycle (new -> reviewing -> action_required -> watching ->
sent_to_crm/dismissed/expired). That's genuinely one-to-many against a prospect, which
none of the existing tables are. New `discovery.opportunities` table with exactly the
doc's own "minimum fields" (using `workspace_id` for "offering_id", matching this
module's own established convention everywhere else) -- `discovery_definition_id` is a
soft reference (nullable, `on delete set null`), same treatment as 04.1's own `icp_id`
reference, so an opportunity survives its originating definition being deleted.

Deliberately schema + `lib/opportunities/{types,queries,mutations}` only, no UI this
story: the doc gives 05.1 no acceptance-criteria block (unlike every other story so far),
just the data model itself, and the actual opportunity UI is explicitly owned by Phase C's
own 07.1-07.3 ("Next Best Action", "Today's Opportunities", "Opportunity Detail"). Building
list/detail screens now, ahead of scoring (05.2), correlation (05.3), why-now (05.4), and
negative signals (05.5) all still to come, would mean either an empty table with nothing
meaningful to show or speculative UI for fields those later stories haven't populated yet
-- so the lib layer exists and is ready for 05.2-05.5/07.x to build on, without
front-running them. `mutations.ts` intentionally has no scoring logic (`createOpportunity`
just records the moment; `score`/`confidence` stay at their column defaults until 05.2
computes them for real).

All three foreign keys (`workspace_id`, `prospect_id`, `discovery_definition_id`) were
indexed from the start this time, avoiding the follow-up-migration pattern 02.3/04.1
needed.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(993 files, no violations), `lint:migrations` (105 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (19/19, unchanged), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings -- all three FKs already indexed), and
a clean `next build`. No UI to browser-test this story since none was built.

**Status**: 12 of 68 in-scope stories done. Next: 05.2, Opportunity Score.

### 05.2 — Opportunity Score (2026-09-11)

Added the seven named score components (ICP fit, buyer fit, need/problem fit, timing,
signal strength, contactability, evidence confidence) as their own nullable columns on
`discovery.opportunities`, plus a `score_reason` text column. New `scoring.ts` --
`computeOpportunityScore()` -- is a pure, deterministic function (CLAUDE.md dev principle
#4: don't use an LLM for a deterministic operation) that averages only the *populated*
components rather than zero-filling missing ones (an absent "contactability" reading
isn't evidence of poor contactability, it's just unknown -- zero-filling it would
silently understate the score). Confidence is derived from how complete the component set
is (all seven -> high, at least half -> medium, otherwise low), and with *zero* components
populated the function returns exactly the doc's own literal example: `score: null,
confidence: "low", reason: "Insufficient evidence"`. New `setOpportunityScoreComponents()`
mutation writes the raw components and the computed score/confidence/reason together in
one call, so a caller can never write a `score` that didn't come from this function --
they can't drift apart. Four new vitest cases cover the empty case, a partial-evidence
average, the medium-confidence threshold, and the fully-populated high-confidence case
(module suite now 23/23, up from 19).

Deliberately no UI change this story, same reasoning as 05.1: the doc's own "Display score
components" instruction has nowhere honest to land yet -- there is still no opportunity
list or detail page (07.1-07.3 own that), and building one now, ahead of correlation
(05.3), why-now (05.4), and negative signals (05.5) still to come, would mean either
speculative UI or a page that gets substantially reworked three stories later. The
display itself is 07.3 (Opportunity Detail)'s job once an opportunity actually exists to
show; this story's job was making the data model and the scoring rule itself correct and
tested.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(995 files, no violations), `lint:migrations` (106 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (23/23, +4 new), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings), and a clean `next build`. No UI to
browser-test this story since none was built.

**Status**: 13 of 68 in-scope stories done. Next: 05.3, Multi-Signal Correlation.

### 05.3 — Multi-Signal Correlation (2026-09-11)

First action this session: saved the backlog doc itself to
`docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md` (it had only ever existed as a
pasted prompt, per this file's own header note) -- this repo's own convention of keeping
every implementation backlog as a permanent numbered plan doc, matching `00` through `09`.

Checked what "signal" meant in the current implementation before building anything: it
only ever existed as free-text strings inside `prospect_research.buying_signals`/
`recent_events` (both `text[]`, no id) and as a discovery definition's own free-text
*matching criteria* (`desired_signals`/`excluded_signals`) -- neither is a thing a
correlation could reference by "supporting signal IDs" the way this story's own
acceptance criteria require, since neither has an id at all. Genuinely new entity, not a
duplicate of either: new `discovery.signals` (one atomic, addressable, time-stamped fact
about a prospect) and `discovery.signal_correlations` (the grouped read over several of
a prospect's own signals -- "supporting signal IDs, rationale, confidence, time
context", the doc's own literal list). Both tables are append-only, no update/delete
policy, matching `discovery.prospect_scores`' own established precedent for a
history-preserving row (re-syncing/re-correlating adds, it never rewrites or deletes) --
`signals` additionally has a `unique (prospect_id, signal_type, description)` constraint
so a sync is a true upsert-by-natural-key, not a source of duplicates. Both FKs on both
new tables were indexed from the start (as in 05.1); `get_advisors` confirmed zero new
findings of any kind, security or performance, after applying.

New `lib/signals/{types,queries,correlation,mutations}.ts`. `syncSignalsFromResearch()`
is the one place today that turns a prior AI research pass's already-extracted
`buying_signals`/`recent_events` strings into real rows -- deliberately makes no AI call
of its own (CLAUDE.md dev principles #4/#5), and deliberately does not touch
`lib/ai/research-prospect.ts` itself, leaving that file free for 06.1's own
"Evidence-Backed Research" overhaul rather than reworking it twice. `correlateSignals()`
(pure, in its own `correlation.ts`, mirroring 05.2's own `scoring.ts` split of pure logic
from its DB-writing wrapper) is the deterministic rule the story's own "a single weak
signal should not automatically become a high-value opportunity" acceptance criterion
asks for directly: confidence is driven purely by how many independent signals
corroborate each other (1 -> low, explicitly labelled "single signal -- insufficient
corroboration on its own" in its own rationale so a lone signal is never silently
amplified; 2 -> medium; 3+ -> high), the same count-based confidence-gating shape
`computeOpportunityScore` already established. The rationale itself is a plain joined
list of the signals found ("New CISO + 12 IAM openings + ..."), matching the doc's own
literal example -- not synthesized prose, so no LLM call is needed to produce it either.
`correlateSignalsForProspect()` wraps sync -> correlate -> persist into one call. Five
new vitest cases cover the empty/single/two/three-plus confidence tiers and the
earliest/latest time-context derivation independent of input order (module suite now
28/28, up from 23).

Wired the result into 05.2's own scoring model rather than leaving it a disconnected
table: `attachSignalCorrelation()` (new, `lib/opportunities/mutations.ts`) maps a
correlation's confidence onto the `signal_strength_score` component 05.2 already named
but nothing had ever populated (low/medium/high -> 30/60/90), re-reads the opportunity's
other six components unchanged, and reuses `setOpportunityScoreComponents()` for the
actual write -- so a caller still can never write a `score` that didn't come from
`computeOpportunityScore`. New soft-reference column
`opportunities.signal_correlation_id` (`on delete set null`, same treatment as
`discovery_definition_id`/`icp_id`) records which correlation last justified the score.
`lib/opportunities` importing from `lib/signals` (never the reverse) keeps signals a
self-contained concept that doesn't need to know opportunities exist.

Deliberately no UI change this story, same reasoning as 05.1/05.2: there is still no
opportunity list or detail page for a correlation to surface in (07.1-07.3 own that),
and 05.4 (Why Now) and 05.5 (Negative Signals) still have their own data to add to the
same opportunity row first -- building a page now would mean showing an incomplete
picture that gets substantially extended twice more in the next two stories.

Verified with full monorepo typecheck (clean across all 9 workspaces -- caught and fixed
two `noUncheckedIndexedAccess` errors in `correlation.ts`'s own array access, non-null
asserted after an explicit length check), `lint:boundaries` (1000 files, no violations),
`lint:migrations` (108 migrations, no violations), `npm run lint` (0 errors, 1
pre-existing unrelated warning), `npm run test -w @cofounderai/module-discovery` (28/28,
+5 new), two live migration applies + `get_advisors` for both `security`/`performance`
(no new findings of any kind), and a clean `next build`. One environment note specific to
this session: this worktree started with no `node_modules` at all (unlike the main
checkout, which already had one) -- `npm ci` at the repo root was required before
typecheck/build would resolve `next`/other packages at all; noted here since it's an
environment quirk, not a code change. Same live-browser-walkthrough constraint noted in
every prior story this run (no seeded demo user/`.env.local` in this environment) -- no
UI was built this story regardless.

**Status**: 14 of 68 in-scope stories done -- Phase C in progress. Next: 05.4, Why Now.

### 05.4 — Why Now (2026-09-11)

Checked what already existed before adding anything: `opportunities.why_now` (05.1) is
already a plain text column, and its content maps directly onto the doc's own
`why_now_summary` field -- reused as-is (same aliasing call as 01.1's `description` =
`short_description`), not duplicated under a second column. `timing_score` (05.2) is
already a numeric score-component slot nothing had populated yet, same situation
`signal_strength_score` was in before 05.3. The two genuinely missing pieces: a
human-readable timing label, and a why-now-specific confidence distinct from the
opportunity's own overall `confidence` (05.2's, which reflects how *complete* the
score's component set is, not how sure Discovery is about the timing claim itself).
Migration (`20260911004700_discovery_opportunity_why_now.sql`) adds exactly those two:
`timing_strength`/`why_now_confidence`, both the same closed low/medium/high vocabulary
every other confidence-shaped field in this module already uses.

New `lib/opportunities/why-now.ts` -- `computeWhyNow()`, pure and deterministic (no AI
call, CLAUDE.md dev principles #4/#5), mirroring 05.3's own split of pure logic
(`correlation.ts`) from its DB-writing wrapper. Built directly on 05.3's own signal
correlation rather than duplicating anything: the doc's "supporting signals" and
"evidence" outputs are already fully covered by a correlation's own `signal_ids` (via
the opportunity's `signal_correlation_id`) -- no new storage needed for either, both are
already one lookup away. `timingStrength` is a genuinely distinct dimension from 05.3's
own `signalStrength`, deliberately kept that way rather than collapsed into one number:
`signalStrength` is about *corroboration count*, `timingStrength` is about *freshness*
(days since the correlation's own `latest_signal_at` -- itself only capturable because
05.3 already stored "time context" as its own fields). "Never manufacture urgency" is
satisfied structurally, the same way 05.1-05.3 structurally satisfied their own
"no false precision"/"never invent evidence" instructions: the summary is a plain
template of the correlation's own rationale plus a factual "observed N days ago"
suffix, never synthesized prose, so there is no urgency language to accidentally
invent. `confidence` takes the *weaker* of timing strength and correlation confidence
(a why-now claim rests on both freshness and corroboration; either one being weak makes
the claim weak). Six new vitest cases cover: no correlation (all null/low, no false
precision), the three timing-strength tiers, the "weaker of the two" confidence rule
from both directions, and that the summary text is exactly the correlation's rationale
plus a factual timestamp with no added language.

New `setOpportunityWhyNow()` (`lib/opportunities/mutations.ts`), same shape as 05.3's
own `attachSignalCorrelation`: writes `why_now`/`timing_strength`/`why_now_confidence`
directly, then re-reads the opportunity's other six score components unchanged and
reuses `setOpportunityScoreComponents()` to write `timingScore` into the `timing`
component -- so `score` still can never be written except through
`computeOpportunityScore`. While making this change, DRYed `why-now.ts`'s own
confidence/timing types against the already-existing `OpportunityConfidence` (types.ts)
rather than declaring two new structurally-identical `"low" | "medium" | "high"` type
aliases.

Deliberately no UI change this story, same reasoning as 05.1-05.3: 07.1-07.3 still own
the opportunity UI, and 05.5 (Negative Signals) still has its own data to add to the
same row before there is a complete picture worth building a page around.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1002 files, no violations), `lint:migrations` (109 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (34/34, +6 new), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings -- pure column additions, no new
indexes), and a clean `next build`. Same live-browser-walkthrough constraint noted in
every prior story this run -- no UI was built this story regardless.

**Status**: 15 of 68 in-scope stories done -- Phase C in progress. Next: 05.5, Negative
Signals.

### 05.5 — Negative Signals (2026-09-11)

Checked for an existing "negative" or "disqualifying" concept before creating one:
`discovery_definitions.disqualifiers` is a definition's own free-text *matching
criteria*, never evaluated against a specific prospect anywhere in the current code;
`prospects.status = 'disqualified'` is a persistent qualification state with no reason
attached. Neither satisfies the doc's own "show the reason to the user" -- genuinely new
entity, structurally the *opposite* of 05.3's `discovery.signals`: where a signal is an
immutable observed fact (append-only, no update policy), a negative signal is a
*current assessment* that should be corrected as new information arrives (an industry
mismatch found last week is still true today; "recent rejection" stops being true once
the relationship changes) -- so `discovery.negative_signals` gets the standard
select/insert/update/delete four-policy shape instead, with `unique (prospect_id,
reason)` so re-evaluating refreshes the one current row per reason rather than
accumulating history.

Went through the doc's own nine-reason list and classified each against what this
module can actually know today, rather than inventing detection for what it can't:
seven are `source: 'auto'`, deterministically derived (CLAUDE.md dev principles #4/#5,
no AI call) from data already on hand --
`wrong_industry`/`wrong_size`/`wrong_geography` (reused `fuzzyIncludes` from
`lib/scoring/score-prospect.ts`, now exported, against the workspace's *approved* ICP
only -- same "approve an ICP before scoring" guard `scoreProspect()` already uses, so a
draft/absent ICP never false-flags), `insufficient_evidence`/`no_relevant_problem`
(deliberately distinct: no research row at all vs. research that found zero pain
points -- the same "absence of evidence isn't evidence of absence" precision 05.2's own
`computeOpportunityScore` already applies to missing score components), `no_buyer`
(zero `discovery.contacts` rows), and `recent_rejection` (`prospect.outcome ===
'lost'`). The remaining two -- `known_incompatible_solution` (no competitor/tooling
knowledge exists anywhere in Discovery) and `existing_active_relationship` (needs CRM
data; DISC-OFFER-P0-08.2 "Existing Relationship Detection" explicitly owns real
detection later in this same backlog) -- are `source: 'manual'` only, via a new
`recordManualNegativeSignal()` a future caller with that context can use; auto-sync
never touches them.

New `lib/negative-signals/{types,detect,queries,mutations}.ts`. `detectNegativeSignals()`
is pure (mirrors 05.3/05.4's own pure-logic/DB-wrapper split). `syncNegativeSignalsForProspect()`
reconciles the table to match a fresh detection pass: upserts every currently-detected
reason and deletes any `source: 'auto'` row whose reason no longer applies (e.g. the ICP
changed and the industry now matches) -- scoped to a fixed `AUTO_DETECTABLE_REASONS`
list so it can never delete or overwrite a `manual` row for a reason it has no way to
verify itself. Seven new vitest cases cover a clean match, all three ICP-mismatch
reasons, the ICP-approval guard (null and draft both skip ICP checks), the
insufficient-evidence-vs-no-relevant-problem distinction, no_buyer, recent_rejection,
and that the two manual-only reasons are never returned by auto-detection.

Deliberately did not wire this into `computeOpportunityScore`/`setOpportunityScoreComponents`
the way 05.3 (signal_strength) and 05.4 (timing) did -- unlike those two, the doc names
no specific score component for negative signals here ("Support signals that reduce
opportunity quality... Show the reason to the user" describes surfacing a reason, not a
scoring formula), and inventing a penalty-weighting rule the doc never specified would
be exactly the kind of speculative addition CLAUDE.md's dev principles warn against. The
data layer (detect + sync + query) is real and complete; how 07.x's opportunity UI
chooses to *display* a prospect's negative signals alongside its score is that story's
own call to make once it exists.

Deliberately no UI change this story either, same reasoning as 05.1-05.4: 07.1-07.3 own
the opportunity UI, and Phase C isn't finished yet (06.1-06.3, 07.1-07.3 still remain).

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1007 files, no violations), `lint:migrations` (110 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (41/41, +7 new), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings -- only the same empty-dev-table
"unused index" noise every new table in this session has shown), and a clean `next
build`. Same live-browser-walkthrough constraint noted in every prior story this run.

**Status**: 16 of 68 in-scope stories done -- **Phase C, Opportunity Model/Score/Signal
Correlation/Why Now/Negative Signals all done**. Next: 06.1, Evidence-Backed Research.

### 06.1 — Evidence-Backed Research (2026-09-11)

Checked the existing evidence model before adding anything, since blueprint §33
pre-dates this backlog and already built most of what this story asks for:
`prospect_research.evidence` (jsonb) already carried a `claim`/`source_url`/`confidence`
per item, with `confidence` already a fact/inference/assumption/unknown four-way split --
exactly the doc's own "AI must distinguish: Verified fact / Inference / Hypothesis /
Insufficient evidence" (same four categories, different display labels). The genuine
gaps against the doc's own field list (statement/source/source URL/source
date/supporting signal/confidence/evidence type) were: a *separate* `source`
description distinct from `source_url`, an `observed_at` date, a `supporting_signal`
link, and a real `confidence` field distinct from the type classification (the existing
field was doing double duty as both "what kind of claim" and implicitly "how sure",
conflated into one). Fixed the naming bug this revealed while extending it: renamed the
existing field `evidence_type` (what it actually represents) and added a genuinely
separate `confidence: low|medium|high` -- the same "type of thing vs. how sure" split
`timing_strength`/`confidence` already established for Why Now (05.4). `claim` ->
`statement` to match the doc's own vocabulary.

Since `evidence` is a jsonb column (no DB schema change), this needed no migration --
`EvidenceItemSchema` (`lib/ai/schemas.ts`) and `EvidenceItem`/`EVIDENCE_TYPE_LABEL`
(`lib/research/types.ts`) were extended directly. Bumped the research prompt to
`research_prospect_v2.ts` (new file; v1 untouched, per CLAUDE.md's own versioned-prompt
convention -- `ai_runs`' cache keys off this version string, so a schema-shape change
gets a real new cache generation rather than silently colliding with old cached runs
that don't have the new fields). `structureResearchPrompt` now spells out all seven
evidence fields explicitly, including that `supporting_signal` should repeat a
`buying_signals`/`recent_events` entry's exact text (free text, not a `discovery.signals`
row id -- evidence is generated before that table is ever populated, `syncSignalsFromResearch`
runs afterward off this same research row). `researchProspectPrompt` itself is
unchanged from v1 (already asked for a URL per claim and "don't invent facts" --
already what the doc asks for).

Found and fixed a real existing UI consumer while verifying -- typecheck caught it, not
a grep miss inside `module-discovery` alone (which has no evidence UI of its own): the
prospect detail page (`apps/web/.../prospects/[prospectId]/page.tsx`) already rendered
`research.evidence` with a local `CONFIDENCE_LABEL` map duplicating the same four
labels, and referenced the now-renamed `item.claim`/`item.confidence`. Replaced the
local map with the module's own exported `EVIDENCE_TYPE_LABEL` (one source of truth,
now saying "Verified fact"/"Hypothesis" per the doc's own wording instead of the old
"Fact"/"Assumption"), fixed the field references, and additionally surfaced `source`/
`observed_at` inline next to each statement (previously invisible information, now
free to show since the fields exist) -- did not add a `confidence` badge or
`supporting_signal` display here, leaving the fuller evidence presentation
(progressive disclosure: decision summary -> brief -> expandable evidence -> raw
signals) to 06.2's own "Research Brief" story, which explicitly owns that.

Verified with full monorepo typecheck (clean across all 9 workspaces after fixing the
`apps/web` consumer above -- this is the one story so far this run where typecheck
caught a real cross-package break, not just a self-check), `lint:boundaries` (1008
files, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning), `npm
run test -w @cofounderai/module-discovery` (41/41, unchanged -- no new pure function to
add a test for; the AI-calling wiring itself has no unit test in this codebase,
consistent with `understand-product.ts`/`generate-icp.ts`'s own precedent), and a clean
`next build`. No migration this story (jsonb column, no schema change) -- no
`get_advisors` step needed either. Same live-browser-walkthrough constraint noted in
every prior story this run.

**Status**: 17 of 68 in-scope stories done -- Phase C continuing. Next: 06.2, Offering
Research Brief.
