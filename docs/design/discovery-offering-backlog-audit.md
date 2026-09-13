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
| | 06.2 | Research Brief | Done |
| | 06.3 | Buyer Intelligence | Done |
| | 07.1 | Next Best Action | Done |
| | 07.2 | Today's Opportunities | Done |
| | 07.3 | Opportunity Detail | Done |
| D | 08.1 | Offering-Aware CRM Handoff | Done |
| | 08.2 | Existing Relationship Detection | Done |
| | 08.3 | Handoff Status | Done |
| E | 09.1 | Website URL Business Onboarding | Done |
| | 09.2 | Website Crawl & Content Discovery | Done |
| | 09.3 | AI Offering Extraction | Done |
| | 09.4 | Offering Review Before Activation | Done |
| | 10.1 | Run AI Discovery CTA | Done |
| | 10.2 | Persistent Pipeline Stage Model | Done |
| | 10.3 | Pipeline Progress UI | Done |
| | 11.1 | Editable Pipeline Stages | Done |
| | 11.2 | Run From This Stage | Done |
| | 11.3 | Stage Dependency Graph | Done (built first -- see its own log entry) |
| | 12.1 | Offering-Specific Website Research | Done |
| | 12.2 | External Opportunity Research | Done |
| | 13.1 | Structured Stage Outputs | Done |
| | 14.1 | Discovery Run History | Done |
| | 14.2 | Versioned Stage Results | Done |
| | 15.1 | Final Human Action Gate | Done |
| F (P1) | P1-01.1 | Scheduled Offering Re-Discovery | Done |
| | P1-01.2 | Incremental Re-Run | Done |
| | P1-02.1 | Review Required Indicators | Done |
| | P1-02.2 | Rerun Impact Confirmation | Done |
| | P1-03.1 | Offering Definition Quality | Done |
| | P1-03.2 | Missing Information Suggestions | Done |
| | P1-04.1 | Learn From User Edits | Done |
| | P1-04.2 | Learn From Outcomes | Done |
| | P1-05.1 | Offering Pipeline Workspace | Done |
| | P1-05.2 | Desktop Stage Tables | Done |
| | P1-05.3 | Editable Stage Rows | Not started |
| P1 (extra) | P1-01.3 | Account Watchlist | Not started |
| | P1-01.4 | Grouped Opportunity Alerts | Not started |
| | P1-02.3 (dup) | Offering Performance Analysis | Not started |
| | P1-03.3 | Provider-Agnostic Data Contracts | Not started |
| | P1-04.3 | Offering-Specific Contact Relevance | Not started |
| | P1-05.4 | Offering Overview UX Polish | Not started |

**51 of 68 in-scope stories done -- Phase E complete, Phase F underway.** (11.3 and 11.2 were both built
ahead of 11.1 -- see 11.3's own log entry for why.) (§10's own "Recommended P1 Sequence" and §29's Phase F
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

### 06.2 — Offering Research Brief (2026-09-11)

The doc's own twelve-field brief (Company/Offering Fit/Why Them/Why Now/Likely
Buyer/Buying Committee/Problem Hypothesis/Evidence/Potential Objection/Suggested
Opening/Recommended Action/Confidence) turned out to be mostly *already representable*
by fields this backlog already built, once mapped out explicitly: Company =
`prospects.company_name`/`description`; Why Now = `opportunities.why_now` (05.4);
Evidence = `prospect_research.evidence` (06.1); Recommended Action =
`opportunities.recommended_action` (deliberately left to 07.1 "Next Best Action," which
owns it -- generating it here would be front-running that story's own closed
vocabulary). Checked `lib/outreach/` before building anything new, since
`OutreachStrategy` (`strategy`/`reason`/`key_message`/`cta`) covers similar-sounding
ground: genuinely a *different* artifact for a *different* moment -- outreach strategy
is generated once a founder has already decided to reach out and needs a
channel/CTA/message angle, while a research brief is the *decision* aid that comes
before that decision is made (the doc's own "Decision summary -> Research brief ->
Expandable evidence -> Raw signals" progressive-disclosure order only makes sense
pre-decision). Conflating them would force a channel/CTA choice before a founder has
even decided whether to pursue -- kept them separate.

The two people-related fields -- Likely Buyer / Buying Committee -- are deliberately
**not** AI-generated: 06.3 "Buyer/Person Intelligence" (the very next story) explicitly
owns "do not invent people or roles," so 06.2 satisfies both fields with a plain
deterministic match (`lib/research-briefs/match-committee.ts`,
`matchBuyingCommittee()`) between a prospect's real `discovery.contacts` and the
offering's real `discovery.buyer_personas`, reusing `fuzzyIncludes` (already exported
for 05.5) against job title vs. persona title. A contact with no matching persona is
still shown, unassigned, never hidden or invented. Computed fresh on every read, not
persisted -- contacts and personas each change independently, so a stored snapshot would
risk going stale. Four new vitest cases cover a match, an unassigned contact, a null job
title, and an empty-personas case.

What's genuinely new -- and the only part requiring an AI call -- is four synthesis
fields: `offering_fit`, `problem_hypothesis`, `potential_objection`, `suggested_opening`,
plus the brief's own `confidence` (distinct from every other confidence field in this
module, per the "type/kind vs. how sure" split 05.4 already established -- this one is
"how sure am I in this synthesis given how much real evidence backs it"). New
`discovery.research_briefs` (one row per prospect, upsertable like `prospect_research`,
same select/insert/update RLS shape). New `ResearchBriefSchema` (`lib/ai/schemas.ts`,
deliberately small -- only the four new fields, everything else is referenced context,
not re-generated) and `generateResearchBrief()` (`lib/ai/generate-research-brief.ts`),
built directly off `generateOutreachStrategy()`'s own exact shape (gather
prospect/workspace/product/ICP/research, build a prompt, call `generateObject` at the
`reasoning` tier via the BYOK router, record the `ai_run`, upsert) -- registered as
`generate_research_brief` in `packages/core/src/ai/operation-registry.ts`, reasoning
tier + no web search (reuses `researchProspect()`'s own already-gathered findings,
"minimize LLM calls"). New `prompts/research/research_brief_v1.ts` feeds in the offering
profile, ICP, research findings, buyer persona titles, the opportunity's own `why_now`
(if one exists) and any detected negative signals (05.5) as grounding for
`potential_objection` -- explicitly instructed not to invent a generic objection when
real concerns are already on record. Mirroring 05.3/05.4's "write back into the
existing opportunity slot" pattern once more: when an opportunity already exists for
this prospect, the new `setOpportunityWhyThem()` (`lib/opportunities/mutations.ts`)
writes `offering_fit` straight into that opportunity's own `why_them` (05.1's own
long-empty slot, the qualitative counterpart to `why_now`) -- deliberately *not* wired
into any score component the way signal correlation/timing were, since a qualitative
narrative has no honest 0-100 number to become without inventing false precision.

UI: added a "Research brief" section to the prospect detail page, positioned *above* the
existing "Research" section (raw findings + evidence) rather than nested inside it --
the doc's own progressive-disclosure order puts the decision summary first, expandable
evidence and raw signals after. Reuses the page's existing `AiActionForm`/`DependencyArrow`
conventions exactly as the "Research"/"Score" sections already do. Shows a confidence
badge, the four synthesis fields, and the buying committee list (contact + matched
persona role badge, or unassigned) -- gated on research already existing, matching
`generateResearchBrief()`'s own server-side guard.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1014 files, no violations), `lint:migrations` (111 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (45/45, +4 new), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings), and a clean `next build`. Same
live-browser-walkthrough constraint noted in every prior story this run -- this one in
particular (a new AI-generation UI flow) would benefit most from an actual browser
check, which remains unavailable here.

**Status**: 18 of 68 in-scope stories done -- Phase C continuing. Next: 06.3, Buyer/Person
Intelligence.

### 06.3 — Buyer/Person Intelligence (2026-09-11)

The doc's own field list ("for each candidate person show: name, title, seniority,
likely role in buying committee, relevance to offering, contactability, supporting
evidence, confidence" -- "do not invent people or roles") turned out to already have two
of its eight fields covered by prior stories once mapped out: name/title are
`discovery.contacts` columns, and "likely role in buying committee" is exactly 06.2's own
`matchBuyingCommittee()` (a real persona match, or unassigned -- never invented). The six
genuinely new fields -- seniority, relevance to offering, contactability, supporting
evidence, and a confidence in this specific characterization -- are all derivable
deterministically from data this module already has (CLAUDE.md dev principle #4: don't
use an LLM for a deterministic operation), so this story is schema-free (no migration)
and AI-free: a new `lib/buyer-intelligence/` with one small pure function per field
(`seniority.ts` keyword-classifies a real job title into c_level/vp/director/manager/
individual_contributor/unknown; `contactability.ts` counts real email/LinkedIn/phone
channels into high/medium/low; `relevance.ts` reuses `fuzzyIncludes` (already exported
from `score-prospect.ts` for 05.5/06.2) to fall back from a matched persona's own
priority to a plain ICP target-role match, `unknown` -- not `low` -- when there's no job
title at all to judge; `supporting-evidence.ts` substring-matches a contact's name/title
against 06.1's own evidence `statement`/`supporting_signal` fields). "Do not invent
people or roles" holds structurally throughout, the same way 06.2's own
`matchBuyingCommittee` already made that instruction true a story early: every output
row wraps one real `discovery.contacts` row, and every field on it is either read
straight off that row or produced by one of these pure rules, never generated.
`intelligence.ts`'s own `buildBuyerPersonIntelligence()`/`computeBuyerIntelligence()`
combine all of the above (plus 06.2's `matchBuyingCommittee` for the persona match) into
one per-prospect list; confidence is the same "count how many signals are actually known,
never zero-fill" tiering 05.2's own `computeOpportunityScore` established (title present,
a persona/ICP match found, evidence found, a real contact channel on file -- 3+ of 4 is
high, 1-2 is medium, 0 is low), computed fresh on every read rather than persisted, same
reasoning `getBuyingCommitteeForProspect` (06.2) already gave for why a contacts/personas/
research snapshot would risk going stale.

Also noticed, and fixed, a real connection to 05.2's own scoring model: `buyer_fit_score`
and `contactability_score` are two of the seven named score components 05.2 defined but
nothing had ever populated -- the exact same situation `signal_strength_score` (05.3) and
`timing_score` (05.4) were each in before their own story wired them up. New
`computeBuyerFitScores()` (`lib/buyer-intelligence/scoring.ts`) picks the single strongest
real candidate (highest relevance, ties broken by contactability -- "unknown" relevance
candidates excluded from consideration entirely) and maps its relevance/contactability
onto the same low/medium/high -> 30/60/90 scale `attachSignalCorrelation`'s own
`CORRELATION_CONFIDENCE_TO_SIGNAL_STRENGTH` already established; both scores stay null
with no known candidate at all, no false precision. New
`setOpportunityBuyerIntelligence()` (`lib/opportunities/mutations.ts`) re-reads the
opportunity's other five components unchanged and reuses `setOpportunityScoreComponents`
-- `score` still can never be written except through `computeOpportunityScore`. Wired
from `generateResearchBrief()` (06.2's own AI flow, which already assembles contacts/
personas/ICP/research/opportunity in one place) right after its existing
`setOpportunityWhyThem` call: a fresh research brief is exactly the "decision aid" moment
06.3's per-person view exists to support, so recomputing buyer intelligence at the same
moment needed no new trigger point. Ten new vitest cases across
`seniority`/`contactability`/`relevance`/`supporting-evidence`/`intelligence`/`scoring`
cover the closed-vocabulary tiers, the "unknown vs. low" distinction, the null-with-no-
known-candidate case, and the relevance-then-contactability tie-break rule (module suite
now 70/70, up from 45 -- one real bug caught by the new seniority tests themselves before
they ever ran against real code: "Senior Vice President" was classifying as `c_level`
because "president" is a substring of "vice president", fixed by checking VP patterns
before C-level ones).

UI: promoted the existing "Buying committee" list (which lived nested inside the
Research Brief section, gated on a brief already existing) into its own standalone
"Buyer intelligence" section on the prospect detail page, positioned right after it --
buyer intelligence only needs contacts, which can exist before any research or brief
does, so gating it on a generated brief would hide real information unnecessarily. Each
contact renders as a compact card (name, title, seniority badge, role-in-committee badge
or "Unassigned role", confidence badge, then relevance/contactability with their own
plain-English reasons, then supporting evidence or an explicit "none found yet" line) --
deliberately not a `<Table>`: the same "few fields, no wide-table/mobile-card split to
design" reasoning `PersonaSection` (02.3) already established, so CLAUDE.md non-negotiable
#12 doesn't bite here either. Replaced the page's `getBuyingCommitteeForProspect` call
with the new, superset `getBuyerIntelligenceForProspect` (the old function/type stay
exported in `lib/research-briefs/` for any future direct consumer, just no longer this
page's own source of the list).

Verified with full monorepo typecheck (clean across all 9 workspaces -- this session's
worktree started with no `node_modules` at all, same environment quirk 05.3 already
flagged; `npm ci` at the repo root was required first, confirmed afterward to have caused
no lockfile drift), `lint:boundaries` (1060 files, no violations), `lint:migrations` (118
migrations, no violations -- no migration this story, schema unchanged), `npm run lint`
(0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (70/70, +25 new), and a clean `next build` (confirmed the
prospect detail route this story touched builds with no errors). No live migration apply/
`get_advisors` step this story -- no schema change. Same live-browser-walkthrough
constraint noted in every prior story this run (no seeded demo user/`.env.local` in this
environment) -- this one in particular (a new UI section with several derived badges)
would benefit most from an actual browser check, which remains unavailable here.

**Status**: 19 of 68 in-scope stories done -- Phase C continuing. Next: 07.1, Next Best
Action.

### 07.1 — Next Best Action (2026-09-11)

The doc's own field list here is a genuinely new closed vocabulary, not a rename of
anything existing: `opportunities.recommended_action` (05.1) was a free-text column
deliberately left empty for this story ("generating it here would be front-running
07.1's own closed vocabulary", per 06.2's own log entry above), and it had zero live
callers writing to it anywhere in the app -- `discovery.opportunities` has had no UI at
all since 05.1, by design, with 07.1-07.3 explicitly owning that. New
`lib/opportunities/next-best-action.ts` -- `computeNextBestAction()` -- deterministic, no
AI call (CLAUDE.md dev principle #4/#5): an ordered set of rules over a narrow, testable
input shape (mirroring `NegativeSignalDetectionInput`'s/`ScoreComponents`'s own "only the
fields this needs" precedent), each returning a plain factual reason alongside its
action -- "recommendation must be explainable" is satisfied by construction, no branch
synthesizes prose. Rule order: an opportunity already resolved (`sent_to_crm`/
`dismissed`/`expired`) gets no recommendation at all; a hard disqualifying negative
signal (05.5's own `wrong_industry`/`wrong_size`/`wrong_geography`/
`known_incompatible_solution`/`existing_active_relationship`/`recent_rejection` -- the
two "soft" reasons, `insufficient_evidence`/`no_relevant_problem`, deliberately excluded
from this list) outranks everything else and forces Dismiss; missing research or an
unscoreable opportunity (05.2's own null-score case) recommends Research More; no
contact, or the best real candidate's own contactability (06.3) is low, recommends Find
Better Contact; a reachable contact with no outreach drafted yet recommends Draft
Message; a strong (score >= 60), high-confidence opportunity already being worked
recommends Send to CRM; anything else with low confidence recommends Watch; otherwise
Wait is the steady-state default. Moved `NextBestAction`/`NEXT_BEST_ACTION_LABEL` into
`opportunities/types.ts` itself (not `next-best-action.ts`) to avoid a circular import
with `Opportunity`'s own `recommended_action` field, the same file `OpportunityStatus`/
`OpportunityConfidence` already live in.

Migration (`20260911005000_discovery_opportunity_next_best_action.sql`) constrains
`recommended_action` to the doc's own seven values (the same closed-vocabulary discipline
`status`/`confidence`/`priority` already have on this table) and adds
`recommended_action_reason` -- "recommendation must be explainable" needs the explanation
to travel with the value, the same precedent `score_reason` (05.2) already set. Safe as a
plain `alter table add constraint` with no backfill: confirmed zero existing rows could
violate it, since nothing has ever written to this column. New
`setOpportunityNextBestAction()` (`lib/opportunities/mutations.ts`) writes both together
in one call, mirroring `setOpportunityScoreComponents`'s own "value and explanation, one
write" shape. Left deliberately unwired from any live call site this story -- same
precedent 05.3's `correlateSignalsForProspect`/`attachSignalCorrelation` and 05.5's
`syncNegativeSignalsForProspect` already established (both still have zero callers
today): this recommendation depends on research, negative signals, buyer intelligence,
*and* message state all at once, and the actual trigger point for "recompute the next
best action for every opportunity" belongs to whichever of 07.2 (Today's Opportunities)
or 07.3 (Opportunity Detail) ends up owning opportunity-list refresh -- inventing a
premature wiring here risked getting that trigger wrong and having to redo it next story.
Twelve new vitest cases cover every rule branch, the resolved-status short-circuit, and
that a soft negative signal does not trigger Dismiss the way a hard one does (module
suite now 81/81, up from 70).

No UI change this story: unlike 06.2/06.3, the doc's own text for 07.1 has no "show" or
"display" instruction (07.2's own field list is the one that names "Recommended Action"
as a dashboard column), so displaying it is left to 07.2, which explicitly owns it,
rather than adding a UI surface here that 07.2 would then have to rework.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1030 files, no violations), `lint:migrations` (112 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (81/81, +12 new -- one more than "twelve new" above reads,
since one additional assertion loop covers all three resolved statuses in a single test),
a live migration apply + `get_advisors` for both `security`/`performance` (no new
findings -- the two new columns are constraint/data-only, no new index needed), and a
clean `next build`. Same live-browser-walkthrough constraint noted in every prior story
this run -- no UI was built this story regardless.

**Status**: 20 of 68 in-scope stories done -- Phase C continuing. Next: 07.2, Today's
Opportunities.

### 07.2 — Today's Opportunities (2026-09-11)

The first real gap this run surfaces head-on: `discovery.opportunities` has had zero
live callers creating rows anywhere in the app since 05.1 -- every one of 05.1-07.1 was
deliberately schema/lib-only, with the actual signal-matching pipeline that would create
opportunity rows belonging to Phase E (10.x, much later in §29's own sequence). Rather
than block this story on a pipeline that isn't due for many stories yet, or invent a
speculative creation trigger CLAUDE.md dev principle #7 would flag ("never implement
speculative functionality"), built the dashboard itself as a real, live-queried
consumer of the real schema -- it renders whatever `discovery.opportunities` actually
holds (nothing, in this dev environment, today) and will show real rows the moment
anything upstream creates them, exactly the way `OfferingsTable` (01.3) was a real,
working screen before any Offering had been created too. An honest empty state
("No active opportunities yet...") stands in for real data now, never a fabricated
example row -- the same "no false precision" discipline this entire run has held to.

New `lib/opportunities/dashboard.ts` -- `classifyOpportunityForDashboard()` -- pure,
deterministic (CLAUDE.md dev principle #4/#5), sorting an opportunity into exactly one
of the doc's own five bins (Hot/Needs Review/New/Watching/Insufficient Evidence) or
`null` for an opportunity already resolved (`sent_to_crm`/`dismissed`/`expired` --
this is an *active-work* dashboard, not a full history). Rule order: `watching` status
always keeps its own bin regardless of score (a founder's own explicit choice to keep
watching outranks whatever the score says); a null score (05.2's own "insufficient
evidence" case) always lands in Insufficient Evidence regardless of status, since there
is nothing real yet to judge urgency from; otherwise `new`/`reviewing`/`action_required`
opportunities split into Hot (high priority or score >= 75) vs. their own resting bin
(New, or Needs Review for `reviewing`/`action_required`). Six new vitest cases cover
every branch including the "watching wins over score" and "null score wins over status"
precedence rules.

New `lib/opportunities/dashboard-queries.ts` -- `getOpportunityDashboardRows()` --
composes one row per active opportunity with exactly the fields the doc's own row shape
needs beyond what's already a plain `Opportunity` column (Company/Score/Priority/
Offering Fit [`why_them`]/Why Now/Recommended Action all are already columns): "Contact"
reuses 06.3's own `computeBuyerIntelligence`/`computeBuyerFitScores` to pick the same
strongest real candidate buyer 06.3 already selects for `buyer_fit_score`, rather than a
second, different "which contact matters" rule; "Top Signal" is the *exact*
`signal_correlations` row this opportunity's own `signal_correlation_id` (05.3) points
to -- new `getSignalCorrelation(id)` (`lib/signals/queries.ts`) added since the only
existing lookup, `getLatestSignalCorrelation`, would show the prospect's newest
correlation even if a weaker one has run since without being re-attached to this
opportunity, which would misrepresent what actually justified this opportunity's own
score. Computed fresh per request, never persisted -- the same discipline 06.2/06.3
already established, since contacts/signals/research can each change independently of
the opportunity row.

UI: new `OpportunitiesDashboard` renders each non-empty bin as its own section, desktop
proto-table + mobile compact cards (CLAUDE.md non-negotiable #12) -- the exact same
responsive split `OfferingsTable` (01.3) already established, reused rather than
inventing a second pattern. An empty bin is skipped entirely rather than shown as an
empty section (five permanently-empty headings on every real page load today would be
worse than showing nothing). Company links to the prospect's own real, existing detail
page (`/prospects/[prospectId]`, already enriched with research brief and buyer
intelligence from 06.2/06.3) rather than a dedicated opportunity detail page -- that is
07.3's own story, and linking anywhere else today would be a dead link, the same
discipline 03.3 already established for nav destinations with no real page behind them
yet. New route `apps/web/.../products/[productId]/opportunities/page.tsx`, and a new
"Opportunities" tab added to `ProductNav`'s ongoing (post-setup) tab bar between
Discovery and Prospects -- the same "add a tab only once a real page exists behind it"
precedent 04.1 established for "Discovery"; Signals/Watchlist/Research still have no
page and stay out.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1035 files, no violations), `lint:migrations` (112 migrations, no violations -- no
schema change this story), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (87/87, +6 new), and a clean `next build`
(confirmed the new `/opportunities` route builds and appears in the route list). No live
migration apply/`get_advisors` step this story -- no schema change. Same
live-browser-walkthrough constraint noted in every prior story this run -- this one in
particular (a brand-new dashboard page, currently rendering its empty state against real
dev data with zero opportunity rows) would benefit most from an actual browser check,
which remains unavailable here; confirmed instead that the empty-state branch and the
populated-bin branch are both exercised by the classify function's own test suite and
that the page/query/component chain typechecks and builds end to end.

**Status**: 21 of 68 in-scope stories done -- Phase C continuing. Next: 07.3, Opportunity
Detail.

### 07.3 — Opportunity Detail (2026-09-11)

The doc's own ten-section list (Score/Why Now/Why Them/Primary Contact/Signals/Evidence/
Research Brief/Recommended Action/History/Feedback) turned out to be almost entirely
*already real data* by this point in the run -- nine of the ten stories before this one
(05.1-07.2) exist specifically to produce these fields, so this story's actual job was
composition and layout, not new domain logic. One deliberate omission: **Feedback** has
no real capture mechanism anywhere in this module -- `DISC-OFFER-P1-04.1`/`P1-04.2`
("Learn From User Edits"/"Learn From Outcomes") explicitly own building that as their own
future P1 stories. Building a feedback widget with nothing behind it now would be the
same speculative-functionality CLAUDE.md dev principle #7 forbids that 06.2 already
declined for "Recommended Action" a story early; omitted with an explanation in the
component's own doc comment rather than silently, the same way 03.2/03.3 documented their
own omitted sections. **History** is real but modest: `discovery.opportunities` has no
per-opportunity change log of its own, so it shows the opportunity's genuine own
timestamps (created/last evaluated/last updated) plus the prospect's real score history
(`prospect_scores`, already tracked) rather than inventing an audit trail this module
doesn't actually keep -- labeled "Prospect score history" specifically so it doesn't
overclaim to be the opportunity's own event log.

New route `.../products/[productId]/opportunities/[opportunityId]/page.tsx` fetches the
opportunity (guarding it belongs to this workspace) plus its prospect, signals (05.3),
research/evidence (06.1), research brief (06.2), buyer intelligence (06.3, reduced to its
own strongest real candidate via `computeBuyerFitScores`, the same selection 07.2's
dashboard row already uses for "Contact" -- one "who's the primary contact" rule, not
two), and ten most-recent prospect scores. New `OpportunityDetail` component renders all
nine real sections plus a grouped "Actions" block at the top ("actions must be clearly
grouped," doc's own words) holding the one action this view owns directly: a manual
status override via the previously-unwired `setOpportunityStatus` (05.1). Deliberately
excluded `sent_to_crm` from the status picker's own options -- that transition is Epic
08's own "Offering-Aware CRM Handoff" (08.1), which defines the actual payload (account,
contact, score, why them/now, research brief, signals, recommended action, discovery
definition -- 08.1's own literal list) a real handoff needs to carry; a bare status flip
here would let an opportunity claim `sent_to_crm` with none of that context ever actually
sent, so the picker's own helper text points at the prospect page's existing "Send to
CRM" button instead (the real handoff path today, pending 08.1's own offering-aware
rework).

Closed the loop with 07.2: the dashboard's own Company link previously pointed at the
prospect's detail page specifically because no opportunity detail page existed yet ("a
dead link otherwise") -- now that this story adds one, repointed both the mobile-card and
desktop-table links at the new `/opportunities/[opportunityId]` route, since that is now
the more directly relevant destination for a dashboard row about *this specific
opportunity*. The opportunity detail view still cross-links back to the prospect page
(company name heading, "view full buyer intelligence," "generate one on the prospect
page") for anything this view intentionally didn't duplicate.

Verified with full monorepo typecheck (clean across all 9 workspaces -- caught and fixed
one real mismatch: a `<form action={...}>` prop needs a void-returning server action per
Next.js's own typing, not one returning `{error}|{success}`, so
`updateOpportunityStatusAction` matches `updateProspectStatusAction`'s own existing
void-returning shape instead of inventing a second convention), `lint:boundaries` (1038
files, no violations), `lint:migrations` (112 migrations, no violations -- no schema
change this story), `npm run lint` (0 errors, 1 pre-existing unrelated warning), `npm run
test -w @cofounderai/module-discovery` (87/87, unchanged -- composition/UI only, no new
pure logic to test), and a clean `next build` (confirmed both the list and detail
`/opportunities` routes build and appear in the route list). Same
live-browser-walkthrough constraint noted in every prior story this run -- particularly
relevant here since, per 07.2's own note, `discovery.opportunities` still has no live
rows in this dev environment (the signal-matching pipeline that creates them is Phase E),
so this view's populated-data rendering is exercised only by typecheck/build against the
real schema, not by an actual click-through with a real row on screen.

**Status**: 22 of 68 in-scope stories done -- **Phase C complete**. Next: Phase D, 08.1
Offering-Aware CRM Handoff.

### 08.1 — Offering-Aware CRM Handoff (2026-09-11)

Checked the existing Discovery->CRM handoff before building anything new, since CRM-03.1
("Promote to CRM") already exists: `promoteProspectToCrm` (module-crm's own contract)
creates a `crm.lead` referencing the prospect *by id* (`source_module='discovery'`,
`source_reference=prospectId`), and its own confirmation dialog states the design
philosophy explicitly in its copy -- "Its product interest, ICP fit, buying signals, and
research stay linked back to this Discovery prospect rather than being copied -- the CRM
lead always reflects the latest Discovery data." That data flows live today through
`getProspectSummaryForParty`, a `module-discovery` contract function `module-crm` already
calls directly from five different files (Customer 360, timeline, journey, opportunity
mutations) -- mechanism 2 of ADR-5's own ranked list ("call another module's
`contract/index.ts` function... when you need an answer now"), already in heavy use
before this story touched anything. Given that established, explicit, in-app-documented
philosophy, extending *that* live read with the doc's own opportunity-level field list
(score/why them/why now/research brief/recommended action/discovery definition) is the
consistent move -- not inventing a second, copy-at-handoff-time mechanism for one new
field set when an extensible live one already exists and is exactly what the existing
dialog copy promises callers. (A `crm_note`-snapshot design was drafted first and
discarded once this precedent surfaced during review -- kept out rather than building two
competing philosophies side by side.)

New `ContractOpportunitySummary` (module-discovery `contract/types.ts`) and a
`latestOpportunity: ContractOpportunitySummary | null` field added to the existing
`ContractProspectSummary` -- purely additive, so none of the five existing call sites
need to change to keep compiling; only the ones that choose to render it do. Resolved
inside `getProspectSummaryForParty` via the prospect's own most-recently-created
opportunity (`listOpportunitiesForProspect`, 05.1 -- "most recent reflects current
state," the same convention `generateResearchBrief` already established for its own
opportunity lookup), pulling in a research brief's `offering_fit` as `researchBriefSummary`
and a new `getDiscoveryDefinition(id)` single-record lookup (`discovery-definitions/queries.ts`,
mirroring `getOpportunity`'s own by-id shape) for `discoveryDefinitionName`. The doc's own
"selected contact" and "account" fields needed no new plumbing at all: "account" is
whichever party this whole summary already hangs off of, and a Discovery contact is
already mirrored into `core.party_contacts` the moment it's created
(`addPartyContact`, established well before this backlog) -- a shared `core` table CRM
already reads directly (ADR-5 mechanism 1), no cross-module call needed either way.

Wired the new field into a real UI consumer rather than leaving it unread: the CRM
Customer 360 page's existing "Discovery" card now shows an "Opportunity" block (score/
priority badges, why them/now, Discovery's own recommended action, originating discovery
definition) directly below the existing buying-signals block, gated on `latestOpportunity`
being non-null.

The other real gap: `promoteProspectToCrm`'s existing button lives on the *prospect*
page and has no opportunity awareness at all -- clicking it doesn't know an opportunity
exists, let alone update one. New `sendOpportunityToCrmAction` + `SendToCrmButton`
(module-discovery's own `components/opportunities/`, a small deliberate duplicate of the
prospect page's `PromoteToCrmButton` rather than relocating that already-working,
unrelated `apps/web`-local file) added to the Opportunity Detail page's (07.3) own
grouped "Actions" section -- reuses `promoteProspectToCrm` completely unchanged (no new
payload to carry, since the contract extension above already makes CRM's own read of it
richer), and on success also transitions *this specific opportunity* to `sent_to_crm`
via the already-existing `setOpportunityStatus` (05.1) -- closing the loop 07.1's own
recommended-action vocabulary and 07.3's own status-picker both deliberately left open
for this exact story.

Verified with full monorepo typecheck (clean across all 9 workspaces on the first pass),
`lint:boundaries` (1039 files, no violations -- `module-discovery` importing nothing new
from another module, `apps/web` remaining the only caller of `module-crm`'s contract, as
before), `lint:migrations` (112 migrations, no violations -- no schema change this story,
purely additive TypeScript types plus one new query function), `npm run lint` (0 errors,
1 pre-existing unrelated warning), `npm run test -w @cofounderai/module-discovery`
(87/87, unchanged -- contract composition and UI only, nothing newly pure to test), and a
clean `next build` (confirmed both the opportunity detail route and the CRM customer
detail route -- the two surfaces this story touched -- build and appear in the route
list). Same live-browser-walkthrough constraint noted in every prior story this run --
particularly relevant to the new "Send to CRM" button and the Customer 360 "Opportunity"
block, both of which render against real dev data with zero opportunity rows today (per
07.2's own note on the signal-matching pipeline still being Phase E).

**Status**: 23 of 68 in-scope stories done -- Phase D continuing. Next: 08.2, Existing
Relationship Detection.

### 08.2 — Existing Relationship Detection (2026-09-11)

Checked for existing dedupe logic before building anything: `ensureProspectParty`
(`lib/prospects/party-sync.ts`) already prevents a *second* CRM lead for the *same*
Discovery prospect (idempotent on `source_reference=prospectId`, established well before
this backlog), but it always creates a brand-new `core.parties` row for a genuinely new
prospect with no fuzzy check against parties this business already has under a different
id -- the real gap the doc's own "prevent duplicate party/relationship creation" targets.
Fixing that gap by silently merging or blocking would itself be a destructive,
speculative action this platform's own discipline (recommended actions, negative
signals -- surface, never silently decide) argues against; the honest fix is "before
handoff classify" (the doc's own words) and let a human decide, exactly what this story
builds.

New `module-crm/src/lib/relationships/` -- `classifyExistingRelationship()` (`detect.ts`)
is pure and deterministic (CLAUDE.md dev principle #4/#5), given a narrow, testable input
shape (`RelationshipCandidateParty[]` + an optional contact-email match), mirroring the
same "only what this rule needs" precedent `NegativeSignalDetectionInput`/`ScoreComponents`
(module-discovery) already set. Priority order matches how far along a relationship
already is: an exact company-name match that's already a `customer` (via
`core.party_roles`) outranks one with an open `crm.opportunity`, which outranks one with
only an open `crm.lead`, which outranks a bare exact-name match with no established
relationship at all (`potential_duplicate`); a contact-email match under a *different*
party (same person, possibly a different company now) outranks a merely-fuzzy name
match; no match at all is `new_prospect`. Seven new vitest cases cover the full priority
ladder plus the email-match-beats-fuzzy-match rule. `queries.ts` gathers the real
`core.parties`/`core.party_roles`/`crm.lead`/`crm.opportunity` data (case-insensitive
exact/substring name matching, same spirit as `fuzzyIncludes` already established on the
Discovery side, reimplemented here rather than imported since it's module-crm's own
concern and importing across modules for one string-matching helper would be exactly the
tight coupling ADR-10 argues against) and calls the pure function -- read-only throughout,
never a write, matching "prevent... creation" via information, not automatic action.

New `classifyExistingRelationship` contract function (module-crm) -- `MODULE_NOT_LICENSED`
degrades to `null` at the call site (ADR-10's normal-result pattern), same as every other
contract call this backlog has wired. Wired into the Opportunity Detail page's own "Send
to CRM" flow (08.1): the page now classifies before rendering, passing the result into
`SendToCrmButton`'s confirmation dialog as an amber notice (shown for every status except
`new_prospect`, which needs no warning) -- the founder sees "Existing Customer"/"Existing
Lead"/etc. and its plain-English reason *before* confirming, then still decides for
themselves whether to proceed; nothing here blocks the send. `RelationshipMatch`'s shape
is declared locally in `SendToCrmButton` (structurally, not imported from `module-crm`)
-- the same "no cross-module internals import" discipline `PromoteResult` already follows
there, with `apps/web` (exempt from that rule) the one place bridging the two independent
declarations together.

Verified with full monorepo typecheck (clean across all 9 workspaces on the first pass),
`lint:boundaries` (1043 files, no violations -- `module-crm` gained no new cross-module
import, `apps/web` remains the sole caller of both `module-crm`'s and
`module-discovery`'s contracts), `lint:migrations` (112 migrations, no violations -- no
schema change this story), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (87/87, unchanged) and `npm run test -w
@cofounderai/module-crm` (164/164, +7 new), and a clean `next build` (confirmed the
opportunity detail route -- the one surface this story's UI touches -- builds with no
errors). Same live-browser-walkthrough constraint noted in every prior story this run.

**Status**: 24 of 68 in-scope stories done -- Phase D continuing. Next: 08.3, Handoff
Status.

### 08.3 — Handoff Status (2026-09-12)

The doc's own exact four states -- "Not Sent / Sent to CRM / Already in CRM / Handoff
Failed" -- deliberately distinct from `OpportunityStatus`'s own `sent_to_crm` value: this
is specifically about the *handoff mechanics themselves* (has it been sent, did the
attempt fail, does the account already have a CRM footprint from elsewhere), not the
opportunity's broader lifecycle. New pure `computeHandoffStatus()` (`lib/opportunities/handoff.ts`,
deterministic, no AI call -- CLAUDE.md dev principle #4/#5) with a clear priority order:
this opportunity's own `sent_to_crm` status is the most authoritative signal; a recorded
failure outranks a same-account CRM footprint found elsewhere (retry is only ever offered
for a failure *this* attempt produced, not inferred from someone else's success);
otherwise an existing lead under this same prospect reference means the account is
already in CRM even though this opportunity's own status hasn't caught up. Five new
vitest cases cover the full priority ladder.

"Not Sent" and "Sent to CRM" were already derivable from `opportunities.status` (05.1);
"Already in CRM" needed a new read -- `getDiscoveryHandoffLead` (module-crm's own
contract, backed by a new `getLeadBySourceReference` query reusing the exact
`(business_id, source_module, source_reference)` shape `promoteProspectToLead`'s own
idempotency check already established) -- rather than a new table, since this is exactly
the same lookup already used to prevent a duplicate lead, just exposed as a plain read so
the opportunity page can show it *before* a founder clicks Send, not only discover it
from the mutation's own `alreadyPromoted` flag afterward. "Handoff Failed" was the one
genuinely new fact nothing recorded anywhere: two new nullable columns on
`discovery.opportunities` (`handoff_failed_at`, `handoff_error`), written by a new
`recordOpportunityHandoffFailure()` when `sendOpportunityToCrmAction` (08.1) catches an
unexpected thrown exception (distinct from the `ok:false`/`MODULE_NOT_LICENSED` results
that flow are already normal ADR-10 outcomes) -- persisted so it survives a page reload
rather than only a transient toast, and a founder can see it and retry. `setOpportunityStatus`
(05.1) now clears both columns on any subsequent status write, including a successful
retry, so a stale failure never keeps misrepresenting the opportunity's current state.

UI: a `Badge` next to the existing `SendToCrmButton` (08.1) on the Opportunity Detail page
(07.3) showing the computed status (destructive styling for "Handoff Failed," secondary
for "Sent to CRM"/"Already in CRM," outline for "Not Sent"), plus the recorded error
message and a "click Send to CRM to retry" hint when failed -- the button itself needed no
new state, since clicking Send again already re-runs the same action that would clear the
failure on success.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1045 files, no violations), `lint:migrations` (113 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (92/92, +5 new) and `npm run test -w @cofounderai/module-crm`
(164/164, unchanged), a live migration apply + `get_advisors` for both
`security`/`performance` (no new findings), and a clean `next build` (confirmed the
opportunity detail route builds with no errors). Same live-browser-walkthrough constraint
noted in every prior story this run.

**Status**: 25 of 68 in-scope stories done -- **Phase D complete**. Next: Phase E, 09.1
Website URL Business Onboarding (the autonomous website-to-offering pipeline).

### 09.1 — Website URL Business Onboarding (2026-09-12)

Phase E's autonomous website-to-offering pipeline starts here: a founder gives a website
URL, a business is created immediately (never blocked on a website fetch/AI call), and
a persisted, watchable `discovery.website_onboarding_runs` row tracks the AI extraction
that follows -- "website inspection runs asynchronously, progress is visible, errors are
recoverable" only actually holds with a real row, not component-only state that vanishes
on reload. Business-scoped (`business_id`, not `workspace_id`): a business exists before
any offering does -- offerings/workspaces aren't created until 09.3/09.4 turn a reviewed
extraction into real rows -- so this run has no workspace to key off yet, the same
reasoning `ai_provider_credentials` already established for keying off `account_id`
instead. No delete policy, append-style like `ai_runs`/`prospect_scores`: a failed run
stays visible rather than disappearing, and retrying creates a fresh row instead of
erasing the failed one.

New `WebsiteBusinessProfileSchema` (`lib/ai/schemas.ts`) -- sixteen extracted fields
(business name, description, products/services, offering categories, industries served,
customer types, geographies, value propositions, use cases, problems solved, pricing
hints, case studies, testimonials, customer logos, technology platform, FAQs, contact
info), each a `WebsiteTextFieldSchema`/`WebsiteListFieldSchema` carrying its own
explicit/inferred/unknown status alongside its value -- the story's own "every extracted
item must distinguish explicitly stated / AI interpretation / unknown," not a flat string
that blurs the two. Also carries candidate page links for 09.2's own future multi-page
crawl to visit next (this story only fetches the one URL given). New
`understand-business-website.ts` (`lib/ai`) follows this module's established AI-call
shape exactly (BYOK model resolution, usage-limit check, `ai_runs` recording via
`input_hash`+`prompt_version`, structured `generateObject` output) -- no new pattern
invented for this one call.

New `lib/website-onboarding/{types,queries,mutations,url,sanitize}.ts`: `url.ts`/
`sanitize.ts` are pure, tested normalization/validation helpers (a bare domain becomes a
real `https://` URL, obviously-malformed input is rejected before ever reaching a fetch
or an AI call). UI: a new `website-onboarding-panel.tsx` component and a streaming route
handler (`apps/web/.../website-onboarding/route.ts`) reusing the exact established shape
`discover-products/route.ts` already uses elsewhere in this module, wired into
`create-business-modal.tsx`/`dashboard-chrome.tsx`/the dashboard's own actions as the new
entry point alongside the existing manual business-creation flow -- this is additive, not
a replacement; a founder can still create a business the old way.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1125 files, no violations), `lint:migrations` (122 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npm run test -w
@cofounderai/module-discovery` (108/108, +16 new), a live migration apply + `get_advisors`
for both `security`/`performance` (no new findings), and a clean `next build` (confirmed
the new `/website-onboarding` route builds and appears in the route list). Same
live-browser-walkthrough constraint noted in every prior story this run -- particularly
relevant here given a real website fetch + AI call is the entire point of this story.

**Status**: 26 of 68 in-scope stories done -- Phase E underway. Next: 09.2, Website Crawl
& Content Discovery.

### 09.2 — Website Crawl & Content Discovery (2026-09-12)

Built directly on 09.1's own foundation rather than a second flow: 09.1's
`understandBusinessWebsite()` only ever fetched the one URL a founder typed in
(`researchWebsite()`, a single page). This story replaces that single fetch with a real,
bounded multi-page crawl and keeps everything downstream (the structuring call, `ai_runs`
logging, the streaming route handler, the panel) working the same way, just fed richer
input.

New pure planning layer, `lib/website-onboarding/crawl-plan.ts` (CLAUDE.md dev principle
#4 -- no AI call decides which pages to visit): `extractPageLinks()` reads the exact
"label [absolute-url]" annotations `fetchPageText` (core's own, from 09.1) already
preserves on every anchor of a directly-fetched page -- deliberately *not* built on the
AI-structured `relevant_pages` field 09.1 already produces, since that field only exists
*after* a structuring call runs once, which would make building a crawl plan depend on an
AI call it doesn't need. `buildCrawlPlan()` then dedupes (by hostname+path, ignoring query
strings/fragments/trailing slashes), drops off-domain links (this story's own "stay within
the supplied domain by default"), categorizes each remaining link by keyword match against
its label/path into the doc's own literal priority list (Home/About/Products/Services/
Solutions/Industries/Use Cases/Pricing/Case Studies/Customers/Resources/FAQ/Contact/Other),
keeps at most one URL per category, and caps the result at 8 additional pages (this story's
own "prevent infinite crawling") -- the lowest-priority categories are the ones dropped
first when there are more distinct categories than the cap allows. 19 new vitest cases
cover link extraction (including the inherent ambiguity of a flattened page's text having
no real boundary between ordinary prose and an anchor's own label -- documented in the
function's own comment rather than glossed over), categorization priority, and every
dedup/cap/off-domain rule.

New `lib/website-onboarding/robots.ts` for "respect access/robots restrictions" -- a
minimal, dependency-free robots.txt reader (CLAUDE.md dev principle #2: no new package for
what's ultimately a flat list of `Disallow` prefixes for one user-agent group; crawl-delay,
sitemap directives, and `Allow` overrides are out of scope for a same-domain crawl bounded
to a handful of pages). `fetchRobotsRules()` is best-effort and fails open (a missing or
unreachable robots.txt means no restrictions, the same permissive default real crawlers
use) -- consistent with 09.1's own bias toward a direct fetch failing open rather than
blocking the whole run over a secondary concern. 11 new vitest cases cover parsing
(wildcard vs. named-agent groups, comments, grouped `User-agent` lines) and the prefix-match
allow rule.

New orchestrator `lib/ai/website-crawl.ts` (deliberately placed alongside
`research-website.ts` rather than under `lib/website-onboarding/`, matching this module's
existing convention that AI-research orchestration lives in `lib/ai/`): `crawlWebsite()`
fetches the homepage exactly as 09.1 did (throwing on total failure -- there's nothing to
build a profile from without it, so this is the one case that still fails the whole run),
checks it against robots.txt first, extracts candidate links from its raw findings, builds
the crawl plan, then visits each planned page with the same per-page fetch mechanism
(`researchWebsite()`'s own direct-fetch-then-provider-tool-fallback, this story's own
"support JavaScript-heavy sites through the available website inspection mechanism," reused
rather than re-implemented per page) inside its own try/catch. A secondary page's failure
is recorded and the crawl continues -- this story's own "support partial success": only the
homepage fetch (or a robots-disallowed homepage) can fail the entire run. Every succeeded
page's findings are combined into one blob, each headed by a "Page: `<label>` (`<url>`)"
line, for the structuring prompt to read from -- and every attempted page (homepage plus
whichever of the plan robots.txt allowed), succeeded or failed, comes back as a `CrawledPage`
for the caller to persist and display.

New `discovery.website_onboarding_pages` table (`20260912020000_discovery_website_onboarding_pages.sql`)
-- one row per page the crawl actually attempted, child of `website_onboarding_runs`
(read-through RLS policies against the parent run's own `business_id`, the same "child of a
tenant-scoped row" pattern `discovery.signal_correlations` already established against
`prospects`). This story's own "store source URL and retrieval timestamp" needed a real,
queryable row per page, not a summary count -- and a page skipped by robots/dedup/the cap is
never attempted, so it's correctly never inserted here either (nothing happened to record).
Append-only like the parent run and every other history-preserving table in this schema; the
FK was indexed from the start (`get_advisors` confirmed no new findings of any kind after
applying). New `recordWebsiteOnboardingPages()` mutation and `listWebsiteOnboardingPages()`
query (`cache()`-wrapped, same as `getLatestWebsiteOnboardingRun`).

`understand-business-website.ts` itself now calls `crawlWebsite()` instead of a single
`researchWebsite()` call, sums token/search usage across every page's own research call plus
the final structuring call into the *same one* `ai_runs` row per run (not one row per page --
preserving 09.1's own "one row per operation" discipline), and returns `{ profile, pages }`
instead of a bare profile so callers can persist the crawl's own page-level record. New
structuring prompt `prompts/business/understand_business_website_v2.ts` (v1 kept alongside
unchanged, per this module's own prompt-versioning convention already established by
`research_prospect_v1.ts`/`_v2.ts`) -- same per-field explicit/inferred/unknown discipline as
v1, extended to read multiple "Page:"-headed findings blocks instead of one page's own
findings, and told explicitly to attribute a fact to whichever crawled page actually said it.

Route handler (`website-onboarding/route.ts`) gained a new `"page"` stream event, sent as
each page is attempted (independent of the existing `"progress"` events, which only ever
cover the later structuring step), and persists the crawl's own returned `pages` via
`recordWebsiteOnboardingPages()` right after the run itself completes. Panel
(`WebsiteOnboardingPanel`) tracks these live during a run and also loads the prior run's own
persisted pages on render (`listWebsiteOnboardingPages`, new prop `initialPages`) -- a new
`CrawledPageList` shows each page's category, URL, and succeeded/failed status, both while
crawling ("Crawled 3 pages ... so far") and afterward, satisfying "crawl progress is
visible" as a real, reload-surviving list rather than a one-time toast.

One deliberate scope boundary, flagged rather than silently assumed: "extracted facts
retain source references" is satisfied at the *page* level this story (every fact came from
one of the pages recorded in `website_onboarding_pages`, and the prompt tells the model
which page said what) -- not yet at the *field* level (no per-field "this came from the
Pricing page" pointer on `WebsiteBusinessProfileSchema` itself). Finer-grained field-to-page
lineage is what DISC-OFFER-P0-09.3's own explicit "Source Pages" per proposed offering and
13.1's "Structured Stage Outputs" are for; adding it to the flat business profile now would
be speculative ahead of those stories actually needing it (CLAUDE.md dev principle #7).
Also flagged: a page's own crawled record is only persisted once the whole run succeeds
(matching 09.1's original "nothing persisted on failure but the error text") -- if the
*structuring* step fails after a successful crawl, the pages fetched are lost rather than
persisted standalone; broadening that would mean partially decoupling page persistence from
run completion, a larger change than this story's own scope asks for.

Verified with full monorepo typecheck (clean across all 9 workspaces -- this worktree
again started with no `node_modules` at all, same environment quirk 05.3 noted; `npm ci`
at the repo root was required first), `lint:boundaries` (1149 files, no violations --
`lib/ai/website-crawl.ts` importing from `lib/website-onboarding/{crawl-plan,robots}.ts`
stays an internal, same-package import, not a cross-module one), `lint:migrations` (127
migrations, no violations), `npm run lint` (0 errors, 1 pre-existing unrelated warning),
`npm run test -w @cofounderai/module-discovery` (132/132, +24 new -- caught and fixed one
real bug of its own along the way: an overly broad "case" keyword in the `use_cases`
category made "Case Studies" misclassify as `use_cases` instead of `case_studies`, found by
the new tests themselves, not by inspection), a live migration apply + `get_advisors` for
both `security`/`performance` (no new findings of any kind -- the new FK was indexed from
the start), and a clean `next build` (confirmed both `/dashboard/businesses/[businessId]/business`
and the `/website-onboarding` route handler build with no errors). Same
live-browser-walkthrough constraint noted in every prior story this run (no seeded demo
user/`.env.local` in this environment) -- particularly relevant here given a real multi-page
crawl against a real website is the entire point of this story.

**Status**: 27 of 68 in-scope stories done -- Phase E continuing. Next: 09.3, AI Offering
Extraction.

### 09.3 — AI Offering Extraction (2026-09-12)

Built on 09.1/09.2's own foundation exactly the way 09.2 built on 09.1's: no second crawl.
`understandBusinessWebsite()` already produces one combined, page-attributed findings
blob per run (09.2's own `crawlWebsite()`); this story adds a second structuring call
against that SAME blob -- `extractBusinessOfferings()` (`lib/ai/extract-business-offerings.ts`)
-- rather than re-fetching the site to ask a different question of it ("never send
unnecessary context to an LLM" / minimize LLM calls cuts both ways: reusing findings
already in hand beats a second research pass).

New `WebsiteOfferingCandidateSchema`/`WebsiteOfferingExtractionSchema` (`lib/ai/schemas.ts`)
-- exactly the doc's own ten-field list (name, description, offeringType, problemSolved,
targetCustomer, targetIndustry, valueProposition, evidence, confidence, sourcePages) per
proposed offering, as a list ("multiple offerings can be identified"), each item carrying
its own provenance rather than one blanket score for the whole call -- the same
"provenance is per-item" discipline `WebsiteTextFieldSchema`/`WebsiteListFieldSchema`
already established for the business profile. `offeringType` reuses the existing
`OfferingType` vocabulary (`lib/offerings/types.ts`, DISC-OFFER-P0-01.1) rather than a
parallel one, since a proposed offering eventually becomes a real `discovery.products`
row (09.4's own job). New prompt `prompts/business/extract_business_offerings_v1.ts`
carries the story's own central warning as an explicit instruction with a worked example
("24/7 monitoring" + "incident response" + "identity governance dashboards" described
separately is ONE offering, not three) -- the acceptance criterion most likely to fail
silently if left implicit.

New `sanitizeOfferingCandidates()` (`lib/website-onboarding/sanitize-offerings.ts`, pure
and unit-tested, CLAUDE.md dev principle #4): drops a nameless candidate, trims text
fields, clamps confidence into [0,1], and -- the two structural enforcements that matter
most here -- (1) filters `sourcePages` down to only URLs this run's crawl actually
succeeded on, so "extracted facts are traceable to source pages" holds in code rather
than by prompt request alone (a hallucinated source page is dropped, not trusted), and
(2) deduplicates an exact-name duplicate as a deterministic backstop on top of the
prompt's own consolidation instruction, merging in any additional source pages the
duplicate named rather than silently losing that evidence. 9 new vitest cases cover every
one of these rules independently.

New operation `extract_business_offerings` in `packages/core/src/ai/operation-registry.ts`
-- `balanced` tier (bounded synthesis over already-gathered text, the same tier
`summarize_customer`/`draft_review_response` use, not the `reasoning` tier multi-source
strategic synthesis like `generate_outreach_strategy`/`chat` needs), no web search (reuses
the crawl's own findings). Own `ai_runs` row (`extract_business_offerings`,
business_id-scoped like `understand_business_website`'s own row, for the same
"no workspace exists yet" reason) -- kept separate from the profile-structuring row rather
than folded in, the same "one row per operation" discipline every lib/ai/*.ts function in
this module already follows individually.

New `discovery.website_onboarding_offering_candidates` table
(`20260912050000_discovery_website_onboarding_offering_candidates.sql`) -- one row per
proposed offering, child of `website_onboarding_runs` via the same read-through-the-parent
RLS pattern `website_onboarding_pages` (09.2) already established. Checked the entity
ownership map (`docs/plan/00-MASTER-PLAN.md` §5) first per CLAUDE.md's own instruction --
no existing "offering candidate"/proposal concept there (it covers cross-module `core`
entities, not a single module's own onboarding-pipeline internals), so this is not a
duplicate of anything already listed. Insert/select policies only, deliberately no
update/delete yet -- DISC-OFFER-P0-09.4's own "edit, rename, merge, remove" review actions
are that story's scope to add (CLAUDE.md dev principle #7/#10: never implement
speculative functionality ahead of the story that actually needs it). New
`recordWebsiteOnboardingOfferingCandidates()` mutation and
`listWebsiteOnboardingOfferingCandidates()` query (`cache()`-wrapped, same pattern as the
pages table's own pair).

Route handler gained an `"offerings-progress"` stream event (mirroring `"page"`'s own
live-progress role, independent of the existing `"progress"` event which only ever covers
business-profile fields) and persists the extraction's own sanitized offerings via
`recordWebsiteOnboardingOfferingCandidates()` right after the run completes, alongside the
existing page persistence. The `"done"` event now also carries the offering list. Panel
(`WebsiteOnboardingPanel`) gained a new `initialOfferings` prop (loaded from the DB on
render, same reload-survives-refresh precedent `initialPages` set) and a new
`OfferingCandidateList` component -- one card per offering (name, type badge, confidence
percentage, description, problem/customer/industry/value-prop fields shown only when
non-null, a quoted evidence line, and clickable source-page links), reusing this file's
own established bordered-card/`Badge` visual language rather than inventing a second style
(this platform's own design-consistency rule). Deliberately read-only: no Edit/Merge/
Remove/"Create Offerings" action here -- that is DISC-OFFER-P0-09.4's own explicit next
story, and adding it now would mean guessing at exactly what an edit/merge/remove
operation writes before that story defines it.

One deliberate scope boundary, flagged rather than silently assumed (the same kind of note
09.2's own log made about page persistence): if offering extraction fails after a
successful crawl and profile structuring, the whole run fails rather than completing with
a profile but no offerings -- "one run, one outcome" stays simpler than partially
decoupling the run's own two structuring steps, and a provider failure at the extraction
step (e.g. an invalid key) would very likely have failed the profile step moments earlier
too, so the realistic cost of this choice is low. Also flagged: this story's own
acceptance criterion "User can edit, rename, merge, remove or add offerings" is only
partially satisfied here -- the *data model* supports it (each candidate is already its
own row), but the interactive actions themselves are 09.4's "Offering Review Before
Activation" own explicit scope (its mockup shows the actual Edit/Merge/Remove buttons and
the "Create Offerings" activation step); building them now ahead of 09.4 defining exactly
what a merge writes would be the same kind of speculative work CLAUDE.md dev principle #7
warns against.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1157 files, no violations), `lint:migrations` (131 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npx vitest run --root
packages/module-discovery` (141/141, +9 new), a live migration apply + `get_advisors` for
both `security`/`performance` (no new findings of any kind -- the new FK was indexed from
the start, and the new table's own two policies are the only ones on it, matching
`website_onboarding_pages`'s own shape), and a clean `next build` (confirmed both
`/dashboard/businesses/[businessId]/business` and the `/website-onboarding` route handler
still build with no errors). Same live-browser-walkthrough constraint noted in every prior
story this run (no seeded demo user/`.env.local` in this environment) -- particularly
relevant here given a real AI extraction call against real crawled website content is the
entire point of this story.

**Status**: 28 of 68 in-scope stories done -- Phase E continuing. Next: 09.4, Offering
Review Before Activation.

### 09.4 — Offering Review Before Activation (2026-09-12)

Turns 09.3's read-only `OfferingCandidateList` into the doc's own literal mockup ("We
found N Business Offerings" + checkmarks + [Edit] [Merge] [Remove] + [Create Offerings]):
the founder now explicitly reviews, edits, merges, or removes proposed offerings before
any real `discovery.products` row is created -- "AI suggestions are always editable
proposals, never silently auto-saved as fact" now holds for offerings the same way it
already held for the business profile (`applyWebsiteOnboardingProfileAction`, 09.1).

New pure, unit-tested `lib/website-onboarding/offering-review.ts` (CLAUDE.md dev principle
#4 -- merge is field consolidation, not a judgment call, so no LLM involved):
`mergeOfferingCandidates()` combines two or more selected proposals into one ("[Merge]"),
first-candidate-wins for most fields but a later candidate fills a gap the first left
null, descriptions joined (deduplicated) rather than one side's silently discarded, source
pages unioned. `offeringInputFromCandidate()` maps a reviewed candidate onto
`createOffering()`'s own shape -- the Offering row's single flat `target_market` field
gets `targetCustomer`/`targetIndustry` combined ("customer — industry") rather than
discarding one of the candidate's two separate fields. 15 new vitest cases cover every
merge rule and every target-market combination independently.

New `activated_at timestamptz` column on `website_onboarding_runs`
(`20260912060000_discovery_website_onboarding_runs_activated_at.sql`, no new RLS --
the existing update policy from 09.1's own migration already covers writing it) -- "the
user explicitly activates the final offering list" needs a durable guard against
activating the same run's offerings twice (a reload racing a slow request, a
double-click), the same reason `applied`-style ephemeral-only state elsewhere in this
panel would not have been safe to reuse here: unlike re-applying a name/description
(idempotent), clicking "Create Offerings" twice would create duplicate `discovery.products`
rows without a server-side guard. New `markWebsiteOnboardingRunActivated()` mutation, set
only after every offering in the batch is created.

New server action `createOfferingsFromWebsiteOnboardingAction` (apps/web's own
`actions.ts`) -- re-checks the run's own `activated_at` server-side before creating
anything (never trusts the client alone), then calls the existing `createOffering()`
(`lib/offerings/mutations.ts`, DISC-OFFER-P0-01.3's own manual "Create" path) once per
surviving reviewed offering, so every side effect that function already has (the
workspace/inventory-mirror trigger) happens identically here -- no parallel creation path
invented for this flow. Flagged rather than silently assumed: this loops one
`createOffering()` call per offering rather than a single bulk insert, so a failure
partway through a multi-offering batch could leave some offerings created and the run
still unactivated (a retry would then risk duplicating the ones that already landed) --
accepted for now since `createOffering()` itself already does two sequential writes
(insert + profile update) per call, so a truly atomic bulk path would be a larger change
than this story's own scope asks for, and a mid-batch DB failure here is no likelier than
in the existing manual "Create" dialog's own single-offering path.

Panel (`WebsiteOnboardingPanel`) gained a new `activateOfferingsAction` prop and a new
`offeringsActivated` boolean (seeded from `initialRun.activated_at`, so a page reload
after a real activation shows the confirmation banner immediately rather than the review
list again). `OfferingCandidateView` gained a stable `id` (the real DB row id once
persisted, a generated one for a still-streaming candidate) so the review UI can track
per-row include/merge-select/editing state. The former read-only `OfferingCandidateList`
is now `OfferingActivationReview` + `OfferingReviewCard`: every offering starts included
(checkbox), an inline "Edit" toggles the card into editable inputs for every field
`createOffering()` accepts (name, description, offering type, problem solved, target
customer/industry, value proposition) -- per this platform's own "inline editing over a
separate page" design rule -- a "Merge" checkbox per card plus a "Merge N selected" button
once two or more are checked, "Remove" drops a card from the list entirely (not a DB
delete -- there is still no delete policy on the candidates table, matching 09.3's own
scope note), and a bottom "Create N Offerings" button calls the new action with exactly
the currently-included, possibly-edited-or-merged set. On success the panel switches to a
plain confirmation banner (the OfferingsTable already below it shows the real created
rows via `router.refresh()`) rather than re-rendering the review list.

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1151 files, no violations), `lint:migrations` (128 migrations, no violations), `npm run
lint` (0 errors, 1 pre-existing unrelated warning), `npx vitest run --root
packages/module-discovery` (156/156, +15 new), a live migration apply + `get_advisors` for
both `security`/`performance` (no new findings -- a single `alter table ... add column`
adds no new index/RLS surface), and a clean `next build` (confirmed both
`/dashboard/businesses/[businessId]/business` and the `/website-onboarding` route handler
still build with no errors). Same live-browser-walkthrough constraint noted in every prior
story this run (no seeded demo user/`.env.local` in this environment).

**Note on this session's own git state**: this worktree's HEAD was found, at the start of
this story, sitting on a commit belonging to the concurrent Platform Admin Portal
workstream's own scratch-merge branch (`c5a3674`, ancestor of `origin/main` but not of
`origin/disc-offering-backlog`) rather than this branch's own tip -- an environment/
worktree-reuse artifact, not anything this session did. Caught before committing (a
`git log --oneline -3` sanity check showed a platform-branded merge commit where
`disc-offering-backlog`'s own 09.2 commit was expected). Fixed by stashing the
already-written 09.3 changes, creating a fresh local branch from `origin/disc-offering-
backlog`'s actual tip, reapplying the stash there, and re-running the full verification
suite before committing -- no platform-admin-portal or compliance file was ever touched by
either story's diff (confirmed via `git status`/`git diff` before every commit this
session). Flagging this here since it affects how this run's own git history reads, not
because it changed anything about what was built.

**Status**: 29 of 68 in-scope stories done -- Phase E continuing. Next: 10.1, Run AI
Discovery CTA.

### 10.1 — Run AI Discovery CTA (2026-09-12)

New sub-epic ("One-Click Autonomous Offering Discovery", §14 of the doc, folded into
Phase E per §29's own sequence) -- read §13/§14/§25/§29 in full before writing any code,
per the dispatch instructions. Re-verified branch state first: this worktree's HEAD was
found sitting on `worktree-agent-afe67e8fbdcfe6ede` (a compliance-workstream commit,
`a95ae42`), not `disc-offering-backlog` -- the same worktree-reuse artifact 09.4's own log
already documented once. Fixed the same way: working tree was already clean (nothing to
stash), so this was a plain `git checkout disc-offering-backlog` onto its real
origin-tracked tip (`a569a34`) rather than a stash/reapply. Confirmed via
`git log origin/main..origin/disc-offering-backlog --oneline` being empty (every prior
story's merge-to-main had already landed) before writing anything.

Inspected the existing implementation before designing anything, per the doc's own
"Claude Code must inspect the actual current implementation... this document is the
target-state backlog, not permission to rebuild from scratch": Phases A-D already built
real, tested, deterministic logic for every stage this pipeline needs to run (ICP
generation, signal correlation, scoring, why-now, buyer intelligence, next-best-action,
handoff status) but **nothing anywhere in the codebase had ever wired them together
end-to-end for a real prospect** -- confirmed by grepping for every call site of
`setOpportunityScoreComponents`/`createOpportunity`/`attachSignalCorrelation`/etc. across
`src/actions`/`src/components` and finding none. This story is genuinely the first place
Discovery computes a real opportunity from research to recommendation, not a re-wiring of
something that already worked; the "no existing pipeline" finding shaped the entire
design below.

**Schema**: new `discovery.pipeline_stages` -- one row per `(workspace_id, stage_key)`,
the doc's own exact fourteen-stage list and exact six-status vocabulary (10.2's own
field list), deliberately *without* 10.2's `version`/`input_version`/`output_version`
columns -- 10.1's own acceptance criteria only ever says "retried", never "versioned",
and 10.2's own title ("Persistent Pipeline Stage Model") plus its explicit "Reruns create
new versions rather than silently destroying history" is a distinct, separable
follow-on story, not implied by 10.1's own criteria. Same four-policy
`discovery.user_workspace_ids()` RLS pattern (tenant AND licensed) every other
workspace-scoped table in this schema uses; no delete policy (a stage row is reset in
place, never removed). Both FKs indexed from the start.

**The architecture decision that shaped everything else**: initially planned one long
streamed request running all fourteen stages in sequence (the same shape
`website-onboarding/route.ts`, 09.1, uses for its own two-step call) -- caught before
writing it that this was unsafe here specifically: several stages call *existing*,
independently-designed AI functions (`understandProduct`, `generateIcp`,
`discoverProspects`, `researchProspect`, `generateResearchBrief`) that each read
product/ICP/prospect state through this app's own React `cache()`-wrapped query
functions (`getProduct`, `getIcpProfile`, etc.). Chaining several of them inside one
shared request risks an early stage's DB write (e.g. a freshly-generated
`product_profile`) being invisible to a later stage's own *internal* cached read of that
same row within the same request/cache scope -- e.g. `generateIcp()`'s own
`getProduct(productId)` call could return a stale pre-profile snapshot immediately after
`understandProduct()` had just written one, moments earlier in the same request,
incorrectly throwing "Generate a product profile before defining an ICP." Resolved by
running **one stage per HTTP request** instead: the client-side panel drives a loop,
POSTing one `stageKey` at a time and awaiting each response before firing the next. Every
stage this way gets its own fresh request and fresh cache scope -- identical to how every
other single-AI-action call in this module already runs today -- which eliminates the
staleness risk entirely rather than working around it. This also turned out to make
"leave and return" and "progress is visible" more honest, not less: every stage
transition is a real, complete, separately-committed HTTP round trip, not buried inside
one long-lived stream that a closed tab could sever mid-stage.

**Fourteen stage handlers** (`lib/pipeline/handlers.ts`), each reusing an already-built
function rather than inventing new intelligence:

- `website_understanding` + `offering_profile`: `understandProduct()` (already existing)
  does the live website research AND the profile-structuring AI call together as one
  operation; `website_understanding` runs it (with its own existing freshness/dedup
  checks -- CLAUDE.md dev principle #5), `offering_profile` just confirms the resulting
  profile exists. Kept as two stage rows rather than one because 10.2's own stage-key
  list names them separately and DISC-OFFER-P0-11.x's "Run From This Stage" will want to
  attach a rerun affordance to the *profile* independent of re-researching the site.
- `icp`: `generateIcp()` then `approveIcpProfile()` -- automation runs through to a human
  decision point near the *end* of the pipeline (§13's own diagram places "Human
  Approval" right before CRM Handoff, not at every intermediate step), and every
  downstream function already hard-requires an approved ICP to do anything
  (`discoverProspects`, `detectNegativeSignals`). A founder can still edit/re-approve it
  by hand afterward exactly as before.
- `buyer_personas`: new `deriveBuyerPersonasFromIcp()` (`lib/personas/derive.ts`) --
  **deterministic, not an AI call** (CLAUDE.md dev principle #4): one persona per the
  ICP's own already-approved `roles`, classified into the doc's six-value committee-role
  vocabulary by whole-word keyword match (title text is proposing structure over a fact
  already approved, not inventing new people). Caught a real bug via its own new test:
  a naive `.includes()` substring match classified "Director of IT" as `executive_buyer`
  because the literal substring "cto" appears inside "dire-**cto**-r" -- fixed by
  tokenizing the title into words and matching short markers (`cto`/`vp`/`cio`/etc.)
  against whole words only, keeping substring matching only for genuine multi-word
  phrases ("vice president", "head of"). 7 new vitest cases, including this exact
  regression. New `seedBuyerPersonasFromIcp()` mutation only ever adds (dedupes
  case-insensitively against existing titles, whether founder- or AI-created), never
  edits/removes -- a founder's own manual edits are never silently overwritten (§25).
- `discovery_strategy`: new `seedDiscoveryDefinitionFromIcp()` -- deterministic field
  mapping from the ICP's own industries/geographies/roles/buying_signals/exclusions onto
  `createDiscoveryDefinition()`'s existing input shape. Only creates when the workspace
  has *no* discovery definition yet at all (whether founder- or AI-created) -- never
  touches an existing one, same "don't silently overwrite" discipline as personas.
- `account_discovery`: `discoverProspects()` (already returns enriched fields per
  candidate, so no separate "enrichment" call exists to make), then **automatically**
  `approveProspectSuggestions()` for everything found -- unlike the founder-facing manual
  "Discover" page, where a human reviews each suggestion first, this autonomous run needs
  real prospect rows for every downstream stage to act on. Flagged as a deliberate
  decision, not an oversight: §25 permits automation to "create/update Discovery
  records" (an internal record, nothing external), duplicates are already excluded by
  `discoverProspects`' own `findDuplicateProspect` check, and the doc's own §13 diagram
  shows Accounts flowing straight through with no review gate before Signals.
- `signals`: a stable, resumable selector (`prospectsPendingOpportunity` -- prospects
  under the active definition with no Opportunity yet, capped at 10) rather than an
  in-memory "this run's accounts" list threaded across the now-separate per-stage
  requests. For each: `researchProspect()` (real AI call) ->
  `syncSignalsFromResearch()` -> `syncNegativeSignalsForProspect()` -> `createOpportunity()`
  (DISC-OFFER-P0-05.1's own model: an opportunity is inherently a prospect+definition
  pairing, first established here). One account's research failing doesn't fail the
  whole stage -- partial success, the same precedent 09.2's crawl already established.
- `signal_correlation`: `correlateSignalsForProspect()` + `attachSignalCorrelation()`
  (both already existing, 05.3) for every open opportunity still lacking a correlation.
- `opportunity_scoring`: **deliberately a checkpoint/reporting stage, not new
  computation** -- 05.2's own `computeOpportunityScore` already recomputes automatically
  every time `attachSignalCorrelation`/`setOpportunityWhyNow`/
  `setOpportunityBuyerIntelligence` write a component. No new scoring dimension invented
  for `icp_fit`/`buyer_fit`(pre-contact)/`need_fit` -- 05.2's own "no false precision"
  rule already correctly leaves an unpopulated component out of the average rather than
  zero-filling it, and inventing a new heuristic for those now would be scope creep into
  an already-closed, already-tested story (CLAUDE.md dev principle #7).
- `why_now`: `computeWhyNow()` (05.4, already existing), fed a freshly-recomputed
  correlation (deterministic given the same persisted signals, so this is not a second
  AI call) for every opportunity still missing a `why_now`.
- `research`: `generateResearchBrief()` (06.2, already existing -- and, as a documented
  side effect, already computes and writes buyer intelligence too, 06.3) for the
  **top three** open opportunities by score lacking research -- "Research Top
  Opportunities," read literally, not every account this run touched.
- `buyer_intelligence`: covers the remainder `research` doesn't reach -- any open
  opportunity with real contacts on file (e.g. from a manual add or CSV import) that
  wasn't one of the top-three research picks. Purely deterministic
  (`computeBuyerIntelligence`, no AI call); an opportunity with zero contacts on file is
  correctly left alone -- automation must not invent a person (§25).
- `recommended_action`: `computeNextBestAction()` (07.1, already existing, deterministic)
  fed exactly the narrow input it needs from data every earlier stage already produced.
- `crm_handoff`: **read-only, no persistence** -- handoff readiness is already a live,
  computed-on-read value everywhere else it's shown (Opportunity Detail). This stage
  counts how many open opportunities are ready for a founder to review and send, and
  sends nothing itself (DISC-OFFER-P0-15.1 / §25: automation must not send outbound
  communication without approval). Implemented in the **route handler**, not inside
  `module-discovery`'s own `lib/pipeline/handlers.ts` -- every existing cross-module
  Discovery/CRM read in this codebase (the Opportunity Detail page) already calls
  `@cofounderai/module-crm/contract` from the `apps/web` layer rather than from inside
  module-discovery's own package, and this follows that same established placement
  rather than being the first to add a module-crm dependency to module-discovery itself.

**Route** (`products/[productId]/run-ai-discovery/route.ts`): `POST { stageKey }` runs
exactly that one stage, persists the resulting status via the new
`markPipelineStageRunning`/`Completed`/`Failed`/`Skipped` mutations, and returns the
updated row; `GET` returns the full current stage list (for a client that wants to
refresh against another tab's progress). A `skipped` outcome (e.g. "no new accounts
found") is a distinct, honest status from `failed` -- nothing went wrong, there was
simply nothing new to do -- the same "don't collapse two true things into one status"
discipline 05.5's own `insufficient_evidence` vs. `no_relevant_problem` split already
established.

**UI**: `RunAiDiscoveryPanel` (offering Overview page, above the existing 03.2 summary --
shown unconditionally, unlike 03.2's own profile-gated dashboard, since this *is* the
entry point that can create the profile in the first place) -- the doc's own exact button
copy ("Run AI Discovery" / "Automatically research this offering, build its ICP,
identify buyers and signals, find opportunities, and prepare recommended actions"), a
plain ordered checklist of all fourteen stages with a status icon each
(check/spinner/circle/x), and a per-stage Retry action once failed. Deliberately not
DISC-OFFER-P0-10.3's own polished non-technical mockup (that visual pass is its own
explicit next story) -- this is the minimum real, working progress view 10.1's own
"Progress is visible" criterion needs. No compact-card treatment needed (CLAUDE.md
non-negotiable #12 doesn't bite -- this is a checklist, not a table of rows, the same
reasoning 02.3's persona cards already established).

Verified with full monorepo typecheck (clean across all 9 workspaces), `lint:boundaries`
(1161 files, no violations -- confirmed the new `crm_handoff` cross-module read stayed at
the `apps/web` layer, not inside `module-discovery`), `npm run lint` (0 errors, 1
pre-existing unrelated warning), `lint:migrations` (130 migrations, no violations), `npx
vitest run --root packages/module-discovery` (163/163, +7 new -- including the
"Director of IT" misclassification regression caught and fixed during this story, not
after), a live migration apply + `get_advisors` for both `security`/`performance` (no new
findings -- the pre-existing `rls_enabled_no_policy` findings are unrelated tables from
other workstreams; the new table's own three policies are exactly the established
pattern), and a clean `next build` (confirmed both the rewritten offering Overview page
and the new `run-ai-discovery` route handler build with no errors, and appear in the
route list). Same live-browser-walkthrough constraint noted in every prior UI-touching
story this run (no seeded demo user/`.env.local` in this environment).

**Status**: 30 of 68 in-scope stories done -- Phase E continuing. Next: 10.2, Persistent
Pipeline Stage Model.

### 10.2 — Persistent Pipeline Stage Model (2026-09-12)

The doc gives this story no "Acceptance criteria" heading at all (unlike every other
story in this backlog) -- just the field list and "Reruns create new versions rather
than silently destroying history." Treated as schema-and-behavior-only, no UI, the same
precedent DISC-OFFER-P0-05.1 already established for a story with real acceptance
criteria but none of them UI-shaped.

10.1 already built the *current-state* row (`discovery.pipeline_stages`: status/
started_at/completed_at/failed_at/error/last_ai_run_id) but its own
`markPipelineStageRunning` **cleared** `failed_at`/`error` on every retry -- exactly the
"silently destroying history" this story's own explicit line names. Checked the entity
ownership map (`docs/plan/00-MASTER-PLAN.md` §5) first -- no existing "stage
run"/"version" concept there (module-internal pipeline machinery, not a `core` entity),
confirming this is genuinely new rather than a parallel of something already listed.

Migration (`20260912080000_discovery_pipeline_stage_versioning.sql`): adds the doc's own
named `version`/`input_version`/`output_version` columns to `pipeline_stages`, plus a new
append-only `discovery.pipeline_stage_runs` table -- one immutable row per finished
attempt (completed/failed/skipped only; a `running` state has nothing to preserve yet),
the same "current value on the live row, full history on its own table" pattern
`discovery.prospect_scores` (history) vs. `prospects.fit_score` (current) already
established in this schema. `version` is a plain per-stage attempt counter (1st run = 1,
each retry increments it) -- deliberately **not** yet the richer "ICP v1/v2/v3 with full
content snapshots" DISC-OFFER-P0-14.2's own "Versioned Stage Results" describes, which
owns snapshotting a stage's actual *output content*, a distinct and larger concern left
for that story to build on top of the version numbers introduced here rather than
duplicated now. `input_version`/`output_version` are the doc's own named fields, added
now schema-first (the same precedent DISC-OFFER-P0-01.1 set widening `products.status`
ahead of 01.3) but left nullable and unpopulated with real cross-stage lineage until
DISC-OFFER-P0-11.3's "Stage Dependency Graph" gives them something real to record --
populating them with a bare copy of `version` itself now would be redundant, not useful.
Both tables' FKs indexed from the start; the new table's own `unique (workspace_id,
stage_key, version)` already covers a "history for this stage" lookup via its own
leftmost prefix, so no separate index was added for it (confirmed via `get_advisors`
afterward -- no new findings of any kind, security or performance).

`markPipelineStageRunning` now reads the row's current `version` and writes `version + 1`
on every entry (a plain read-then-write, not an atomic SQL increment -- the Supabase JS
client has no such helper, and concurrent runs of the same stage are already excluded by
the run-ai-discovery panel only ever driving one stage at a time, the same single-flight
assumption `discoverProspects`' own per-workspace lock formalizes for its own operation).
`markPipelineStageCompleted`/`Failed`/`Skipped` each now also insert a
`pipeline_stage_runs` row capturing that exact attempt (version/status/started_at/
completed_at/error) immediately after updating the current-state row -- the retry no
longer erases what happened last time, it's simply superseded on the live row while
staying permanently queryable on its own. New `listPipelineStageRuns()` query, exported
even though nothing consumes it yet (10.2 itself has no UI criteria) -- the same "export
it now, a later story wires up the display" precedent DISC-OFFER-P0-02.3's own
`listBuyerPersonas` already set ahead of DISC-OFFER-P0-06.3 actually consuming it; a
history table nothing can read back would leave "persistent" only half true.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (unchanged, no new files
outside module-discovery/apps-web), `lint:migrations` (130 migrations, no violations),
`npx vitest run --root packages/module-discovery` (163/163, unchanged -- the new
mutations are DB-composing wrappers, same "no unit test for a DB-composing function"
precedent 01.1 already established, not pure logic needing its own test), a live
migration apply + `get_advisors` for both `security`/`performance` (no new findings of
any kind -- same baseline `rls_enabled_no_policy`/`unused_index` counts as every prior
story, all on unrelated tables), and a clean `next build`.

**Status**: 31 of 68 in-scope stories done -- Phase E continuing. Next: 10.3, Pipeline
Progress UI.

### 10.3 — Pipeline Progress UI (2026-09-12)

The doc's own mockup for this story shows nine plain-language lines (Website
Understanding / Offering Profile / ICP / Buyer Personas / Discovery Strategy / Signal
Intelligence / Opportunity Scoring / Research / Recommended Action) with a single
✓/●/○ vocabulary -- not DISC-OFFER-P0-10.2's own fourteen persisted *technical* stage
keys. Recognized this as a presentation-layer grouping problem, not a schema change: the
persisted state stays exactly as granular as 10.2 built it (nothing about
`discovery.pipeline_stages`/`pipeline_stage_runs` changes this story), and a new
`computeDisplayGroups()` (`lib/pipeline/display-groups.ts`, pure and deterministic --
CLAUDE.md dev principle #4) folds the fourteen technical keys into the doc's own nine
groups: `signal_intelligence` = account_discovery + signals + signal_correlation,
`opportunity_scoring` (display) = opportunity_scoring + why_now,
`research` = research + buyer_intelligence, `recommended_action` (display) =
recommended_action + crm_handoff -- everything else is a 1:1 group. A module-load-time
assertion checks every one of the fourteen technical keys appears in exactly one display
group (a stage silently missing from the UI, or double-counted across two groups, would
be a real regression worth failing loudly on rather than a display quirk someone notices
later). 6 new vitest cases cover: full coverage, the "exactly one group is ever current"
invariant matching the mockup's own single "●" line, a failure *inside* a multi-stage
group correctly marking that whole group failed (not silently masked by its own
not-yet-attempted sibling stage), and `skipped` counting the same as `completed` for a
group's own "is it done" purposes.

Rebuilt `RunAiDiscoveryPanel` (10.1's own component, same file) around these nine groups
rather than the flat fourteen-item list: each group shows the doc's own status
vocabulary (check / a small filled dot for the one current group / hollow circle for
upcoming / an X for failed), a "Retry" on a failed group that targets the one *technical*
stage that actually failed (not the whole group -- a group spanning several technical
stages should never re-run the ones that already succeeded). "Users can inspect completed
stages": clicking any group expands it to show each of its own underlying technical
stages' status and completion time, plus a link to wherever that group's real result
already lives elsewhere in the app (the ICP tab, the Discovery tab, Prospects,
Opportunities) -- not a second, duplicate viewer of the same data, the same "the real
page is the way to see it" call DISC-OFFER-P0-01.3 already made for long descriptions.
`website_understanding`/`offering_profile` get no such link since their own result *is*
this very Overview page, immediately below the panel.

No migration this story (a pure UI/presentation change over already-persisted state).

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1161 files, no violations),
`npx vitest run --root packages/module-discovery` (169/169, +6 new), and a clean `next
build` (confirmed the offering Overview page, which renders the rebuilt panel, still
builds with no errors). Same live-browser-walkthrough constraint noted in every prior
UI-touching story this run (no seeded demo user/`.env.local` in this environment).

**Status**: 32 of 68 in-scope stories done -- Phase E continuing. Next: 11.1, Editable
Pipeline Stages.

### 11.3 — Stage Dependency Graph (2026-09-12, built ahead of 11.1/11.2)

**Deliberate reordering, flagged up front**: the doc's own §29 sequence lists 11.1 before
11.2 before 11.3, but 11.1's own worked example ("[Save] [Save & Run Downstream]") and
11.2's own title ("Run From This Stage") both need a *working* downstream-invalidation
mechanism to mean anything real -- building either first would mean either a UI button
that does nothing yet, or reinventing the same mechanism twice. This is the same
tight-coupling call already made explicitly for DISC-OFFER-P0-10.1/10.2 earlier this
phase (there, 10.1 needed 10.2's own persisted-state fields to honestly satisfy its own
acceptance criteria); here the dependency runs the other direction -- 11.3's own graph and
invalidation function are the foundation 11.2 calls and 11.1 triggers, so this session
built 11.3 first, then 11.2, then 11.1, each as its own separately verified/committed/
merged story. Flagging this rather than silently reordering the doc's own numbering.

New `lib/pipeline/dependencies.ts`: `STAGE_DEPENDENCIES`, the doc's own literal ASCII
dependency diagram (§15/11.3) transcribed as data (each key's own parent stages) --
followed the diagram exactly rather than a richer graph this module's own code could
arguably justify (e.g. `buyer_intelligence` informally also depends on `buyer_personas`
for matching, per `handlers.ts`'s own comments) -- the diagram deliberately leaves
`buyer_personas` a dead-end branch with nothing downstream of it, and this graph is this
story's own explicit, literal deliverable, not a place to freelance improvements the doc
doesn't ask for (CLAUDE.md dev principle #7). `buyer_intelligence` itself (this module's
own fourteenth technical key, folded into the diagram's coarser "Research" node) was
given `research` as its one parent, mirroring `display-groups.ts`'s own grouping of the
two. A module-load assertion checks every stage key has an entry and every named parent
is a real stage key. `downstreamOf(stageKey)` is a plain, pure BFS over the reversed
edges -- deterministic, no AI call (CLAUDE.md dev principle #4). 8 new vitest cases cover:
full graph coverage, a cheap cycle guard (`downstreamOf(website_understanding)` must
equal every other stage, or a missing edge/cycle would show up as incomplete coverage),
the empty case at the very end of the pipeline, the dead-end `buyer_personas` branch, and
the "union, not just one branch" requirement at the two points the diagram itself forks
(`icp` -> {buyer_personas, discovery_strategy} and `opportunity_scoring` ->
{why_now, research}).

New `lib/pipeline/invalidate.ts` -- `invalidateDownstreamStages(workspaceId,
fromStageKey)`, this story's own second explicit line ("only affected downstream stages
should rerun"): resets exactly `downstreamOf(fromStageKey)`'s own stage rows to
`not_started` (a new `resetPipelineStageToNotStarted()` mutation -- deliberately records
no `pipeline_stage_runs` history row, since nothing actually *finished*; a manual
invalidation isn't an execution attempt with its own outcome) and clears whichever of
those stages' own `opportunities` columns exist (`signal_correlation_id`/
`signal_strength_score` for `signal_correlation`, `why_now`/`timing_strength`/
`why_now_confidence`/`timing_score` for `why_now`, `why_them` for `research`,
`buyer_fit_score`/`contactability_score` for `buyer_intelligence`,
`recommended_action`/`recommended_action_reason` for `recommended_action`). Clearing the
underlying data, not just the stage's own status row, is the real substance of this
mutation: DISC-OFFER-P0-10.1's own handlers are deliberately idempotent (each one skips
an opportunity that already has the field it's responsible for, so "leave and return"
never redoes finished work) -- resetting only the stage row without also clearing that
data would leave every one of those handlers silently skipping the very opportunities
this invalidation meant to force back into recomputation. Stages with no clearable
column of their own (`buyer_personas`/`discovery_strategy`/`account_discovery`/`signals`/
`opportunity_scoring`/`crm_handoff`) are deliberately omitted -- they either only ever
*add* rows (nothing to redo) or are pure checkpoint/read-only stages with no column of
their own (see each one's own comment in `handlers.ts`). A no-op when there's no active
discovery definition or no open opportunities yet -- an upstream edit before any real
discovery run has happened has nothing downstream to invalidate.

No migration, no UI this story -- both are 11.1/11.2's own explicit scope; this story's
job was making the dependency data and the invalidation mechanism themselves correct and
tested, the same "schema/logic first, no UI ahead of the story that needs it" precedent
DISC-OFFER-P0-05.1 already established.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1164 files, no violations),
`npx vitest run --root packages/module-discovery` (176/176, +8 new). No migration this
story, so no live apply/advisor step. No UI to browser-test.

**Status**: 33 of 68 in-scope stories done -- Phase E continuing. Next: 11.2, Run From
This Stage (using this story's own graph/invalidation).

### 11.2 — Run From This Stage (2026-09-12)

Built the generic, reusable mechanism this story asks for -- a concrete edit surface
actually calling it is DISC-OFFER-P0-11.1's own worked example, done next; this story's
own job was making "Run Discovery From Here" itself real.

New `downstreamGroupLabels(fromStageKey)` (`lib/pipeline/display-groups.ts`) -- the
doc's own "user receives a clear warning before downstream results are replaced"
acceptance criterion needs founder-facing names, not `downstreamOf()`'s own fourteen
technical stage keys; this maps DISC-OFFER-P0-11.3's own dependency result through
DISC-OFFER-P0-10.3's own nine display groups, deduped. 2 new vitest cases (the ICP
branch's own six affected groups in display order; nothing for the very last stage).

`RunAiDiscoveryPanel` (DISC-OFFER-P0-10.1/10.3's own component) gained an auto-resume
effect: on mount, if the URL carries `?autorun=1`, it strips the param
(`router.replace`, so a later reload of the same URL doesn't re-trigger it) and
immediately calls the same `runFrom()` the "Resume AI Discovery" button already uses --
the exact same auto-start-on-arrival pattern `WebsiteOnboardingPanel`
(DISC-OFFER-P0-09.1) already established for a freshly-created `pending` run. This is
deliberately how "Run Discovery From Here" is implemented end-to-end: an edit surface
elsewhere invalidates the affected stages server-side (DISC-OFFER-P0-11.3's own
`invalidateDownstreamStages`) and redirects back to the offering Overview page with this
query param, so "save my edit" and "rerun what depends on it" read as one continuous
action to the founder rather than a save followed by a second, separate manual click --
without needing to duplicate the panel's own orchestration loop on a second page.

"Existing results are versioned" and "upstream stages remain intact" were both already
true by construction before this story touched anything: DISC-OFFER-P0-10.2's own
version-increment-per-run plus its append-only `pipeline_stage_runs` history already
means a stage that reruns after an invalidation gets a new version with the prior
attempt preserved, and `invalidateDownstreamStages` (11.3) only ever resets stages
`downstreamOf()` names -- the edited stage itself and everything upstream of it is never
touched. This story's own genuinely new piece was purely the "come back and
automatically continue" wiring above.

No migration this story. No UI of its own to browser-test yet (the auto-resume effect
has no trigger until DISC-OFFER-P0-11.1's own edit surface exists) -- verified by reading
through the exact query-param contract both stories share (`?autorun=1`) rather than a
live walkthrough.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1165 files, no violations),
`npx vitest run --root packages/module-discovery` (178/178, +2 new), and a clean `next
build`.

**Status**: 34 of 68 in-scope stories done -- Phase E continuing. Next: 11.1, Editable
Pipeline Stages (wiring this mechanism onto the ICP page, the doc's own worked example).

### 11.1 — Editable Pipeline Stages (2026-09-12)

Checked what was already editable before building anything, per the doc's own "every
meaningful stage must be editable" -- most of this was already true by construction from
earlier stories: the ICP (DISC-OFFER-P0-02.2), buyer personas (02.3), discovery
definitions (04.1), and the offering profile (01.3/02.1) each already have a real edit
surface with a Save action. The genuine, story-specific gap the doc's own worked example
names directly is the doc's literal "[Save] [Save & Run Downstream]" pair -- none of
those four surfaces had the second option, only a plain Save.

Built the doc's own exact ICP worked example (the only one the doc actually shows) end
to end: new `updateIcpAndRunDownstreamAction` (`icp/actions.ts`) saves the ICP exactly
like the existing `updateIcpAction`, then calls DISC-OFFER-P0-11.3's own
`invalidateDownstreamStages(workspace.id, "icp")` and redirects to the offering Overview
page with `?autorun=1` -- DISC-OFFER-P0-11.2's own auto-resume effect picks it up from
there and the pipeline visibly continues immediately, so "save" and "rerun what depends
on it" read as one action to the founder. New `SaveAndRunDownstreamButton`
(`components/pipeline/`) -- a second submit button in the same `<form>` using the
standard HTML `formAction` override (one form, two possible server actions depending on
which button was clicked), with a native `confirm()` naming exactly which founder-facing
groups (`downstreamGroupLabels("icp")`, 11.2) will be reset before the submission is
allowed through -- the doc's own explicit "user receives a clear warning before
downstream results are replaced." Built as a reusable component rather than inline JSX
on the ICP page specifically, so buyer personas/discovery strategy/offering profile can
adopt the exact same pattern in a natural follow-up once each of *their* own downstream
edges is worth invalidating (offering profile and buyer personas are both currently
either upstream of everything or a dead-end branch per DISC-OFFER-P0-11.3's own graph --
wiring the same button onto them today would either invalidate the entire pipeline from
the very top or invalidate nothing at all, neither an especially useful addition yet).

Scoped deliberately to the ICP alone, not all five editable surfaces, matching the doc's
own single worked example rather than retrofitting every surface speculatively in one
story (CLAUDE.md dev principle #7) -- flagged explicitly rather than silently narrowed.
"Downstream stages can be rerun" and "user edits are distinguishable/auditable where
appropriate" both already hold structurally: reruns already produce a fresh version with
the prior attempt preserved in `pipeline_stage_runs` (DISC-OFFER-P0-10.2), and a manual
ICP edit is already a plain, ordinary database write through the same `updateIcpProfile`
every other edit uses -- nothing about this pipeline overwrites it without the founder's
own explicit "Save & Run Downstream" click.

No migration this story.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1165 files, no violations),
`npx vitest run --root packages/module-discovery` (178/178, unchanged -- no new pure
logic this story, only UI/action wiring over 11.2/11.3's already-tested mechanism), and a
clean `next build` (confirmed the ICP page, which now renders the second submit button,
still builds with no errors). Same live-browser-walkthrough constraint noted in every
prior UI-touching story this run (no seeded demo user/`.env.local` in this environment)
-- particularly relevant here given the two-submit-button `formAction` pattern and the
`confirm()`/redirect/`?autorun=1` round trip are the kind of interaction a real browser
check would most directly validate.

**Status**: 35 of 68 in-scope stories done -- Phase E continuing (§29 lists sixteen
stories under this phase, 09.1-15.1; eleven are now done -- 09.1-09.4, 10.1-10.3,
11.1-11.3 -- with 12.1/12.2 (offering-specific and external research prioritization),
13.1 (structured stage output contracts), 14.1/14.2 (run history and versioned results),
and 15.1 (the final human action gate) still ahead). Next: 12.1, Offering-Specific
Website Research.

### 12.1 — Offering-Specific Website Research (2026-09-12)

Checked what `website_understanding`'s own existing implementation (`understandProduct()`,
part of Phase A/B's own already-built AI scaffolding, reused unchanged by this pipeline
since DISC-OFFER-P0-10.1) actually did before assuming a gap: a *single-page* fetch of the
offering's own root `website` URL, via `researchWebsite()` directly -- unlike
DISC-OFFER-P0-09.2's own multi-page `crawlWebsite()`, which has existed since Phase E
started but was only ever wired into the *business*-onboarding flow
(`understandBusinessWebsite`). An offering whose own real detail lives on `/services`,
`/pricing`, or `/case-studies` -- exactly the doc's own worked example categories --
was never actually read; the single root-page fetch is the concrete gap this story closes,
not a case of "nothing existed yet."

`understand-product.ts` now calls `crawlWebsite()` (09.2's own orchestrator, unmodified
in its own crawl-plan/robots/dedup/cap logic -- inheriting "do not repeatedly process
irrelevant pages" for free rather than reimplementing it) instead of a single
`researchWebsite()` call. The one real change needed in `crawlWebsite()` itself: it
previously hardcoded `researchBusinessWebsitePrompt` (a generic "what does this business
do" question) for every page it visits, home or otherwise -- fine for the whole-business
onboarding flow it was built for, wrong for a per-offering call where a business site
might describe several different offerings and a generic question would blur them
together. Added an optional `buildPageResearchPrompt` parameter (defaulting to the exact
original `researchBusinessWebsitePrompt` behavior, so DISC-OFFER-P0-09.1/09.2's own
business-onboarding caller is completely unaffected -- confirmed by grep, it still calls
`crawlWebsite` with the same five positional arguments as before); `understand-product.ts`
passes the already-existing, already offering-specific `researchProductWebsitePrompt`
(product name + the doc's own literal category list: what it is, problem/solution,
features, differentiators, target industries/roles, use cases, pricing) as that builder,
so every crawled page -- not just the homepage -- is read with *this offering* in mind.
Confirmed link-extraction (`extractPageLinks`, which the crawl plan depends on to find
pages to visit next) is prompt-independent on the common path: `researchWebsite()`'s own
direct-fetch path returns the raw page text with its anchors already preserved,
regardless of which prompt is passed -- only the rarer provider-tool fallback path is
prompt-sensitive, an existing, unrelated characteristic this story didn't change.

No new persisted per-offering "pages crawled" table (unlike DISC-OFFER-P0-09.2's own
business-level `website_onboarding_pages`) -- this story's own acceptance criteria don't
ask for a crawl audit trail, only that the *right pages* get read and irrelevant ones
don't get reprocessed; adding one now would be speculative ahead of any story that
actually needs it (CLAUDE.md dev principle #7). No new `ProductProfile` schema fields
either -- the doc's own category list here is about research *input* prioritization
(which pages get read, what each is asked about), not new output fields to display.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1165 files, no violations),
`npx vitest run --root packages/module-discovery` (178/178, unchanged -- no pure logic
added; `crawlWebsite`'s own already-tested `crawl-plan.ts`/`robots.ts` sub-functions are
untouched, and neither `website-crawl.ts` nor `understand-product.ts` has ever had its
own unit tests, both being DB/AI-composing functions per this run's own established
precedent), and a clean `next build`. No migration this story. Same
live-browser-walkthrough constraint noted in every prior AI-calling story this run (no
seeded demo user/`.env.local`/real website fetch reachable in this environment).

**Status**: 36 of 68 in-scope stories done -- Phase E continuing. Next: 12.2, External
Opportunity Research.

### 12.2 — External Opportunity Research (2026-09-12)

Checked `researchProspect()` (DISC-OFFER-P0-06.1's own "Evidence-Backed Research")
before building anything: it already does almost everything this story's own signal list
asks for -- growth/hiring/leadership changes/tech changes/news/expansion -- via a live
web-search call whose prompt (`research_prospect_v2`) already asks for exactly those
categories, with each finding's source/URL/date already captured per DISC-OFFER-P0-06.1.
The two genuine gaps: (1) it never reads the prospect's own website directly at all --
only a general web search that *might* surface the company's own site among its results,
never asked to specifically -- so there was no real "first-party website understanding"
step this story's own "after first-party website understanding, research external
sources" ordering assumes exists; and (2) nothing in the stored evidence shape says
*which* of "the company's own site" vs. "everywhere else" a given claim came from -- the
doc's own explicit "clearly distinguish first-party website evidence from external
evidence" wasn't actually representable, only inferable (unreliably) from the free-text
`source` field.

New `research_prospect_v3.ts` prompt file (v2 left untouched, per this module's own
versioned-prompts convention -- `ai_runs` caches off the version string).
`researchProspectPrompt` (the external search question) is unchanged from v2; new
`firstPartyProspectWebsitePrompt` asks a plain, narrow question -- what does the
company's own site say about itself -- deliberately *not* asked to search for
opportunity signals, so its findings can be honestly labeled first-party rather than a
search result that happened to land on the prospect's own domain.
`structureResearchPrompt` now takes both findings blocks (first-party, nullable when no
website is on file or it couldn't be read, and external) as two separately labeled
`<first_party_website_findings>`/`<external_web_search_findings>` sections, and requires
a new `source_type` ("first_party"/"external") per evidence item naming which block it
came from.

`researchProspect()` (`lib/ai/research-prospect.ts`) now makes a **best-effort** first
call to `researchWebsite()` (the same direct-fetch-first/provider-tool-fallback helper
`understandProduct()` already uses) against `prospect.website` when one is on file,
*before* the existing external web-search call -- wrapped in its own try/catch that never
throws outward: a prospect with no website, or one that's unreachable, is a completely
normal case (same "support partial success" precedent DISC-OFFER-P0-09.2's own crawl
already established for a single failed page), not a reason to fail the whole research
run. Both findings blocks feed one combined structuring call and one combined `ai_runs`
row (token/search usage from all three sub-calls summed into it) -- "one row per
operation," not one per source, the same discipline every `lib/ai/*.ts` function in this
module already follows.

New `EvidenceItemSchema.source_type` (`lib/ai/schemas.ts`, required on every new item --
the model must pick one) and a matching **optional** `EvidenceItem.source_type` field on
the plain TS type (`lib/research/types.ts`) -- optional, not nullable, because `evidence`
is a jsonb array: an item persisted before this story simply has no such key in its
stored object at all, not an explicit null, so the type says exactly that rather than
claiming a value that was never written. No migration -- `prospect_research.evidence` is
already `jsonb`, so a new per-item field needs no schema change, only the Zod/TS shapes
that describe what goes into and comes out of that column.

UI: Opportunity Detail's own evidence list (`components/opportunities/opportunity-
detail.tsx`) gained a small "First-party"/"External" badge next to the existing
evidence-type badge -- omitted entirely (not shown as "Unknown") for any evidence
recorded before this story, matching the field's own optional-not-null semantics rather
than guessing at data that was never captured.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1166 files, no violations),
`lint:migrations` (130 migrations, unchanged -- no migration this story), `npx vitest run
--root packages/module-discovery` (178/178, unchanged -- `research-prospect.ts` is an
AI/DB-composing function with no unit tests of its own, per this run's established
precedent, and no new pure logic was added), and a clean `next build` (confirmed the
Opportunity Detail route, which renders the new evidence badge, still builds with no
errors). Same live-browser-walkthrough constraint noted in every prior AI-calling story
this run (no seeded demo user/`.env.local`/real website fetch reachable in this
environment).

**Status**: 37 of 68 in-scope stories done -- Phase E continuing. Next: 13.1, Structured
Stage Outputs.

### 13.1 — Structured Stage Outputs (2026-09-12)

The doc gives this story no "Acceptance criteria" heading either (same as 10.2) -- just
three worked examples (ICP, signal intelligence, research) and one closing line: "The UI
must render these structures as editable fields." Treated it as an audit-and-close-gaps
story against those three examples specifically, not a license to touch every stage:
checked each example's own field list against what this module already persists and
renders before writing anything, per this run's own "don't build what already exists"
discipline.

**Signal intelligence** (`signals[]`/`correlations[]`/`opportunity_hypotheses[]`) is
already fully real: `discovery.signals` (05.3) and `discovery.signal_correlations` (05.3)
are exactly `signals[]`/`correlations[]`, and a correlation's own `rationale` field *is*
the doc's "opportunity hypothesis" (its own doc comment already says so -- "New CISO + 12
IAM openings + Identity modernization activity = High-confidence IAM opportunity" is a
hypothesis, not a raw fact list). Confirmed it's genuinely rendered, not just persisted:
`getOpportunityDashboardRows` (07.2) already surfaces `correlation.rationale` as
`topSignal`, and `opportunities-dashboard.tsx` renders it in both the desktop table and
mobile cards. No gap, no code change -- documenting the mapping here since the doc's
example vocabulary (`opportunity_hypotheses[]`) doesn't literally appear anywhere in the
codebase and a future story could otherwise mistake this for missing.

**Research** (`company_summary`/`offering_fit`/`why_them`/`why_now`/`buyer`/`evidence[]`/
`confidence`) is also already fully real and rendered, spread across four existing
concepts rather than one: `company_summary` = `ProspectResearch.summary` (06.1, rendered
on the prospect detail page, `apps/web/.../prospects/[prospectId]/page.tsx`);
`offering_fit` = `ResearchBrief.offering_fit` (06.2); `why_them`/`why_now` = `Opportunity`
fields (05.1/05.4); `buyer` = `BuyerPersonIntelligence` (06.3); `evidence[]` =
`ProspectResearch.evidence` (06.1, extended by 12.2); `confidence` appears on both
`ResearchBrief.confidence` and `Opportunity.confidence`/`why_now_confidence`. Every one of
these is rendered on either the prospect detail page or the Opportunity Detail page
(07.3) -- confirmed by reading both files directly, not just grepping `module-discovery`'s
own `src/components` (which has no research UI of its own; both live consumers are
`apps/web` route files, the same shape 06.1's own audit entry already flagged once
before). No gap, no code change.

**ICP** (`industries[]`/`company_size`/`geographies[]`/`technologies[]`/`pain_points[]`/
`buyer_roles[]`/`disqualifiers[]`/`confidence`/`evidence[]`) is where the real, genuine gap
was: every list field already exists on `discovery.icp_profiles` under its own name
(`industries`/`company_sizes`/`geographies`/`technology`/`pain_points`/`roles`/
`exclusions`, all rendered as editable `IcpField`s since 02.2/11.1) -- but `confidence` and
`evidence` did not exist anywhere on the ICP at all. Closed that gap:

- Migration (`20260912090000_discovery_icp_confidence_evidence.sql`): adds
  `confidence numeric check (0-1)` (nullable, no default -- NOT `not null default 0` like
  `website_onboarding_offering_candidates.confidence`'s own precedent, because that
  column is being retrofitted onto rows that may predate this story; a bare `0` would
  misread as "computed, and found maximally unconfident" rather than the true "never
  computed," the same "absence of evidence isn't evidence of absence" precision
  05.2/05.5 already established) and `evidence text[] not null default '{}'` (a plain
  array of short quotes/paraphrases from the product profile, matching every sibling
  column already on this table -- deliberately NOT the richer `EvidenceItem` object shape
  `lib/research/types.ts` uses for prospect research/buyer intelligence, since that
  shape's `source_url`/`observed_at`/`supporting_signal`/`source_type` fields exist to
  distinguish multiple, dated, first-party-vs-external sources gathered across several
  calls -- a single-call synthesis over one already-approved `ProductProfile` has none of
  that to distinguish, and forcing the fuller shape would only produce nulled-out noise).
- `IcpProfileSchema` (`lib/ai/schemas.ts`) gained matching `confidence`/`evidence` fields.
  New `prompts/icp/generate_icp_v2.ts` (v1 left untouched and unimported, same
  "new version file, old one kept for provenance" convention `research_prospect_v3.ts`
  already established over `v2`) adds explicit prompt guidance for both, mirroring
  `understand_product_v1.ts`'s own explicit "set confidence lower/higher" instruction
  rather than relying on the Zod `.describe()` text alone. `generateIcp` now writes both
  fields from the AI draft.
- `updateIcpProfile` (manual "Save changes") now also resets `confidence`/`evidence` to
  `null`/`[]`, not just `status` to `draft`: both describe how well the *pre-edit* claims
  were grounded in the product profile, and once a founder hand-edits any field that
  assessment no longer honestly describes what's now on the row -- the same "don't let a
  stale AI judgment linger over content a human has since changed" reasoning the existing
  `status` reset already applies, not a new precedent.
- `cloneIcpProfileToWorkspace` deliberately does NOT copy `source.confidence`/
  `source.evidence` onto the cloned row (unlike every other field, which it does copy) --
  a genuine judgment call, flagged here rather than silently applied: the source ICP's
  evidence quotes trace to the *source offering's own* product profile, and carrying them
  onto a different offering's ICP would misrepresent evidence about one product as
  support for another's. Left `null`/`[]`, same as any offering whose ICP has never been
  (re)generated, until this offering's own `generateIcp` call computes real values.
- UI (`icp/page.tsx`): a small read-only block (rounded border, matching the page's own
  existing section style) renders `confidence` as a rounded percentage (same
  "Confidence: NN%" plain-text pattern `product-overview-shell.tsx` already uses for
  `ProductProfile.confidence`, not the `low`/`medium`/`high` `ConfidenceBadge` used
  elsewhere in this module for a different, enum-shaped confidence) and `evidence` as a
  plain bulleted list, shown only when either has a value -- absent entirely for an ICP
  never regenerated since this story, or right after a manual edit clears them, rather
  than showing a misleading "0%"/empty list. Read-only by design, not wired into the
  editable form: `confidence`/`evidence` are the AI's own provenance judgment about the
  *other* fields, not domain content a founder types -- the same read-only treatment this
  module already gives `Opportunity.confidence`/`ResearchBrief.confidence`/
  `ProductProfile.confidence`, none of which are manually editable either, despite ICP's
  own list fields being fully editable since 02.2. Confirmed no other consumer needed
  updating: `icpFieldsToRow`/`IcpFieldsInput` (the manual-edit path) and
  `listCloneableIcpSourcesForBusiness` (a `name`/`workspace_id`-only projection) don't
  touch these columns at all.

No new table -- checked the entity-ownership map (`docs/plan/00-MASTER-PLAN.md` §5)
first, which lists `discovery` as an existing module with no separate "ICP evidence"
concept, confirming `icp_profiles` (already the canonical ICP row) is the right place for
these two columns rather than a parallel table.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1167 files, no violations),
`lint:migrations` (131 migrations, no violations), `npx vitest run --root
packages/module-discovery` (178/178, unchanged -- `generate-icp.ts`/`icp/mutations.ts` are
DB/AI-composing functions with no unit tests of their own, per this run's established
precedent for `generateIcp`/`understand-product.ts`, and no new pure logic was added), a
live migration apply + `get_advisors` for both `security`/`performance` (same baseline
findings as every prior story -- 5 pre-existing `rls_enabled_no_policy` and 1 pre-existing
`auth_leaked_password_protection` on unrelated tables, ~155 pre-existing `unused_index`
INFO findings across unrelated tables, no new findings of any kind), and a clean `next
build` (confirmed the ICP route, which now renders the new confidence/evidence block,
still builds with no errors). Same live-browser-walkthrough constraint noted in every
prior UI-touching story this run (no seeded demo user/`.env.local` in this environment).

**Status**: 38 of 68 in-scope stories done -- Phase E continuing. Next: 14.1, Discovery
Run History.

### 14.1 — Discovery Run History (2026-09-12)

The doc gives this story no "Acceptance criteria" heading either (same as 10.2) -- just
the field list (`run_id`/`offering_id`/`started_at`/`completed_at`/`trigger`/
`starting_stage`/`status`/"AI provider/model where applicable"/"stages executed"/
`errors`/"user edits") and "Reuse existing Core AI run/audit mechanisms where
appropriate."

**Checked the entity-ownership map and this schema's own existing tables first, per this
story's own explicit instruction to check `pipeline_stage_runs` before creating anything
new.** `discovery.pipeline_stages` (10.1) is *current* per-stage state and
`discovery.pipeline_stage_runs` (10.2) is an append-only log of every individual
*technical-stage* attempt -- neither is "run history" in this story's sense, and 10.2's own
migration comment already says so explicitly ("not a run-history log (that's
DISC-OFFER-P0-14.1's own 'Discovery Run History' table)"), confirming this is genuinely
new rather than a parallel of something already listed, and that it was anticipated
rather than accidentally duplicated. A "run" here is one client-driven walk through some
contiguous suffix of the fourteen technical stages (`run-ai-discovery-panel.tsx`'s own
`runFrom()`, one HTTP request per stage -- see that route's own comment for why), not one
row per technical stage attempt.

New migration (`20260912100000_discovery_pipeline_runs.sql`): `discovery.pipeline_runs`
(`workspace_id`/`trigger`/`starting_stage`/`status`/`started_at`/`completed_at`/`error`),
select/insert/update RLS against `discovery.user_workspace_ids()` (tenant AND licensed,
same pattern as every sibling table), plus a nullable `run_id` FK added onto
`discovery.pipeline_stage_runs`. `offering_id` in the doc's own field list is
`workspace_id` here -- `discovery.workspaces` is 1:1 with `products` (the offering,
01.1) via `workspaces.product_id`, and `workspace_id` is this module's own tenant key
(ADR-4's discovery exception), not a separate concept, the same mapping 10.2's own
migration already established.

**"AI provider/model where applicable" and "stages executed" are deliberately not columns
on `pipeline_runs`** -- both are derived at read time rather than duplicated:
- "Stages executed" is `list pipeline_stage_runs where run_id = this run's id`
  (`listPipelineStageRunsForRun`) -- every technical stage attempt made during a run is
  already its own permanent `pipeline_stage_runs` row (10.2); a second, redundant record
  of the same fact would only be one more place for the two to drift.
- "AI provider/model" comes from `discovery.ai_runs`, this module's own existing
  usage/cost ledger (10.1's own precedent already logs every AI call there) -- new
  `listAiRunsInWindow(workspaceId, from, to)` (`lib/ai/usage.ts`) reads every `ai_runs`
  row for this workspace whose `created_at` falls inside `[started_at, completed_at]`,
  deduplicated to distinct `(operation, model, provider, status)` combinations (a run's
  own "Collect Signals" stage can call this once per account researched; a founder
  reviewing history wants "which models did this run use," not one row per account).
  This is a genuine, flagged judgment call: `pipeline_stages.last_ai_run_id` (10.2's own
  named field) exists but turned out to be dead -- grepped every caller of
  `markPipelineStageCompleted` and found none ever actually passes a `lastAiRunId`, since
  doing so would require every underlying AI function (`understandProduct`, `generateIcp`,
  `discoverProspects`, `researchProspect`, `generateResearchBrief`) to start returning
  its own `ai_runs` row id, and every one of those functions is also called from several
  *non-pipeline* manual UI actions elsewhere in this module (manual "Regenerate" buttons,
  onboarding, prospect actions) -- widening their return shape for this one story would be
  exactly the "refactor unrelated code" CLAUDE.md dev principle #10 warns against, for a
  benefit (an exact FK instead of a time-windowed derivation) this story doesn't actually
  need. Left `last_ai_run_id` itself untouched (still unpopulated, a pre-existing gap
  outside this story's own scope) and used the time-window derivation instead, which
  needs no changes to any AI-calling function at all. Flagging this rather than silently
  wiring it up or silently ignoring the doc's own "AI provider/model" field.
- "User edits" likewise isn't a separate log: `trigger = 'save_and_run_downstream'`
  already *is* "a user edit initiated this run" (11.1/11.2's own worked example), distinct
  from an automation-initiated run. The deeper "distinguish a user's edited field values
  from the AI's own generated ones" is DISC-OFFER-P0-14.2's own explicit, later
  "Versioned Stage Results" concern (its own acceptance line: "User edits and AI-generated
  changes should be distinguishable"), not this story's -- not built here.

**Trigger vocabulary** (`PipelineRunTrigger`, a closed three-value check constraint, not
open-ended free text): read `run-ai-discovery-panel.tsx` end to end to find every real
call site of the walk it drives, rather than inventing a vocabulary from the doc's own
prose alone -- `run_ai_discovery_cta` (the main "Run AI Discovery"/"Resume AI
Discovery"/"Run AI Discovery Again" button, 10.1), `retry_failed_stage` (a failed group's
own "Retry" button, 10.3), `save_and_run_downstream` (the `?autorun=1` auto-resume after
"Save & Run Downstream" on an edited stage, 11.1/11.2). All three already existed as
distinct call sites of `runFrom()`; this story only added a `trigger` parameter to that
function and threaded a value through from each one, changing no existing behavior.

**Tenant-safety of a client-supplied `runId`** (CLAUDE.md dev principle #8): the panel
must send its own newly-created `runId` back on every subsequent per-stage request across
several separate HTTP round trips, which means the server has to accept a value that
*originated* from the client, not read purely server-side. Rather than trusting a bare FK
existence check (which would accept a syntactically valid id belonging to a *different*
workspace's run, since a Postgres FK only checks the referenced row exists, not who it
belongs to), the route looks the run up scoped by the caller's *own* workspace
(`getPipelineRun(workspaceId, runId)`) before ever using it, and silently treats a
miss (wrong tenant, or gone) as "no run" rather than failing the stage's own real work
over a bookkeeping detail -- the same "never let a logging failure break the caller's
actual result" discipline `recordAiRun` already established for `ai_runs`.

**Route/client wiring**: `run-ai-discovery/route.ts`'s POST gained a second body shape
(`{ action: "start_run", trigger, startingStage }`, returning the new run row) alongside
its existing per-stage shape (now `{ stageKey, runId }`); the same handler finalizes the
run itself the moment it can tell the client's walk has stopped -- a stage failing (the
client's own loop always breaks on the first failure) or the very last technical stage
(`crm_handoff`) succeeding. `run-ai-discovery-panel.tsx`'s `runFrom()` now opens a run
before its loop (best-effort -- a failed "start run" call still lets the pipeline run
normally with `runId: null`) and passes it through `runOneStage`.

**UI, a flagged scope call**: the doc gives this story no explicit "the UI must render
this" line (unlike DISC-OFFER-P0-13.1's own explicit one), which is the same shape as
10.2's own schema-only story -- but 10.2 had an immediate sibling (10.3, "Pipeline
Progress UI") built the very next story in the same session to surface it, and nothing in
the remaining Phase E/F sequence plays that role for this data (14.2 is "Versioned Stage
Results," 15.1 is "Final Human Action Gate," and no Phase F P1 story is "Run History
UI" either) -- unlike 10.2, building this story as schema-only would leave "Track... run
history" data no user could ever actually see anywhere in the currently planned backlog.
Judged that "Track" a specific field list, named "History" as if for a person to review,
warrants a minimal read-only UI even without an explicit "must render" line, and built
one: a new "History" tab in the ongoing offering nav bar (`product-nav.tsx`, same "no dead
links" rule Discovery/Opportunities were added under), a list page
(`history/page.tsx` + `RunHistoryList`, desktop table / mobile cards per CLAUDE.md
non-negotiable #12, each row linking out rather than expanding inline -- the same "the
real page is the way to see the rest" call 10.3 already made), and a detail page
(`history/[runId]/page.tsx` + `RunHistoryDetail`) rendering the full field list: trigger,
starting stage, timing, terminal error, the derived AI-models-used list, and every stage
attempt executed during that run with its own status/timing/error. Flagging this as a
scope judgment call rather than a settled fact -- if a future story turns out to cover
this ground differently, this UI should be reconciled with it rather than duplicated.

No changes to `pipeline_stages`/`pipeline_stage_runs`'s own existing columns or behavior
beyond the additive `run_id` FK; every existing mutation call site that doesn't pass a
`runId` (there are none left after this story's own route update, but the parameter is
optional or existing tests never touch the pipeline mutations at all) continues to write
`run_id: null`, matching the "nullable because a stage can still run with no enclosing
run" reasoning in the migration itself.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning), `lint:boundaries` (1171 files, no violations),
`lint:migrations` (132 migrations, no violations), `npx vitest run --root
packages/module-discovery` (178/178, unchanged -- every new function here is either a
DB-composing mutation/query, per this run's own established "no unit test for a
DB-composing function" precedent, or presentation-only formatting inside a UI component,
not new pure domain logic needing its own test), a live migration apply +
`get_advisors` for both `security`/`performance` against the dev project
(`jazdtomcgqjxjueedmck`) -- same baseline findings as every prior story (5 pre-existing
`rls_enabled_no_policy` and 1 pre-existing `auth_leaked_password_protection` on unrelated
tables, the same ~157 pre-existing `unused_index` INFO findings plus this story's own two
brand-new indexes now also (correctly) flagged unused on an empty dev database, no new
findings of any other kind), and a clean `next build` (confirmed both new routes --
`history` and `history/[runId]` -- build and appear in the route manifest). Same
live-browser-walkthrough constraint noted in every prior UI-touching story this run (no
seeded demo user/`.env.local` in this environment).

**Status**: 39 of 68 in-scope stories done -- Phase E continuing. Next: 14.2, Versioned
Stage Results.

### 14.2 — Versioned Stage Results (2026-09-12)

Verified starting state first, per this run's own standing instruction: `git fetch origin
main disc-offering-backlog && git log origin/main..origin/disc-offering-backlog --oneline`
was empty (39/68 fully merged already), but this worktree's own checked-out HEAD was
found sitting on a stray scratch branch (`worktree-agent-a55bc6d6f4dcb5035`, a merge of
`origin/comply-backlog` into a `scratch-main-canada` branch some other session had pushed
straight to `origin/main` via this run's own documented scratch-branch fallback) --
confirmed harmless (the working tree was clean and that commit *is* `origin/main`'s real
tip, `388655f`, itself an ancestor check away from containing `disc-offering-backlog`
cleanly) rather than a sign of contamination, then fixed with a plain
`git branch -f disc-offering-backlog origin/disc-offering-backlog && git checkout
disc-offering-backlog` onto the real tracked tip (`eb7f829`, 14.1) -- the same
worktree-reuse artifact 09.4/10.1's own log entries already documented, not a new problem.

The doc gives this story no "Acceptance criteria" heading either (same as 10.2/13.1/14.1)
-- just the field list and the one worked example (`ICP v1`/`v2`/`v3`, "current version
clearly identified", "user edits and AI-generated changes should be distinguishable").
Checked DISC-OFFER-P0-10.2's own migration comment first, per this story's own explicit
anticipation there ("14.2 owns snapshotting a stage's actual output *content*... without
this table needing to change shape again") -- confirmed `pipeline_stages.version`
(10.2) is a distinct, narrower concept (an execution-attempt counter for the "icp"
*pipeline stage*, bumped only when `runIcpStage` runs via the AI Discovery pipeline) from
this story's own concern: a founder's manual "Save changes" (`updateIcpProfile`) and a
manual "Regenerate" (`generateIcp`, callable straight from the ICP page's own button,
outside the pipeline entirely) both silently overwrite the ICP row's content in place
today, and neither write path touches `pipeline_stages` at all. This needed its own
content-version counter on `icp_profiles` itself, not a reuse of the pipeline stage's own
`version` column.

**Scoped to the ICP alone, matching the doc's own single worked example** -- the same
"scope to the doc's one worked example, flag the rest explicitly" call DISC-OFFER-P0-11.1
already made for "Editable Pipeline Stages" (a near-identical problem shape: several
stages are theoretically in scope, the doc shows exactly one worked example, prior
precedent narrows to it and flags the rest). Offering Profile, Buyer Personas and
Discovery Strategy all have their own real-or-notional overwrite exposure too (an
offering-profile "Regenerate" replaces `products.product_profile` in place with zero
history), but extending this same versioning to them is left for a future story to build
on this migration's own pattern rather than implied by this one's scope (CLAUDE.md dev
principle #7 -- no speculative functionality). Buyer personas and discovery strategy are
actually lower-risk already: `seedBuyerPersonasFromIcp`/`seedDiscoveryDefinitionFromIcp`
(DISC-OFFER-P0-10.1) only ever add or skip, never overwrite existing content, so neither
one actually loses data today the way ICP regeneration/manual-save do.

**Migration** (`20260912230000_discovery_icp_profile_versions.sql`): adds
`icp_profiles.version` (integer, default 0 -- 0 for any row that predates this story and
hasn't been written to since, a genuinely different fact from "this is version 1"; the
live row's own `version` column *is* "current version is clearly identified", with no
separate `is_current` flag to ever drift out of sync with it) and a new append-only
`discovery.icp_profile_versions` table -- one immutable snapshot per version, mirroring
every one of `icp_profiles`' own content columns exactly (not a jsonb blob) so a past
version can be rendered with the same field-by-field layout the live ICP form already
uses. Same "current value on the live row, full history on its own append-only table"
pattern `discovery.pipeline_stage_runs` (10.2) already established. `source` is a closed
two-value check constraint (`ai_generated`/`user_edit`), the doc's own explicit
"distinguishable" requirement -- not open-ended free text, the same closed-enum
discipline `pipeline_runs.trigger` (14.1) already established for a comparable field.
`unique (workspace_id, version)` (parallel to `pipeline_stage_runs`' own `(workspace_id,
stage_key, version)`) plus a separate index on `icp_id` (not covered by that unique
constraint's own leftmost prefix, unlike `pipeline_stage_runs`) -- both FKs indexed from
the start. RLS: select/insert only, tenant AND licensed via `discovery.user_workspace_ids()`,
same pattern as every sibling table.

**Wiring** (`lib/icp/mutations.ts`, `lib/ai/generate-icp.ts`): new exported
`recordIcpProfileVersion(icp, source)` (in `mutations.ts`, since `generateIcp` in a
different file needs to call it too) inserts one snapshot from a row's own just-written
fields. Three call sites, each a read-current-version-then-write (a plain read-then-write,
not an atomic SQL increment -- the same single-flight assumption `markPipelineStageRunning`,
10.2, already accepts, since nothing in this module lets two saves of the same ICP race
each other):
- `generateIcp` (AI path) -- bumps from the `existing` row it already fetches earlier in
  the function, records `ai_generated`. Covers both the ICP page's own "Generate"/
  "Regenerate" buttons and the AI Discovery pipeline's own "icp" stage (`runIcpStage`
  calls this exact function) -- one version bump either way, since both are the same "the
  AI wrote fresh content" fact regardless of which surface triggered it.
- `updateIcpProfile` (manual Save) -- bumps from a new read of the row by `icpId`,
  records `user_edit`.
- `cloneIcpProfileToWorkspace` -- bumps from the *target* workspace's own existing
  version (0 if it never had an ICP at all), records `user_edit`. **A flagged judgment
  call**: a clone is a human clicking "Clone", not a new AI generation, so it reads as the
  human side of this story's own closed binary rather than a third value the doc never
  asked for -- noted here rather than silently decided.
- `approveIcpProfile` deliberately does **not** bump the version or record a snapshot --
  it only ever changes `status`, never a field this table snapshots, so nothing about
  approval is at risk of being "silently overwritten" (the same restraint 13.1's own
  `confidence`/`evidence` reset already applied to approval: it doesn't touch those
  either).

New `listIcpProfileVersions(icpId)` query (`lib/icp/queries.ts`), most-recent-first --
not `cache()`-wrapped, matching the sibling `listPipelineStageRuns`/`listPipelineRuns`
history queries in `lib/pipeline/queries.ts` (a plain read, no same-request staleness risk
to guard against, unlike `getIcpProfile`'s own two-callers-per-render reason for caching).

**UI** (ICP page, `icp/page.tsx` + new `IcpVersionHistory` component,
`components/icp/icp-version-history.tsx`): a small "v{n}" badge next to the existing
Approved/Draft badge (shown only once an ICP has a real version, i.e. `version > 0` --
absent for a never-yet-versioned pre-existing row, the same "no false precision" restraint
13.1's own confidence block already applies), and a new "Version history" section below
the edit form listing every past version, most recent first, each behind a native
`<details>` disclosure (no new dependency -- CLAUDE.md dev principle #2) showing its own
source badge, timestamp, and a summarized field snapshot (industries/company
sizes/roles/pain points/buying signals/exclusions/description/confidence -- not literally
every one of the dozen list fields on the live form, which would make each expanded
version as long as the edit form itself for little skimming benefit). The top entry is
explicitly labeled "(current)" -- the doc's own literal "current version is clearly
identified" line, not left to be inferred from list order alone. Deliberately read-only,
no restore/rollback action: the doc's own acceptance line never asks for reverting to a
past version, only for the trail to exist and be readable, and building a restore flow
now would be scope creep past what this story needs (CLAUDE.md dev principle #7) -- flagged
here rather than silently assumed out of scope. No compact-card table treatment needed
(CLAUDE.md non-negotiable #12 doesn't bite -- this is a list of expandable cards, not a
table of rows, the same reasoning 10.3's grouped checklist and 14.1's own stage-run list
already established).

No new pure domain logic: the version-bump itself is a one-line `current + 1` embedded in
each DB-composing mutation, the same "no unit test for a DB-composing function" precedent
`markPipelineStageRunning`'s own comparable version bump (10.2) already established --
extracting a dedicated `nextVersion()` for a bare increment would be ceremony, not real
logic worth its own test.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1172 files, no
violations), `lint:migrations` (133 migrations, no violations), `npx vitest run --root
packages/module-discovery` (178/178, unchanged -- no new pure logic, per the note above),
a live migration apply + `get_advisors` for both `security`/`performance` against the dev
project (`jazdtomcgqjxjueedmck`) -- no new security findings of any kind (same 6
pre-existing `rls_enabled_no_policy` + 1 pre-existing `auth_leaked_password_protection`,
all on unrelated tables), and exactly one new performance finding -- this story's own new
`icp_profile_versions_icp_id_idx`, correctly flagged `unused_index` on an empty dev
database, the same benign pattern every prior migration-adding story in this run has
produced -- and a clean `next build` (confirmed the ICP route, which now renders the
version badge and history section, still builds with no errors and appears in the route
manifest). Same live-browser-walkthrough constraint noted in every prior UI-touching
story this run (no seeded demo user/`.env.local` in this environment).

**Status**: 40 of 68 in-scope stories done -- Phase E continuing. Next: 15.1, Final Human
Action Gate (the last story in Phase E).

### 15.1 — Final Human Action Gate (2026-09-12)

The doc gives this story no "Acceptance criteria" heading either (same as 10.2/13.1/14.1)
-- a worked example (Top Opportunity / Acme Corp / Score / Why Now / Contact /
Recommended Action / Confidence, with `[Edit Recommendation] [Send to CRM] [Watch]
[Dismiss]`), plus two explicit lines: "No outbound communication may be sent
automatically" and "CRM handoff must preserve the Business Offering and Discovery
evidence."

**Checked what already held before building anything, per this run's own "inspect before
changing" discipline** -- the first line turned out to already be fully, structurally
true: `runCrmHandoffStage` (the pipeline's own last technical stage, DISC-OFFER-P0-10.1)
only ever *counts* how many open opportunities are ready for handoff and never calls
`promoteProspectToCrm`, and its own existing code comment already names this exact story
("DISC-OFFER-P0-15.1 / §25: 'must NOT send outbound communication... without user
approval'") -- confirmed by reading the route handler directly, not just trusting the
comment. The CRM-preservation line was also already true: `ContractOpportunitySummary`
(DISC-OFFER-P0-08.1) already carries score/why-them/why-now/research-brief-summary/
discovery-definition-name, and `ContractProspectSummary.productName` already names the
Business Offering -- both already flow live into CRM's own Customer 360 "Opportunity"
block. No code needed for either line; both are called out here as verified, not silently
assumed.

**The genuine gap was the doc's own UI**: nothing in the module presented a single "the
one thing to decide on right now" card the way the mockup shows -- Today's Opportunities
(07.2) is a full list, Opportunity Detail (07.3) is a full ten-section page for one
already-chosen opportunity, and neither is "the moment automation hands off to a human."
Built exactly that as a new **Top Opportunity gate card** on the offering Overview page,
right where `RunAiDiscoveryPanel` (10.1) already sits -- the doc's own §13 diagram places
"Human Approval" right before CRM Handoff, and this is that moment made visible.

**New pure selection logic** (`lib/opportunities/gate.ts`, `selectTopGateOpportunity`):
picks exactly one candidate -- the highest-scored opportunity still in a genuinely
*pending* status (`new`/`reviewing`/`action_required`), oldest first on a score tie.
Deliberately excludes `watching` (unlike `next-best-action.ts`'s own broader
`ACTIONABLE_STATUSES`) -- a founder already decided to watch an opportunity, so it's no
longer "the one thing to decide on right now" -- and excludes an unscored opportunity
entirely rather than sorting it to the bottom (05.2's own "no false precision": a null
score isn't the lowest possible score, it's "not yet evaluated"). 5 new vitest cases:
empty list, every resolved/watched status excluded, an unscored candidate excluded even
when nothing else qualifies, highest score wins, and the tie-break. New
`getTopGateOpportunity(workspaceId)` (`lib/opportunities/dashboard-queries.ts`) reuses
`getOpportunityDashboardRows` (07.2) wholesale rather than a second parallel query -- the
gate needs exactly the same enriched row shape (contact name, top signal), just reduced
to one pick.

**"[Edit Recommendation]" had no equivalent anywhere** -- `recommended_action` (07.1) is
purely a system-computed value, freely overwritten every time `computeNextBestAction`
reruns, with no way for a founder to pick a different next step that then *stays* picked.
That gap is exactly §25's own "must NOT... silently overwrite user-approved values."
Closed it with a new, separate `recommended_action_override` column
(`20260912240000_discovery_opportunity_recommended_action_override.sql`) -- same closed
seven-value vocabulary as `recommended_action` itself, nullable, never touched by
`computeNextBestAction`'s own callers -- rather than repurposing `recommended_action`,
the same "which column is non-null says which one produced it, no separate flag to drift
out of sync" pattern DISC-OFFER-P0-14.2 already established for the ICP's own `source`
distinction. New `effectiveRecommendedAction()` (`next-best-action.ts`, 3 new vitest
cases) is the one place every UI surface (dashboard rows, Opportunity Detail, the gate
card) and the CRM contract read now go through instead of `recommended_action` directly
-- confirmed and fixed a real, easy-to-miss instance of exactly the failure this function
exists to prevent: `contract/index.ts`'s own `getProspectSummaryForParty` was still
reading `opportunity.recommended_action` raw, which would have silently shown CRM the
*stale* computed recommendation even after a founder explicitly overrode it in
Discovery -- "silently ignoring a user-approved value in a live cross-module read" being
the same failure as "silently overwriting" one, just by another name. New
`setRecommendedActionOverride(opportunityId, override)` mutation (plain DB-composing
wrapper, no test, same precedent as `setOpportunityStatus`).

**UI wiring**: `OpportunityDetail`'s own "Recommended Action" section (07.3) now shows
the effective action with a "(founder override)" tag when one is set, plus a small
inline form (a `NativeSelect` over the same seven-value vocabulary, empty = "clear
override") calling new `updateRecommendedActionAction` -- this is the one real edit
surface; the AI's own `recommended_action_reason` is hidden once overridden (it describes
a suggestion no longer in effect, the same restraint 13.1's own confidence/evidence reset
already applied to stale AI judgments). `opportunities-dashboard.tsx`'s own two row
renderers (desktop table, mobile cards) now share one `RecommendedActionCell` reading
through `effectiveRecommendedAction` instead of duplicating the same fix twice.

New `TopOpportunityGate` component (`components/opportunities/top-opportunity-gate.tsx`)
renders the doc's own exact field list. Three of the four buttons reuse real,
already-existing mechanisms unchanged: `Send to CRM` is the identical `SendToCrmButton`
(08.1) the Opportunity Detail page already uses (same relationship-check/confirmation
dialog, now also computed for the gate's own top pick on the Overview page); `Watch`/
`Dismiss` are one-click forms over `setOpportunityStatus` (05.1). **A flagged scope
call**: `Edit Recommendation` is a link to the Opportunity Detail page's own
`#recommended-action` section rather than a second, duplicate inline override editor on
the gate card itself -- the same "the real page is the way to act on the rest" restraint
this run has applied repeatedly (DISC-OFFER-P0-01.3's long descriptions, 10.3's
underlying-stage links). Three of four gate actions are genuinely one-click on the card
itself; the fourth is one click away on the page that already owns editing it -- noted
here as a deliberate choice, not a gap.

New `updateTopOpportunityStatusAction`/`sendTopOpportunityToCrmAction`
(`products/[productId]/actions.ts`) duplicate `setOpportunityStatus`/
`promoteProspectToCrm` wiring already present in the Opportunity Detail route's own
`actions.ts`, rather than importing across route files -- the same "each route directory
keeps its own actions.ts wrapping the same underlying module mutations" convention
`icp/actions.ts` and this same file already follow for their own concerns, just
revalidating the Overview page instead. The Overview page itself only fetches buyer
intelligence/relationship-classification for the one gate opportunity's own prospect when
`getTopGateOpportunity` actually returns one -- a fresh offering with nothing yet to gate
on does none of that extra work.

No compact-card table treatment needed (CLAUDE.md non-negotiable #12 doesn't bite -- the
gate is a single decision card, not a table of rows).

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1175 files, no
violations -- the new Overview-page `classifyExistingRelationship` call stayed at the
`apps/web` layer, the same placement DISC-OFFER-P0-08.2 already established, not a new
module-crm dependency inside module-discovery itself), `lint:migrations` (134 migrations,
no violations), `npx vitest run --root packages/module-discovery` (186/186, +8 new -- 5
for `selectTopGateOpportunity`, 3 for `effectiveRecommendedAction`), a live migration
apply + `get_advisors` for both `security`/`performance` against the dev project
(`jazdtomcgqjxjueedmck`) -- no new findings of any kind, security or performance (this
migration adds one column with an inline check constraint, no new index), and a clean
`next build` (confirmed the Overview page, which now conditionally renders the gate card,
and the Opportunity Detail route, which now renders the override form, both build with no
errors). Same live-browser-walkthrough constraint noted in every prior UI-touching story
this run (no seeded demo user/`.env.local` in this environment) -- particularly relevant
here given the gate card's own conditional rendering (nothing to show until a real,
scored, pending opportunity exists) and the two-button-per-form patterns on both the gate
card and the override form.

**Status**: 41 of 68 in-scope stories done -- **Phase E complete** (all sixteen
09.1-15.1 stories done). Next: Phase F (P1), starting with DISC-OFFER-P1-01.1, Scheduled
Offering Re-Discovery.

### P1-01.1 — Scheduled Offering Re-Discovery (2026-09-12)

Phase F begins -- first P1 story after all sixteen P0 Phase E stories. The doc gives this
story no "Acceptance criteria" heading either (same shape as several P0 stories this run
already treated as schema-plus-minimal-UI) -- a worked example ("Last discovery: Today,
10:30 / Next discovery: Tomorrow / [Run Now]") and one line: "Only meaningful changes
should create new opportunities."

**"Only meaningful changes should create new opportunities" was checked first and found
already true** -- re-reading `runSignalsStage`'s own `prospectsPendingOpportunity`
selector (DISC-OFFER-P0-10.1): it already filters to prospects under the active
definition with *no opportunity yet*, so re-running the pipeline a second time only ever
creates opportunities for genuinely new accounts discovered since the last run, never a
second opportunity for one already covered. Combined with `discoverProspects`' own
`findDuplicateProspect` check (also already existing), a full pipeline rerun is already
naturally incremental at the opportunity-creation level. No code change needed for this
line -- verified and documented here, the same "check what already holds before building
something to re-guarantee it" discipline DISC-OFFER-P0-15.1 just applied to its own two
acceptance lines.

**The genuine, hard architectural question this story raised**: whether the doc's own
"on a schedule" implies the system should *unattended*, without a founder present,
actually re-run the pipeline once due. Investigated this before writing any code, since
it's a real architecture question (CLAUDE.md dev principle #14: don't change architecture
without approval) rather than a UI detail. Found: every function the fourteen-stage
pipeline depends on (`understandProduct`, `generateIcp`, `discoverProspects`,
`researchProspect`, `generateResearchBrief`, and every mutation/query between them) is
built exclusively around the per-request, RLS-scoped, signed-in-user Supabase client
(`db/server.ts`) -- unlike `module-fsm`'s own `sendDueReminders`/`core`'s own
`drainDomainEvents`, which are cron-native functions built from the start around an
admin (service-role) client precisely because "a cron invocation has no signed-in user"
(both functions' own doc comments say so explicitly). `module-discovery` has no admin
client of its own at all (`module-fsm`/`core` each do, `db/admin.ts`) and nothing in this
pipeline was built to accept one. Retrofitting every AI-calling function and its
downstream mutations to support an injectable admin client so an unattended cron could
drive them is a cross-cutting, module-wide architecture change -- not something this one
story's own two-line spec implies building, and exactly the kind of change CLAUDE.md dev
principle #10 ("do not refactor unrelated code") and #14 warn against doing as a side
effect of a single P1 story. Re-reading the doc's own mockup with this in mind: it shows
only a due-date display and a manual `[Run Now]` override -- nothing promising silent
background execution -- so the literal, honestly-buildable reading is "compute and show
when a rerun is due, let a founder trigger it (early or on time) themselves," not "the
system reruns itself while nobody is watching." Built exactly that, and flagged the
larger question explicitly rather than either quietly building a fake automation or
quietly declining the whole story.

**Schema** (`20260912250000_discovery_workspaces_rediscovery_schedule.sql`): two columns
on `discovery.workspaces` (1:1 with an offering, so no new table -- checked the entity
ownership map first, no "schedule"/"recurrence" concept listed) -- `rediscovery_interval`
(`off`/`daily`/`weekly`, closed vocabulary default `off`, the same closed-enum discipline
`pipeline_runs.trigger`/`icp_profile_versions.source` already established) and
`next_discovery_at` (nullable, null exactly when off -- "no false precision"). "Last
discovery" is deliberately **not** a column -- derived from `discovery.pipeline_runs`
(DISC-OFFER-P0-14.1, already the authoritative completed-run record) via new
`getLastCompletedPipelineRun`, the same "don't store what's already derivable"
discipline 14.1's own migration already applied to "AI provider/model"/"stages
executed".

**Logic**: new `lib/tenancy/rediscovery.ts` -- `computeNextDiscoveryAt(interval, from)`
(pure date arithmetic, off→null/daily→+1 day/weekly→+7 days) and `isRediscoveryDue`
(pure comparison), both genuinely new domain logic and both unit-tested (7 cases: each
interval's own math, and due/not-yet-due/exactly-due boundary checks) -- this run's own
"new pure domain logic gets a test" convention, unlike the trivial `version + 1` bumps in
DISC-OFFER-P0-10.2/14.2 that stayed untested as thin DB-composing arithmetic. New
`setRediscoveryInterval` (`lib/tenancy/mutations.ts`) recomputes `next_discovery_at` from
*now* whenever a founder changes the cadence (switching to "Daily" starts today, not from
whatever a stale prior setting left behind). `completePipelineRun` (10.2/14.1's own
mutation) now also advances `next_discovery_at` on a **completed** run only, reading the
workspace's own current interval fresh -- a failed run leaves the schedule exactly where
it was rather than silently buying another full interval before anyone notices nothing
actually ran.

**UI**: new `RediscoverySchedule` component (`components/pipeline/`) on the offering
Overview page, directly above `RunAiDiscoveryPanel` -- the doc's own Last/Next-discovery
display plus an interval selector. **Deliberately renders no second "Run Now" button of
its own** -- `RunAiDiscoveryPanel`'s existing "Run AI Discovery Again" immediately below
already is that action; a second button here doing the identical thing would read as two
different controls for one action rather than one clear entry point. Flagged as a scope/
placement call, not an omission.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1178 files, no
violations), `lint:migrations` (135 migrations, no violations), `npx vitest run --root
packages/module-discovery` (193/193, +7 new for `rediscovery.ts`), a live migration apply
+ `get_advisors` for both `security`/`performance` against the dev project
(`jazdtomcgqjxjueedmck`) -- no new findings of any kind (two plain columns, no new
index), and a clean `next build` (confirmed the Overview page, which now renders the
schedule widget, builds with no errors). Same live-browser-walkthrough constraint noted
in every prior UI-touching story this run (no seeded demo user/`.env.local` in this
environment).

**Status**: 42 of 68 in-scope stories done -- Phase F underway. Next: P1-01.2,
Incremental Re-Run.

### P1-01.2 — Incremental Re-Run (2026-09-12)

The doc gives this story no "Acceptance criteria" heading either -- just one line ("When
a new signal arrives, do not rerun the whole pipeline") and a three-step worked example
("New signal → Re-score affected opportunity → Recalculate Why Now → Update recommended
action").

**Found a real, concrete gap, not a hypothetical one** -- traced every pipeline stage
handler in `handlers.ts` (DISC-OFFER-P0-10.1) and confirmed each one filters strictly on
"never yet computed" (`!o.signal_correlation_id`, `!o.why_now`, `!o.recommended_action`):
by design, so a rerun of "AI Discovery" never redoes already-done work. The real
consequence: once an opportunity has its first correlation/why-now/recommendation,
*nothing in this module ever revisits it again* -- not even the pipeline's own rerun,
since `prospectsPendingOpportunity` (10.1) already excludes any prospect that already has
one. The one place fresh evidence for an *existing* opportunity actually does arrive
today is a founder manually clicking "Research" again on the Prospect Detail page
(`researchProspectAction` → `researchProspect()`) -- and that path updates
`ProspectResearch` only; it never calls `syncSignalsFromResearch` at all (that function is
only ever invoked from the pipeline's own `signals` stage), so a re-research today
produces fresher evidence with zero downstream effect. That silent no-op is exactly what
"do not rerun the whole pipeline [for a new signal], but do *something*" is asking to fix.

**New `applyIncrementalSignalUpdate(workspaceId, prospectId)`** (`lib/pipeline/
incremental.ts`) -- the doc's own three-step example, scoped to *this one prospect's*
own open opportunities only (never touches any other opportunity in the workspace, the
literal "do not rerun the whole pipeline"): syncs signals and negative signals once
(prospect-level facts, not opportunity-level), then for each open opportunity
re-correlates, reattaches (recomputing `score`/`signal_strength_score` -- 05.2's own
auto-recompute-on-write already happens inside `attachSignalCorrelation`), recalculates
Why Now (`setOpportunityWhyNow`), and updates the recommended action
(`setOpportunityNextBestAction`) -- unconditionally, unlike the pipeline stage handlers'
own "only if missing" filters, since fresh evidence is precisely the trigger this
function exists to react to. A prospect with no open opportunity (brand new, or every one
already resolved) is a no-op -- correctly nothing for fresh evidence to update yet.

Extracted `buildNextBestActionInput(workspaceId, opportunity)` out of
`runRecommendedActionStage` (10.1) into its own exported function in `handlers.ts`, so
both the stage handler and the new incremental path build the exact same
`NextBestActionInput` shape from one place rather than two copies that could drift apart
-- a direct, in-scope extraction this story's own reuse need requires, not an unrelated
refactor (CLAUDE.md dev principle #10). Trades one extra `personas`/`icp` fetch per
opportunity (previously fetched once per batch in the stage's own loop) for that single
shared implementation -- a deliberate, noted tradeoff given typical open-opportunity
counts are small.

**Wiring**: `researchProspectAction` (`prospects/[prospectId]/actions.ts`) now calls
`applyIncrementalSignalUpdate` right after a successful `researchProspect()`, wrapped in
its own try/catch -- a founder's fresh research is already saved and worth showing
regardless of whether the follow-on incremental recompute hits something unexpected,
the same "never let a secondary effect's failure mask the primary success" restraint
this run has applied elsewhere (`recordAiRun`'s own logging-failure isolation,
DISC-OFFER-P0-14.1). No other call site of `researchProspect()` needed the same wiring --
the pipeline's own `runSignalsStage` only ever calls it for a prospect *without* an
opportunity yet (its own `prospectsPendingOpportunity` selector), so
`applyIncrementalSignalUpdate` would always find zero open opportunities there and
correctly no-op even if it were added -- left out to avoid a pointless extra call rather
than for correctness.

No migration this story -- pure code over already-existing tables/columns. No new pure
domain logic worth its own unit test either: `applyIncrementalSignalUpdate`'s own
`RESOLVED_STATUSES` filter mirrors `activeOpportunities`' own equivalent filter (10.1,
never separately tested), and the rest is DB-composing orchestration over already-tested
mutations (`attachSignalCorrelation`/`setOpportunityWhyNow`/`setOpportunityNextBestAction`
each already covered by their own underlying pure functions' tests) -- this run's own "no
unit test for a DB-composing function" precedent.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1179 files, no
violations), `lint:migrations` (135 migrations, no violations -- no schema change), `npx
vitest run --root packages/module-discovery` (193/193, unchanged -- confirmed the
`buildNextBestActionInput` extraction changed no behavior, same count as before this
story), and a clean `next build` (confirmed the prospect detail route, which now calls
the incremental update after research, builds with no errors). Same
live-browser-walkthrough constraint noted in every prior UI-touching story this run (no
seeded demo user/`.env.local` in this environment) -- particularly relevant here since
this story's own real effect (an already-scored opportunity's correlation/why-now/
recommendation actually changing after a second "Research" click) has no UI element of
its own to visually confirm beyond the existing Opportunity Detail page already
re-rendering those same fields.

**Status**: 43 of 68 in-scope stories done -- Phase F underway. Next: P1-02.1, Review
Required Indicators.

### P1-02.1 — Review Required Indicators (2026-09-13)

**Verified starting state first**, per this run's own standing instruction: this worktree's
own checked-out HEAD was found sitting on a *different* concurrent workstream's own
scratch-merge branch (`worktree-agent-a02bb7313e47bc5e6`, tip `e86431e` -- a merge of
`feature/platform-admin-portal` into `scratch-plat-11-3-merge`), not
`disc-offering-backlog` at all -- exactly the "stray scratch-merge branch" environment
artifact this run's own instructions warned every workstream has hit before. Working tree
was clean, so fixed with a plain `git checkout disc-offering-backlog` onto the real
tracked tip (`7a1eefb`, P1-01.2) rather than anything destructive. `git fetch origin main
disc-offering-backlog && git log origin/main..origin/disc-offering-backlog --oneline` was
then empty, confirming 43/68 fully merged already, and `npm install` was run fresh in this
worktree per this run's own "don't trust a worktree's stale `node_modules`" instruction.

The doc gives this story no "Acceptance criteria" heading either (same shape as several
prior schema-plus-minimal-UI stories) -- the doc's own three-symbol legend ("✓ High
confidence — automated" / "⚠ Needs review" / "? Insufficient evidence") and one line:
"The user can still edit any stage."

**Checked what already held before building anything, per this run's own "inspect before
changing" discipline**: `discovery.pipeline_stages.status`'s own original six-state
vocabulary (DISC-OFFER-P0-10.2) already anticipated this exact story by name in its own
migration/type comment -- `needs_review` was defined in the check constraint from the
start but had zero producers (every DISC-OFFER-P0-10.1 handler either completes or fails
outright), with that comment explicitly naming DISC-OFFER-P1-02.1 as "the story that
actually decides when a stage's own result is uncertain enough to land there instead of
`completed`." This story is that producer. The doc's own third symbol ("? Insufficient
evidence") is a genuinely narrower, different fact than "⚠ Needs review" -- a stage that
ran and found nothing at all to work with, vs. one that found something but it's weak
(the same distinction DISC-OFFER-P0-05.5's own `insufficient_evidence` vs.
`no_relevant_problem` split on negative signals already established for a different
table) -- so rather than collapsing both symbols onto the one existing `needs_review`
value, widened `pipeline_stages.status`'s own check constraint to add
`insufficient_evidence` as a real seventh, additive state
(`20260912260000_discovery_pipeline_stages_insufficient_evidence.sql`), the same "widen a
check constraint for a real third state" precedent DISC-OFFER-P0-01.1 already established
for `products.status`. Confirmed the live constraint's exact name
(`pipeline_stages_status_check`) against the dev database before writing the migration,
rather than assuming Postgres's default naming.

**New `lib/pipeline/review.ts`** -- pure, deterministic classification (CLAUDE.md dev
principle #4/#5, no AI call of its own): `StageReviewLevel = "automated" | "needs_review"
| "insufficient_evidence"`, `worstReviewLevel()` (worst-wins aggregation across several
independent readings one stage's own run touched, the same discipline
DISC-OFFER-P0-05.4's own "weaker of timing/correlation confidence" already established),
`classifyNumericConfidence()` (for the two stages whose own AI output already carries a
plain 0-1 confidence number -- `ProductProfileSchema`/`IcpProfileSchema`'s own
`confidence` -- against this story's own new judgment-call thresholds: ≥0.7 automated,
≥0.4 needs review, below insufficient evidence; the doc names no specific numbers, so
these are flagged here as this story's own genuinely new call, not derived from anything
pre-existing), `classifyEnumConfidence()` (for every stage whose output already carries
this module's established low/medium/high vocabulary -- signal correlation, why-now,
research briefs, opportunity scoring -- `"high"` is the only tier safe to leave fully
automated; `hasEvidence` distinguishes a real-but-weak `"low"` reading from "found
genuinely nothing," using whichever null-typed sibling field that stage already uses for
the latter), and `classifyEvidenceConfidences()` (same idea for a *list* of readings --
evidence items, buyer-intelligence candidates -- an empty list is `insufficient_evidence`
directly). 13 new vitest cases cover every threshold/boundary and both aggregation
functions.

**Wired into every stage handler with a real confidence-bearing result of its own**
(`handlers.ts`, `StageOutcome` gained an optional `reviewLevel`) -- deliberately **not**
wired into the four purely deterministic, rule-based stages (`buyer_personas`,
`discovery_strategy`, `account_discovery`, `crm_handoff`): none of them has an AI
judgment call of its own to second-guess, so an undefined `reviewLevel` (route treats it
identically to `"automated"`) is the honest answer, not an oversight. For every other
stage, reused whichever confidence-bearing value that stage's own already-existing
function already produces rather than computing a second, parallel signal:
`website_understanding`/`offering_profile` -- `product_profile.confidence`;
`icp` -- `icp.confidence`, **with a flagged judgment call**: a `null` confidence here
(the doc's own field is nullable) means this run made no *fresh* automated claim of its
own to review, since it happens either when a pre-existing/already-approved ICP was
reused untouched (`generateIcp`'s own freshness check) or when the live ICP's last write
was a founder's own manual edit (`updateIcpProfile` clears confidence -- `icp/types.ts`'s
own comment) -- both read as `"automated"` (nothing new to flag), not "insufficient
evidence," since a human already touched or approved it either way; `signals` -- every
evidence item's own confidence across every account researched this run (an account whose
research turned up zero evidence items correctly contributes its own empty reading, not
silently excluded); `signal_correlation` -- each opportunity's own new correlation
confidence, **with an opportunity that had literally no correlatable signals this run
counted as its own `insufficient_evidence` reading**, not excluded from the aggregate;
`opportunity_scoring` -- each open opportunity's own `confidence`, with a `null` score
mapped straight to `insufficient_evidence` (DISC-OFFER-P0-05.2's own literal "Insufficient
evidence" case); `why_now` -- each opportunity's own just-written `timing_strength`/
`why_now_confidence` (a null `timing_strength` is `computeWhyNow`'s own "no correlation to
work with" case); `research` -- each generated brief's own `confidence`; `buyer_intelligence`
-- each opportunity's own buyer-candidate list confidences; `recommended_action` -- reuses
the same opportunity `score`/`confidence` `buildNextBestActionInput` already gathers
(DISC-OFFER-P1-01.2's own extraction), rather than computing a second copy.

**`markPipelineStageCompleted`** (`mutations.ts`) gained an optional `reviewLevel`
parameter: the persisted status *is* the classification (`"needs_review"`/
`"insufficient_evidence"` written directly when not `"automated"`, `"completed"`
otherwise, unchanged from before this story) -- no separate flag column to ever drift out
of sync with it, the same "which value is non-null says which one produced it" discipline
DISC-OFFER-P0-14.2 already established for the ICP's own `source` distinction.
`pipeline_stage_runs`' own recorded outcome stays `"completed"` regardless -- the
technical attempt itself succeeded either way; that table's status vocabulary is a
different, narrower concept (untouched by this story). Only one call site
(`run-ai-discovery/route.ts`) needed updating.

**A real, direct blast-radius fix this story's own schema change required**:
`display-groups.ts`'s own `allDone`/"next incomplete stage" logic and the panel's own
`firstIncompleteIndex` both previously checked `status === "completed" || status ===
"skipped"` literally -- introducing two new terminal statuses without touching these would
have made the pipeline (and the client's own auto-run loop) treat a `needs_review`/
`insufficient_evidence` stage as permanently unfinished, re-running it forever and never
advancing. New exported `isStageStatusDone()` (`display-groups.ts`) is the one place both
that file's own group computation and the panel's `firstIncompleteIndex` now agree on
what "done" means, rather than two copies that could drift. "The user can still edit any
stage" holds structurally from this: review is advisory only, never a gate -- the
pipeline always continues exactly as before this story once a stage reaches any of its
four "done" statuses.

**UI** (`run-ai-discovery-panel.tsx`): a `completed` group whose own worst `reviewLevel`
isn't `"automated"` now renders `AlertTriangle`/`HelpCircle` (⚠/?) in place of the plain
checkmark, plus the doc's own exact label text in parentheses next to the group name
(`STAGE_REVIEW_LABEL`), and the expanded per-stage detail line names `"Needs review"`/
`"Insufficient evidence"` alongside its timestamp exactly like the existing `"Completed"`/
`"Failed"` lines already do. **A flagged scope call**: no separate always-visible legend
block explaining the three symbols was added -- each badge already carries its own label
text inline, making a standalone legend redundant rather than genuinely informative;
noted here as a deliberate choice, not an oversight. New `DisplayGroupView.reviewLevel`
field (2 new display-groups vitest cases: the new statuses are treated exactly like
`completed`/`skipped` for group-done purposes, and a group's own worst review level
surfaces correctly).

No changes to `pipeline_stage_runs`, `pipeline_runs`, the Run History UI (14.1), or
`icp_profile_versions` (14.2) -- none of their own status vocabularies overlap with
`pipeline_stages.status`, confirmed by grep before concluding this story's blast radius
was fully covered.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1181 files, no
violations), `lint:migrations` (136 migrations, no violations), `npx vitest run --root
packages/module-discovery` (209/209, +16 new), a live migration apply (confirmed the
live constraint's exact name first) + `get_advisors` for both `security`/`performance`
against the dev project (`jazdtomcgqjxjueedmck`) -- no new findings of any kind (a pure
check-constraint widening adds no column/index; same baseline findings as every prior
story), and a clean `next build` (confirmed the `run-ai-discovery` route, which now writes
and renders the two new statuses, still builds with no errors and appears in the route
manifest). Same live-browser-walkthrough constraint noted in every prior UI-touching story
this run (no seeded demo user/`.env.local` in this environment) -- particularly relevant
here since this story's own real effect (a badge appearing instead of a checkmark) has no
way to be visually confirmed beyond the typecheck/build/test evidence above.

**Status**: 44 of 68 in-scope stories done -- Phase F continuing. Next: P1-02.2, Rerun
Impact Confirmation.

### P1-02.2 — Rerun Impact Confirmation (2026-09-13)

The doc gives this story no "Acceptance criteria" heading either -- just the one worked
example itself (`"Changing ICP will update:"` followed by a ✓-per-line checklist of seven
founder-facing groups, then `[Save & Run Downstream] [Save Only] [Cancel]`).

**Checked what already existed before building anything**: DISC-OFFER-P0-11.1 ("Editable
Pipeline Stages") already built almost exactly this flow for the doc's own single worked
example (the ICP page) -- a "Save & Run Downstream" button guarded by a plain
`window.confirm()` that named the same affected groups
(`downstreamGroupLabels("icp")`, DISC-OFFER-P0-11.3) as a sentence, alongside a separate,
always-visible plain "Save" button. That confirm() is a real, if approximate, prior
implementation of "the user receives a clear warning before downstream results are
replaced" -- but it's genuinely short of this story's own worked example in two concrete
ways: a native confirm renders one plain sentence, not the doc's own named per-line
checklist, and it only ever offers a binary choice (proceed with the one button already
clicked, or abort it) -- there is no way, once that dialog is open, to instead choose
"Save Only" without first cancelling and clicking a different button. This story closes
exactly that gap rather than rebuilding the whole flow from scratch.

**Replaced the native `confirm()` with a real `AlertDialog`** (`save-and-run-downstream-
button.tsx`, the same vendored dialog primitive already used throughout this module):
opens on clicking "Save & Run Downstream", renders the doc's own literal heading and a
`✓`-prefixed list of every affected group by name (or, when nothing downstream depends on
this yet -- an empty `downstreamGroupLabels` result -- a plain sentence saying so, the
same "no false precision" restraint every confidence-shaped display in this module
already applies), and offers all three of the doc's own actions together in its own
footer: **Cancel** (`AlertDialogCancel`, closes with no submission -- genuinely new; the
old confirm's only "no" path aborted the one button already clicked, it never offered a
neutral third option), **Save Only** (genuinely new -- previously only reachable by
first cancelling the confirm and clicking the *other*, separate button), and **Save &
Run Downstream** (the same action as before, now reachable from inside the dialog
instead of triggering it).

**The one real technical wrinkle**: Radix renders `AlertDialogContent` into a portal
(`document.body`), so the two real submit buttons living inside it are no longer DOM
descendants of the ICP edit `<form>` the way both original buttons were. Solved with the
standard HTML `form` attribute (exactly what it exists for -- a submit control anywhere
in the document, portal included, can still submit a specific form by id), rather than
manually reconstructing `FormData` from a ref: gave the form a stable `id`
(`icp-edit-form`) and each dialog button `form={formId}` plus its own `formAction`
override, so a click still submits the form's own live field values (including whatever
the founder had already typed) through whichever server action that specific button
names -- identical semantics to when both buttons lived directly inside the form, just
reassociated rather than reimplemented. `SaveAndRunDownstreamButton` gained
`saveOnlyAction`/`formId` props alongside its existing `runDownstreamAction`
(renamed from `formAction` for clarity now that the component drives two actions, not
one); the ICP page passes the exact same `updateIcpAction` binding to `saveOnlyAction`
that its own always-visible "Save changes" button already submits -- "Save Only" inside
the dialog is a second way to reach that identical, already-existing outcome, not a new
code path.

Scoped to the ICP alone, matching the doc's own single worked example and
DISC-OFFER-P0-11.1's own already-established precedent for scoping this exact flow --
buyer personas/discovery strategy/offering profile still have no "Save & Run Downstream"
affordance of their own yet (11.1's own log entry already explains why: each is currently
either upstream of everything or a dead-end branch in DISC-OFFER-P0-11.3's dependency
graph, so the button would presently invalidate either everything or nothing) --
unaffected by this story, which only replaces the *confirmation* step of the one flow
that already exists.

No migration, no new pure domain logic (a presentation/wiring change over
DISC-OFFER-P0-11.3's own already-tested `downstreamGroupLabels`, matching this run's own
"no unit test for a DB-composing/UI-wiring function" precedent -- the only genuinely new
logic here is which HTML attributes connect a button to a form, not a computation).

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1181 files, no
violations), `lint:migrations` (136 migrations, no violations -- no schema change), `npx
vitest run --root packages/module-discovery` (209/209, unchanged -- no new pure logic per
the note above), and a clean `next build` (confirmed the ICP route, which now renders the
new dialog, still builds with no errors and appears in the route manifest). Same
live-browser-walkthrough constraint noted in every prior UI-touching story this run (no
seeded demo user/`.env.local` in this environment) -- particularly relevant here given
the portal/`form`-attribute association is exactly the kind of interactive behavior a
real browser click-through would most directly confirm; flagged rather than silently
assumed to work.

**Status**: 45 of 68 in-scope stories done -- Phase F continuing. Next: P1-03.1,
Offering Definition Quality.

### P1-03.1 — Offering Definition Quality (2026-09-13)

The doc gives this story no "Acceptance criteria" heading either -- just the one worked
example ("Offering Definition Quality: 86/100" over five named dimensions -- Description,
Target Customer, ICP Evidence, Buyer Evidence, Differentiation -- each labeled
Strong/Medium) shown "after website analysis."

Checked the entity-ownership map first: no "quality score"/"diagnostic" concept listed for
any module, so this is a genuinely new, small computed value, not a duplicate of
anything. Checked what already existed for each of the doc's own five dimensions before
inventing new storage: every input already exists on already-persisted rows --
`offering.detailed_description`/`product_profile.description` (Description),
`icp.industries`/`company_sizes`/`roles` (Target Customer), `icp.confidence`/`icp.evidence`
(ICP Evidence, DISC-OFFER-P0-13.1), buyer personas and their own `notes` (Buyer Evidence,
DISC-OFFER-P0-02.3), and `product_profile.differentiators`/`competitive_positioning`
(Differentiation) -- so this is purely a *read-time computation* over data that already
exists, needing no new column or table of its own (CLAUDE.md dev principle #7 -- no
speculative storage for a value fully derivable from what's already there).

**New `lib/offerings/definition-quality.ts`** -- `computeOfferingDefinitionQuality()`,
pure and deterministic (CLAUDE.md dev principle #4: no LLM for a computable diagnostic,
the same discipline DISC-OFFER-P1-02.1's own `lib/pipeline/review.ts` just established for
a comparable "how much should a founder trust this" question). Deliberately **not**
built by importing that file's own three-tier classifier -- this diagnostic answers a
different question (definitional *completeness* of the offering itself, across a wider,
unrelated set of inputs) than a single pipeline stage's own run-to-run confidence, so its
own `strong`/`medium`/`weak` vocabulary and thresholds are independently authored rather
than reusing `review.ts`'s `automated`/`needs_review`/`insufficient_evidence` naming,
which reads as pipeline-specific. Each dimension's own threshold is this story's own new,
flagged judgment call (the doc names no specific numbers, same situation P1-02.1's own
numeric thresholds were in): Description needs 15+ words of real text to be Strong (any
non-empty text still beats nothing); Target Customer needs all three of
industries/company sizes/roles populated; ICP Evidence is `weak` whenever `confidence` was
never computed at all (a null confidence is DISC-OFFER-P0-13.1's own "genuinely never
computed" fact, a different thing from "computed and found unconfident" -- so this
dimension correctly can't be faked strong just by filling in ICP fields by hand with no
automated evidence behind them) and otherwise reads confidence/evidence-quote presence
together; Buyer Evidence needs two or more personas with real notes on at least one to be
Strong; Differentiation needs both a real differentiator list (2+) and a substantive
positioning statement (5+ words) together. Overall score is a plain average of the five
dimensions' own scores (strong=100/medium=60/weak=20), rounded -- exactly reproduces the
doc's own "86/100" shape for a mix of mostly-strong, some-medium dimensions. 12 new vitest
cases: the all-weak and all-strong extremes, `description`'s own detailedDescription-over-
AI-profile preference and its fallback, and one boundary case per remaining dimension.

**UI**: added directly to `OfferingOverviewSummary` (DISC-OFFER-P0-03.2) rather than a new
section or page -- that component already renders only once `product.product_profile`
exists (03.2's own gate), which *is* the doc's own literal "after website analysis"
trigger, and it already receives every input this diagnostic needs (`offering`/`icp`/
`personas`) as props, so no new data fetching was required anywhere. New card ("Offering
definition quality", the overall `X/100` plus each dimension's own label and a
Strong/Medium/Weak `Badge`, reusing the existing default/secondary/outline variant
progression rather than inventing new colors) placed directly below the existing "What
should I do today?" banner, above the three-column Offering/ICP/Prospects grid.

No migration this story -- purely a read-time computation over already-existing columns.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1183 files, no
violations), `lint:migrations` (136 migrations, no violations -- no schema change), `npx
vitest run --root packages/module-discovery` (221/221, +12 new), and a clean `next build`
(confirmed the offering Overview route, which now renders the new card, still builds with
no errors). Same live-browser-walkthrough constraint noted in every prior UI-touching
story this run (no seeded demo user/`.env.local` in this environment).

**Status**: 46 of 68 in-scope stories done -- Phase F continuing. Next: P1-03.2, Missing
Information Suggestions.

### P1-03.2 — Missing Information Suggestions (2026-09-13)

The doc gives this story no "Acceptance criteria" heading either -- just the one worked
example ("We understand what you sell. / We are less certain about: - Ideal customer size
- Primary buyer - Geographic focus / [Research Further] [Edit Manually]") plus one
explicit line: "Never manufacture missing information."

**Checked the entity-ownership map and DISC-OFFER-P1-03.1's own new module first**: no
"missing information"/"gaps" concept listed anywhere, and -- despite sitting right next
to P1-03.1 in the doc's own §22 "Offering Quality" epic -- this is a genuinely different
question from that story's own five broad dimensions (Description/Target Customer/ICP
Evidence/Buyer Evidence/Differentiation), not a re-presentation of the same data: a
founder can act on "Geographic focus" directly by filling in one field, but can't act on
"Target Customer" as a single undifferentiated dimension-level verdict. Built as its own
small pure module rather than deriving this list from P1-03.1's own dimension scores.

**New `lib/offerings/missing-information.ts`** -- `identifyMissingOfferingInformation()`,
pure and deterministic (CLAUDE.md dev principle #4), checking four specific, genuinely
checkable ICP-shaped fields for emptiness: target industries, ideal customer size
(`icp.company_sizes`), geographic focus (`icp.geographies`), and primary buyer (`icp.roles`
*or* a real buyer persona -- DISC-OFFER-P0-02.3's own persona is a richer record of the
same "who buys this" question `icp.roles` answers more loosely, so having either one is
real evidence, not a gap). "Never manufacture missing information" is structural here, the
same way every other "no false precision" instruction in this run has been satisfied
structurally rather than by convention: every item corresponds to a literally empty field,
nothing is inferred about *why* it's empty, and a fully-populated ICP with real personas
returns an empty list rather than a placeholder in this test suite of 5 new vitest cases:
the all-empty case, the fully-populated case, the "persona substitutes for ICP roles"
case, the doc's own exact three-item worked example reproduced from real data, and a check
that the label wording matches the doc's own literal phrasing.

**Wiring**: new `regenerateIcpFromOverviewAction` (Overview page's own `actions.ts`) is
the "[Research Further]" button -- an identical call to `icp/actions.ts`'s own
`generateIcpAction` (forced ICP regeneration via `generateIcp(productId, {force:true})`),
duplicated here rather than imported across route files, the same "each route directory
keeps its own actions.ts wrapping the same underlying module mutations" convention
DISC-OFFER-P0-15.1 already established for this exact file. "[Edit Manually]" is a plain
link to the ICP page, styled with the vendored `buttonVariants` helper rather than
hand-rolled classes so it matches the "Research Further" button pixel-for-pixel.

**UI**: added to `OfferingOverviewSummary` alongside P1-03.1's own new card, same gate
reasoning (this component already only renders once a product profile exists -- "we
understand what you sell" is quite literally true at that point) and same "empty means
don't render" restraint -- a fully-defined offering shows no callout at all rather than an
empty "less certain about" list with nothing under it.

No migration this story -- pure code over already-existing columns.

Verified with full monorepo typecheck (clean across all 9 workspaces -- caught and fixed
one real ESLint miss along the way: an initial `regenerateIcpFromOverviewAction` draft
kept an unused, now-trailing `_prevState` parameter for symmetry with `AiActionForm`'s own
action type, which `@typescript-eslint/no-unused-vars`'s "after-used" rule flags whenever
an unused parameter is the *last* one declared, unlike every existing sibling action in
this file where `_prevState` is always followed by a real, used `formData` -- fixed by
dropping both unused parameters entirely, since a function declared with fewer parameters
is still structurally assignable to `AiActionForm`'s two-parameter action type, the same
"fewer declared params is a valid substitute" TypeScript rule this codebase already relies
on elsewhere), `npm run lint` (0 errors, 1 pre-existing unrelated warning after that fix,
unchanged), `lint:boundaries` (1185 files, no violations), `lint:migrations` (136
migrations, no violations -- no schema change), `npx vitest run --root
packages/module-discovery` (226/226, +5 new), and a clean `next build` (confirmed the
offering Overview route, which now renders the new callout and its "Research Further"
form, still builds with no errors). Same live-browser-walkthrough constraint noted in
every prior UI-touching story this run (no seeded demo user/`.env.local` in this
environment).

**Status**: 47 of 68 in-scope stories done -- **Phase "P1 — Offering Quality" (§22)
complete**. Next per §29's own sequence: Phase "P1 — Learning From Human Corrections"
(§23), starting with P1-04.1, Learn From User Edits.

### P1-04.1 — Learn From User Edits (2026-09-13)

**Verified starting state first**, per this run's own standing instruction, and found the
same environment artifact again: this worktree's own checked-out HEAD was sitting on a
*different* concurrent workstream's own scratch-merge branch
(`worktree-agent-a04ebf172939ca6fb`, tip `95d78bb` -- a merge of
`feature/platform-admin-portal` into `scratch-plat-14-merge`), not `disc-offering-backlog`
at all -- the third time this exact artifact has hit this workstream (P1-02.1's own log
entry already recorded the first). Working tree was clean, so fixed with a plain `git
checkout disc-offering-backlog` onto the real tracked tip (`b622daf`, P1-03.2). `git fetch
origin main disc-offering-backlog && git log origin/main..origin/disc-offering-backlog
--oneline` was then empty, confirming 47/68 fully merged already, and `npm install` was run
fresh in this worktree per this run's own "don't trust a worktree's stale `node_modules`"
instruction.

A prior attempt at this exact story was interrupted mid-flight before any commit --
confirmed via `git log` that no `offering_feedback` migration exists anywhere in this
branch's or `main`'s history, and confirmed via `list_tables` against the dev project that
`discovery.offering_feedback` did not exist live either. Starting fully fresh, not
resuming partial work, per this run's own instructions.

Re-verified the prior attempt's own worked-out reasoning (handed down in this run's own
instructions) against the actual current codebase rather than taking it on faith:
- **`00-MASTER-PLAN.md` §5 checked directly**: confirmed no "feedback"/"correction" concept
  listed for any module -- a new table is genuinely warranted.
- **`icp_profile_versions` re-read directly** (`lib/icp/types.ts`, the
  DISC-OFFER-P0-14.2 migration): confirmed it really does tag every snapshot
  `ai_generated`/`user_edit`, and confirmed `icp_profiles.version` always equals the
  version number of the most recently recorded snapshot (both `generateIcp` and
  `updateIcpProfile` bump `version` and immediately call `recordIcpProfileVersion` with
  the just-written row) -- so "was the content this edit is about to overwrite the AI's
  own last claim" is answerable with one indexed lookup
  (`icp_profile_versions` at `icp_id` + the pre-edit `version`), not a guess.
- **Real FK (`icp_id`), not a speculative polymorphic pair**: confirmed and kept -- the ICP
  remains the only correctable entity that exists in this module today.
- **jsonb `ai_value`/`user_value`**: confirmed and kept -- `icp_profiles`' own fourteen
  content columns genuinely mix plain strings (`name`/`description`) and string arrays
  (every other field).
- **Append-only, no update/delete**: confirmed and kept, matching
  `icp_profile_versions`/`pipeline_stage_runs`/`discovery.signals`.

**One correction to the prior attempt's own reasoning**: it stopped short of designing the
detection logic itself. The real question turned out to be narrower than "diff old vs new
ICP" -- it's "diff old vs new, but only when the *old* value is known to be the AI's own,
not a founder correcting their own prior edit" (there is no meaningful "AI value" to learn
from otherwise). This needed the extra `icp_profile_versions` lookup described above,
which the interrupted attempt's own notes never mentioned.

**New `lib/offerings/offering-feedback.ts`** -- `ICP_CONTENT_FIELDS`, the closed
fourteen-field list every content column `icp_profiles`/`icp_profile_versions` already
share (excludes `status`/`confidence`/`evidence`/`version`, which describe workflow state
or AI confidence, not a value a founder corrects), and `detectIcpFieldCorrections(aiFields,
userFields)` -- pure and deterministic (CLAUDE.md dev principle #4, no LLM for a
computable diff), returning one `{field, aiValue, userValue}` entry per field whose value
actually changed, in field-declaration order. Exact-order array comparison, not a set
comparison -- flagged as a deliberate simplification (CLAUDE.md dev principle #1): the
doc's own worked example is a single-value change, not a reordering, and this module has
no existing precedent for order-insensitive list comparison to reuse. The function itself
has no way to check provenance (that requires a DB round trip) -- its own doc comment says
so explicitly, so the caller is responsible for only invoking it when `aiFields` is
genuinely known to be the AI's last write. 6 new vitest cases: no-op on an unchanged save,
the doc's own literal "Retail" → "Banking" worked example reproduced exactly, a scalar
null-to-value change, multiple simultaneous corrections (order-checked), the
same-elements-reordered case (documents the flagged simplification as intentional
behavior, not an oversight), and an emptied-then-refilled field landing back on its
original value correctly producing no correction.

**Schema** (`20260912270000_discovery_offering_feedback.sql`): `discovery.offering_feedback`
-- `workspace_id`/`icp_id` (both real foreign keys, both cascade-deleted, both explicitly
indexed since neither is covered by a leftmost composite-index prefix the way
`icp_profile_versions`' own `(workspace_id, version)` covers `workspace_id`), `field_name`
(closed vocabulary via check constraint, the exact same fourteen values as
`ICP_CONTENT_FIELDS` -- flagged as a "two things must stay in sync by hand" precedent,
matching `icp_profiles`/`icp_profile_versions`' own already-accepted identical-shape
duplication), `ai_value`/`user_value` (both jsonb, both nullable), `created_at`. Same
tenant-AND-licensed RLS pattern as every sibling table (`discovery.user_workspace_ids()`),
select-and-insert-only -- a recorded correction is a permanent fact, matching every other
append-only history table in this schema.

**Wiring** (`lib/icp/mutations.ts`): `updateIcpProfile` now reads the *full* pre-edit row
(previously only `version`, needed for nothing more than the increment) and, after
recording the `user_edit` version snapshot as before, calls new
`captureOfferingFeedbackIfAiOverwritten(previous, updated)`: returns immediately if
`previous.version < 1` (never snapshotted -- provenance genuinely unknown, so "never
manufacture missing information" means skipping rather than guessing, the same restraint
DISC-OFFER-P1-03.2 already applied); otherwise looks up the `source` of the
`icp_profile_versions` row at `previous.version` and proceeds only if it reads
`ai_generated`; then runs `detectIcpFieldCorrections` and inserts one `offering_feedback`
row per changed field. **Wrapped in its own try/catch that only logs** -- the same "never
let a logging failure break the caller's actual result" restraint `recordAiRun`
(`lib/ai/usage.ts`) already established for a comparable secondary, non-essential write: a
founder's ICP save is already durably committed before this ever runs, and a feedback-
capture hiccup must never turn a successful save into a thrown error.

**Deliberately NOT wired into `cloneIcpProfileToWorkspace`**: a clone replaces a target
workspace's *entire* ICP with a different offering's ICP wholesale -- every field would
register as "changed" even though nothing about this is a founder correcting a specific
AI claim about *their own* product, which would produce fourteen rows of pure noise per
clone rather than a real correction signal. Flagged as a scope call, not an oversight.

**"Do not silently retrain models"** is structural: `offering-feedback.ts` only ever
returns data; `captureOfferingFeedbackIfAiOverwritten` only ever writes rows. Nothing in
this story reads `offering_feedback` back into a prompt, a model choice, or any other
AI-facing parameter -- acting on this data is out of this story's own scope, matching the
doc's own explicit instruction.

No UI added -- the doc's own text for this story ("Capture recurring corrections... Store
this as structured offering feedback. Do not silently retrain models.") describes a
capture mechanism only, unlike several prior P1 stories whose own worked examples
explicitly showed founder-facing screens (badges, dialogs, cards). Nothing in this story's
text or worked example asks for a screen, so none was built (CLAUDE.md dev principle #7).

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1189 files, no
violations), `lint:migrations` (137 migrations, no violations), `npx vitest run --root
packages/module-discovery` (232/232, +6 new), a live migration apply + `get_advisors` for
both `security`/`performance` against the dev project (`jazdtomcgqjxjueedmck`) -- no new
findings of any kind beyond the two new indexes appearing in the pre-existing "unused
index" baseline noise (expected for a brand-new empty table, the same way
`icp_profile_versions_icp_id_idx` already appears there), and a clean `next build`
(confirmed the ICP route, whose `updateIcpAction`/`updateIcpAndRunDownstreamAction` both
call the now-changed `updateIcpProfile`, still builds with no errors). Same
live-browser-walkthrough constraint noted in every prior UI-touching story this run (no
seeded demo user/`.env.local` in this environment) -- particularly relevant here since
this story's own real effect (a row appearing in `offering_feedback` after a founder
corrects an AI-generated ICP field) has no UI of its own to visually confirm beyond the
typecheck/build/test evidence above and a live `execute_sql` spot-check would need a real
signed-in founder session to produce a genuine AI-generated-then-edited ICP to observe.

**Status**: 48 of 68 in-scope stories done -- Phase F continuing. Next: P1-04.2, Learn
From Outcomes.

### P1-04.2 — Learn From Outcomes (2026-09-13)

The doc gives this story no "Acceptance criteria" heading and no worked-example UI text
either -- just a plain data-flow diagram ("Offering → Discovery → Opportunity → Contact →
Conversation → CRM → Outcome") and one goal: "Measure whether Discovery produces useful
opportunities."

**Checked what already existed before building anything, per this run's own "inspect
before changing" discipline**: every link in the doc's own chain already exists
structurally in this schema -- `opportunities.prospect_id` → `prospects` (DISC-OFFER-
P0-05.1), `contacts.prospect_id`/`conversations.prospect_id` → `prospects` (both predate
this epic), `opportunities.status === "sent_to_crm"` for the CRM handoff (DISC-OFFER-
P0-08.1), and `prospects.outcome` (`"open" | "won" | "lost"`, also predating this epic)
for the deal result. Nothing needed connecting that wasn't already connected -- this
story is purely the *measurement* the doc's own one line asks for, over data that already
exists (CLAUDE.md dev principle #7).

**Distinguished from the pre-existing `lib/prospects/pipeline.ts`
`computeConversionFunnel`**, found during reconnaissance and worth naming explicitly since
it looks similar at a glance: that one tracks per-prospect *outreach engagement*
(research → score → strategize → message → sent → replied → closed), predates the
Opportunity model entirely, and never reaches CRM handoff or deal outcome -- a materially
different, narrower axis than this story's own opportunity-level chain ending at the
actual business result. Built as its own new module rather than extending that one.

**New `lib/opportunities/outcome-funnel.ts`** -- `computeOpportunityOutcomeFunnel()`, pure
and deterministic (CLAUDE.md dev principle #4): counts, across a set of per-opportunity
facts (`sentToCrm`/`hasContact`/`hasConversation`/`outcome`), how many reached each stage
of the doc's own chain, plus a `winRate` (share of every opportunity that became a won
deal -- "Measure whether Discovery produces useful opportunities" answered literally).
Each stage's count is independent, not a strict "furthest stage reached" ladder the way
`computeConversionFunnel`'s prospect stages are -- an opportunity can be sent to CRM
before this module ever logs a conversation for it, so nesting would misrepresent real
data. `winRate` is `null` for zero opportunities (no false precision -- the same
restraint every other score/percentage in this module already applies) but a real `0` once
there's at least one opportunity and none have won, since "Discovery produced
opportunities that all lost" is a genuine, reportable measurement, not an absence of one.
5 new vitest cases: the zero-opportunity null case, independent (non-nested) stage
counting, the won/lost/open split with its win-rate arithmetic, the real-zero-percent
case, and a rounding check.

**New `getOpportunityOutcomeFunnel(workspaceId)`** (`lib/opportunities/queries.ts`) --
four flat, workspace-scoped queries (`opportunities`, `prospects`, `contacts`,
`conversations`) run in parallel and correlated in application code via `Map`/`Set`
lookups, rather than an N+1 per-opportunity lookup (`listContacts`/`listConversations`
are both per-prospect today) or a multi-level PostgREST embed (no existing precedent in
this codebase for embedding `prospects` from `opportunities`, and no evidence the
relationship is even named for embedding). The same "separate flat queries, joined in
memory" shape `listProspects`' own pipeline join already uses, just doing the join by
hand instead of via PostgREST's embed syntax. No new migration -- every column read here
already exists. DB-composing, not pure -- no unit test of its own, matching this run's
own established precedent (`applyIncrementalSignalUpdate`, DISC-OFFER-P1-01.2, and
others).

**UI**: added to `OfferingOverviewSummary` as a new "Discovery effectiveness" card
(same treatment as P1-03.1/P1-03.2's own cards), placed last -- after Buyer personas --
since it summarizes the offering's *results*, the natural final word after everything
else on the page describes its *setup*. Renders only when `outcomeFunnel.totalOpportunities
> 0` -- the same "empty means don't render" restraint P1-03.2's own callout already
applies: a fresh offering with zero opportunities has nothing yet to measure, so showing
a "0% win rate" card would misreport "not yet started" as "failing." Shows opportunity
count, conversations, sent-to-CRM count, and won count as a four-up stat row, with the
win rate in the card's own header -- deliberately not every field `outcome-funnel.ts`
computes (`withContact`/`lost`/`open` are omitted from the card, though the type carries
them for a future story to use): the doc's own worked example is a single-sentence goal,
not a mockup, so this is a flagged scope call rather than something the doc itself
specified, kept to the smallest set that actually answers "is Discovery producing useful
opportunities" at a glance.

**Wiring**: `apps/web/.../products/[productId]/page.tsx` fetches `getOpportunityOutcomeFunnel`
alongside the other Overview data, gated on the exact same `product.product_profile`
condition as `icp`/`personas`/`prospectCounts` -- an offering with no profile yet has no
opportunities either, so there is nothing this query could return worth an extra
round trip.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1189 files, no
violations), `lint:migrations` (137 migrations, no violations -- no schema change), `npx
vitest run --root packages/module-discovery` (237/237, +5 new), and a clean `next build`
(confirmed the offering Overview route, which now fetches and renders the new card,
still builds with no errors). No live migration/advisors step this story -- no schema
change. Same live-browser-walkthrough constraint noted in every prior UI-touching story
this run (no seeded demo user/`.env.local` in this environment); particularly relevant
here since a genuine non-empty funnel needs real opportunities with contacts,
conversations, a CRM handoff, and a won/lost outcome all present to see the full card
populated, which this environment cannot produce a live signed-in walkthrough of.

**Status**: 49 of 68 in-scope stories done -- Phase F continuing. Next: P1-05.1, Offering
Pipeline Workspace.

### P1-05.1 — Offering Pipeline Workspace (2026-09-13)

The doc's own desktop mockup: an offering header with `[Edit]`, "AI Discovery", a
one-line checklist (`✓ Website  ✓ ICP  ✓ Buyers  ● Signals  ○ Research`), a "Current
Stage" box with two example stat lines ("18 relevant signals found" / "6
high-confidence correlations") and three actions (`[Review Stage] [Edit] [Run From
Here]`), and the main `[Run AI Discovery]` button. The doc's own explicit tolerance:
"The exact visual implementation may differ, but the hierarchy must remain clear."

**Checked what already existed before building anything**: `RunAiDiscoveryPanel`
(DISC-OFFER-P0-10.1/10.3) already renders the "AI Discovery" heading, the main Run/Resume
button, and a vertical per-group checklist with ✓/●/○-equivalent icons (DISC-OFFER-
P1-02.1 later added ⚠/? for review states) -- a different visual arrangement from the
doc's own one-line horizontal checklist, but the doc's own explicit tolerance for that
covers it; not rebuilt. Each row already expands (DISC-OFFER-P0-10.3's "users can inspect
completed stages") to show its own technical stages' status plus a "View X →" link
(`GROUP_DESTINATION`). What was genuinely missing: the doc's own "Current Stage" box as a
distinct, always-visible-when-relevant element (today a founder must click a row open to
see anything about it), and real per-stage detail text visible without expanding.

**Found the real stat-line data already exists, just discarded**: every stage handler in
`handlers.ts` already returns a human-readable `StageOutcome.detail` (e.g. "Signals
collected for 4 of 5 account(s).", "6 of 8 opportunity(ies) correlated.") -- exactly the
doc's own "18 relevant signals found" shape -- but `run-ai-discovery-panel.tsx` previously
read only `result.stage` off each POST response and threw `result.detail` away; neither
`pipeline_stages` nor `pipeline_stage_runs` persists it (confirmed by re-reading both
tables' own type definitions), by design -- it's a narration of one attempt, not state
worth a new column. Kept in new client-side state (`stageDetails`, keyed by technical
stage) instead of adding a column for a value nothing else needs (CLAUDE.md dev principle
#7) -- honestly scoped to "populated only for stages this browser session actually ran,"
flagged rather than pretending it survives a reload.

**New "Current Stage" card** (`run-ai-discovery-panel.tsx`): renders only when
`hasStarted` is true and `computeDisplayGroups` reports a `"current"` group (at most one
at a time, mirroring the doc's own single "●" line; nothing renders once every group is
`completed`, or before a founder's first click -- showing "Current Stage: Website
Understanding" before anything has run would just duplicate the checklist's own first
line, not add information). Shows the current group's label, its `activeStageKey`'s own
captured `detail` text when this session has one, and two of the doc's own three actions:
**Review Stage** (toggles the same expand state a row-click already does -- reused, not
duplicated) and **Edit** (the same `GROUP_DESTINATION` link the expanded view already
shows, hidden when a group has none, e.g. `website_understanding`/`offering_profile`).

**Deliberately did NOT add "[Run From Here]" to this card**: `computeDisplayGroups`
defines "current" as the first not-yet-done group -- the exact same index
`firstIncompleteIndex`/`runFrom(undefined, ...)` already resumes from via the "Run AI
Discovery"/"Resume AI Discovery" button in this same panel's own header. A second button
here would trigger the identical action, reading as two controls for one thing rather
than one clear entry point -- the same call DISC-OFFER-P1-01.1 already made for its own
`RediscoverySchedule` widget's own would-be second "Run Now" button. Flagged as a scope
call, not an omission; a genuinely distinct "run from an arbitrary, non-current stage"
control is a different capability (closer to DISC-OFFER-P0-11.2's own "Save & Run
Downstream", already wired from the ICP page) than what this specific box needs.

No migration, no new pure domain logic (a client-state/presentation change over
already-existing `computeDisplayGroups`/`GROUP_DESTINATION`, matching this run's own "no
unit test for a UI-wiring change" precedent -- the only new "logic" is which existing
values to read, not a computation).

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1189 files, no
violations), `lint:migrations` (137 migrations, no violations -- no schema change), `npx
vitest run --root packages/module-discovery` (237/237, unchanged -- no new pure logic per
the note above), and a clean `next build` (confirmed the offering Overview route, which
now renders the new Current Stage card, still builds with no errors). Same
live-browser-walkthrough constraint noted in every prior UI-touching story this run (no
seeded demo user/`.env.local` in this environment) -- particularly relevant here since
this story's own real effect (the Current Stage box appearing mid-run with a live detail
line) only shows up while a pipeline run is actually in progress in a real browser.

**Status**: 50 of 68 in-scope stories done -- Phase F continuing. Next: P1-05.2, Desktop
Stage Tables.

### P1-05.2 — Desktop Stage Tables (2026-09-13)

The doc's own literal ask: "Use table/proto-table presentation for multi-record outputs,"
with three named column sets (Opportunities: Company/Score/Why Now/Contact/Confidence/
Action; Signals: Signal/Source/Date/Relevance/Confidence/Action; Buyers: Person/Role/Fit/
Evidence/Confidence/Action) and "Use stacked cards/progressive disclosure on mobile."

**Checked what already existed for each of the three before building anything**:
Opportunities already had exactly this desktop-table/mobile-card split
(`OpportunitiesDashboard`, DISC-OFFER-P0-07.2) -- missing only the doc's own
"Confidence" column (`opportunity.confidence`, already a real field, just not shown in
this listing). Signals were a plain `<ul>` bullet list on the Opportunity Detail page
(no table at all, desktop or mobile). Buyers ("Buyer intelligence") were a card-per-
person `<ul>` on the Prospect Detail page -- already card-shaped in a way that already
satisfies "stacked cards... on mobile," but with no desktop table alternative either.

**Opportunities**: added a `ConfidenceCell` (`opportunities-dashboard.tsx`) to both the
mobile card and desktop table, reusing `opportunity.confidence` (already computed,
DISC-OFFER-P0-05.2) -- the doc's own column set is now fully covered without touching the
useful extra columns already there (Priority/Offering fit/Top signal/Recommended action).

**Signals**: found a real data-shape gap before writing any UI -- a raw `Signal` row
(`lib/signals/types.ts`) has no `relevance`/`confidence` field of its own; only the
separate *correlated read* over several signals does (`SignalCorrelation.rationale`/
`.confidence`, DISC-OFFER-P0-05.3). Rather than inventing a per-signal value that doesn't
exist, new `SignalTable` (`components/opportunities/signal-table.tsx`) shows the
correlation's own rationale/confidence on exactly the signals that correlation's own
`signal_ids` actually covers, and "—" for any signal outside it (no false precision for
a signal this run's correlation never considered). Wired in via a new `signalCorrelation`
prop threaded through `OpportunityDetail` and fetched in the opportunity detail route via
the already-existing `getSignalCorrelation(opportunity.signal_correlation_id)` -- no new
query function, no migration.

**Buyers**: new `BuyerIntelligenceTable` (`components/prospects/buyer-intelligence-table.tsx`)
adds a real desktop table (Person/Role/Fit/Evidence/Confidence) alongside the existing
mobile card list, which was extracted into the same component essentially unchanged (same
markup, same fields) rather than rewritten -- "Contactability" (a field the old inline
card also showed) is deliberately not one of the doc's own five named Buyers columns, so
it's dropped from both the new table and the ported mobile card, matching the doc's own
literal column set rather than carrying over everything the old view happened to show.
Wired into the Prospect Detail page in place of the ~50-line inline block that used to
live there directly.

**"Action" deliberately omitted from all three new/touched tables' own column set**, for
two different, both-genuine reasons: Opportunities already has a real per-row action
today (`RecommendedActionCell`, and the whole row already links to the opportunity's own
detail page) -- nothing new needed there. Signals and Buyers have no per-row action
anywhere in this module yet -- a raw signal is an immutable fact, and no contact-editing
affordance exists on the prospect page today -- so adding an "Action" column to either
would mean either a fake button that does nothing or inventing a mutation this story
never asked for (CLAUDE.md dev principle #7). Flagged explicitly rather than silently
dropped: DISC-OFFER-P1-05.3 ("Editable Stage Rows") is next, but its own doc text
("Company | Score | Signal | Contact | [Edit] [•••]", menu: Edit/Research Again/Exclude/
Watch/Send to CRM) is itself scoped to an *opportunity* row's own actions, not a signal's
or a buyer's -- so this gap doesn't get filled by the very next story either; it's a
genuine, standing scope boundary of this module today, not a placeholder.

No migration, no new pure domain logic -- `correlatedFieldsFor` (`signal-table.tsx`) is a
plain lookup (`Array.includes`), not a computation worth its own unit test, matching this
run's own "no unit test for a UI-wiring function" precedent; every genuinely new judgment
call in this story (which correlation values apply to which signal rows) is exercised for
real by the type system and by reading the code, not hidden logic that could silently
drift.

Verified with full monorepo typecheck (clean across all 9 workspaces), `npm run lint` (0
errors, 1 pre-existing unrelated warning, unchanged), `lint:boundaries` (1191 files, no
violations), `lint:migrations` (137 migrations, no violations -- no schema change), `npx
vitest run --root packages/module-discovery` (237/237, unchanged -- no new pure logic per
the note above), and a clean `next build` (confirmed the opportunities list, opportunity
detail, and prospect detail routes -- all three touched -- still build with no errors).
Same live-browser-walkthrough constraint noted in every prior UI-touching story this run
(no seeded demo user/`.env.local` in this environment) -- particularly relevant here since
verifying the actual desktop-table-vs-mobile-card breakpoint behavior visually is exactly
what a real browser at different widths would show most directly.

**Status**: 51 of 68 in-scope stories done -- Phase F continuing. Next: P1-05.3, Editable
Stage Rows.
