# cofounderai-platform

One portal, one account, one login, five independently licensed modules: `discovery`
(customer acquisition — ported from `co-founder-ai`), `inventory` (ported from
`stockpilot-ai-ops`), `fsm` (field service, built fresh), `crm` and `gst` (skeletons for
now). Full context lives in `docs/plan/` — read only the document(s) relevant to the
story at hand, not the whole set. Start with `docs/plan/07-HANDOVER-README.md` if you're
unsure what any of the others are for.

This file is derived from `docs/plan/01-ADR-DECISIONS.md` (all 13 ADRs signed off
2026-09-06) and supersedes the architecture rules in `co-founder-ai`'s and
`stockpilot-ai-ops`'s own `CLAUDE.md` files, which were written for single-module apps and
conflict with this one in places (e.g. co-founder-ai's non-goals list bans the event-bus
pattern ADR-5 requires here).

## Non-negotiables (do not erode these one story at a time)

1. Every module-owned table lives in its own Postgres schema (`core`, `discovery`,
   `inventory`, `fsm`, `crm`, `gst`). Cross-schema foreign keys point only into `core`.
2. Every table's RLS policy is `tenant AND licensed` (ADR-4, ADR-8) — including during
   early development when everything is "obviously" licensed. Write the check now.
3. No module may import another module's internals. Only `@cofounderai/core` and other
   modules' `contract/index.ts`. This is CI-enforced (`npm run lint:boundaries`), not a
   convention — see `scripts/lint-import-boundaries.mjs`.
4. Cancelling a license never deletes data (ADR-9): 30-day read-only grace, then access
   denied but rows retained; reactivation restores everything and replays parked events.
5. Before creating any table, check the entity-ownership map in
   `docs/plan/00-MASTER-PLAN.md` §5. If the concept is already listed, use the canonical
   table — do not create a parallel one.
6. No hard dependencies between modules (ADR-10). Every cross-module feature has a
   documented degraded mode; a contract call may return `MODULE_NOT_LICENSED` and callers
   must treat that as a normal result, not an exception.
7. **CoFounderAI's own UI/UX design takes precedence over any vendored default.**
   `packages/core/src/components/ui/*` gives us shadcn *structure* (StockPilot's fuller
   set, per `P-0`) — it does not give us StockPilot's colors, and it does not give us
   `co-founder-ai`'s own colors either where they conflict with the platform's actual
   design reference. The shell (sidebar, topbar, avatar, business switcher) matches the
   reference mockup recorded in `docs/DESIGN.md`: light theme by default, blue primary
   accent, white cards on a soft gray-blue background — not StockPilot's teal/amber
   vendored theme, not `co-founder-ai`'s current dark-violet one. Every module's screens
   share this one design system; a module never brings its own look.

## Architecture (locked — do not change without explicit user approval)

- **Monorepo, npm workspaces**: `apps/web` (thin Next.js 16 App Router host) +
  `packages/core` + `packages/module-{discovery,fsm,inventory,crm,gst}` (created as their
  stories start) + `packages/module-registry`. One Vercel deployment, one Supabase
  project — modules are packages, not services (ADR-1, ADR-2).
- **Tenancy**: `business_id` is the operational tenant for `fsm`, `inventory`, `crm`,
  `gst`. `workspace_id` stays the tenant for `discovery` only (ADR-4) — a business has one
  inventory, one GSTIN, one crew, one customer ledger, regardless of how many products
  (workspaces) it markets.
- **`core` Postgres schema** owns everything cross-module: tenancy, identity, licensing,
  RBAC, parties, items, documents, payments, numbering, tags, custom fields, attachments,
  messaging, domain events, background jobs, audit log, AI runs (ADR-3, ADR-6, ADR-7).
  `core.parties` + `core.party_roles` replace prospect/customer/supplier as separate
  concepts — one row, many roles.
- **Cross-module communication**, three legal mechanisms, ranked: (1) read shared data
  from `core` directly — no coupling; (2) call another module's `contract/index.ts`
  function synchronously when you need an answer now; (3) publish a row to
  `core.domain_events`, drained by the existing DB-backed job pattern, when you don't
  (ADR-5). No Redis, no broker, no Kafka — a table plus a cron is not an event bus for the
  purposes of any non-goals list that says otherwise.
- **Licensing**: `core.modules` / `core.licenses` / `core.license_events`. Enforcement is
  four layers, all four required: RLS (`tenant AND licensed`, authoritative), route guard
  in `proxy.ts` (404 unlicensed routes, don't advertise), `requireModule()` in server
  actions (defense in depth), and UI built from `module-registry` filtered by entitlements.
- **StockPilot is ported to Next.js in full** (ADR-13) — no separate TanStack Start
  deployment. Compatibility views with `INSTEAD OF` triggers let the ported code keep
  querying `products`/`customers`/`sales_orders` by their original names while `core` owns
  the canonical data (ADR-11).
- **UI**: Tailwind 4 + the full shadcn/ui set vendored into `packages/core/ui` (sourced
  from `stockpilot-ai-ops`, which has the complete set — a strict upgrade over
  `co-founder-ai`'s 2 hand-vendored primitives). New components are hand-added, not
  fetched via `npx shadcn add` (same egress restriction as both source repos).
- **AI**: unchanged from `co-founder-ai`'s pattern once `discovery` is ported — one
  provider, called only through a `lib/ai`-equivalent inside `packages/core` or
  `module-discovery`, never directly from routes or components.

## Development principles

1. Prefer the simplest implementation that works.
2. Do not introduce a new dependency unless necessary.
3. Do not create a service when a package/module will suffice.
4. Do not use an LLM for deterministic operations.
5. Minimize LLM calls; cache all repeatable AI operations (`ai_runs`, keyed by
   `input_hash` + `prompt_version`).
6. Prefer structured JSON AI responses, validated with Zod.
7. Never implement speculative functionality — build only what the current story requires.
8. Every workspace/business-scoped table needs RLS resolved server-side — never
   frontend-only filtering, never a client-supplied tenant id trusted without
   server-side authorization.
9. Every feature has tests; tenant-isolation tests are mandatory for anything touching
   workspace- or business-scoped data, license-gating tests for anything touching a
   licensed module's tables.
10. Do not refactor unrelated code. Do not modify architecture without explicit user
    approval (the ADRs in `docs/plan/01-ADR-DECISIONS.md` are the current approved set).
11. Development must use Supabase MCP (or the project's own credentials) against the
    **dev** project only — never production.
12. Any page whose primary content is a table of rows must switch to compact cards (one
    card per row, key attributes as labeled chips/fields) below the `md` breakpoint —
    never a horizontally-scrolling or truncated table on a small screen. This applies
    platform-wide, to every module, not just the ones a given story touches.

## Repository structure

```
apps/web/                          Next.js 16 App Router host — thin, routes + pages only
  app/(dashboard)/[businessSlug]/  per-module route groups, re-exporting from packages
  proxy.ts                         session + business resolution + license gate (Epic 2)
packages/core/
  src/db/                          @supabase/ssr clients: client.ts, server.ts, admin.ts
  src/components/ui/               vendored shadcn primitives
  src/lib/, src/hooks/             framework-agnostic helpers the ui components need
  src/ui-theme.css                 Tailwind 4 theme (colors, radii) — imported by apps/web
packages/module-registry/          static manifest of licensable modules; nav/routes are
                                    built from this, never hardcoded (populated in P-3)
packages/module-<key>/             one per licensed module, created as its epic starts
  src/contract/index.ts            the ONLY thing other modules may import from this one
  src/routes/ src/domain/ src/db/ src/events/ src/manifest.ts
supabase/migrations/               ONE ordered migration timeline for the whole platform
scripts/                           lint-import-boundaries.mjs, lint-migration-schema.mjs
docs/plan/                         the planning package this repo was built from
docs/PORT-PROVENANCE.md            source commit SHA per ported directory
```

Directories are created as stories require them — don't pre-create empty module packages.

## Workflow

One story at a time, per `docs/plan/04-CLAUDE-CODE-BACKLOG.md` (apply
`docs/plan/06-DECISIONS-LOCKED.md`'s trims to Epic 4 first). Before starting a story: read
only the files it touches, plus the entity-ownership map if the story creates any table.
After finishing: typecheck, lint, `lint:boundaries`, `lint:migrations`, and tests all
green; focused commit; tenant isolation and license gating preserved; no unapproved
dependencies or architecture changes; if the story revealed the plan was wrong, update the
plan doc in the same commit.

**Live source of truth, not frozen spec**: `docs/plan/` describes the destination and the
decisions that are locked, not the exact current shape of `co-founder-ai` or
`stockpilot-ai-ops`. Before porting any piece, re-read the live source repo / re-query its
live Supabase project — those two repos and their Supabase projects (`xepqdxhakfvsxjbtqjzn`,
`atdmyqahetqkbnrszega`) are **read-only reference material**: never push to them, never
write to their databases. If the plan and the live source disagree, the live source wins —
flag the discrepancy rather than silently reconciling.

**No data migration** (confirmed 2026-09-06): all data in both source projects is demo
data. The platform starts empty; users onboard fresh. Do not write a data-migration
script, do not build `auth.users` mapping.

## Environment

- `.env.local` under `apps/web/` (gitignored) holds real dev Supabase keys — never commit
  it, never log its contents, never put secrets in code comments or commit messages.
- `apps/web/.env.example` documents required variable names with placeholder values only.
