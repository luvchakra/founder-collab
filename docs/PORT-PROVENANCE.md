# Port provenance

Tracks the exact source commit SHA behind every directory ported from `co-founder-ai` or
`stockpilot-ai-ops`, so "did this upstream fix make it across?" is always answerable
(`docs/plan/05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` §B.7).

## Platform identifiers

| System | Identifier |
|---|---|
| GitHub repo | `github.com/luvchakra/founder-collab` (this repo — the `cofounderai-platform` target from `docs/plan/07-HANDOVER-README.md`) |
| Supabase project | `jazdtomcgqjxjueedmck` (`https://jazdtomcgqjxjueedmck.supabase.co`) — **region not independently confirmed this session** (see note below); intended region per `docs/plan/06-DECISIONS-LOCKED.md` is `ap-south-1` |

> **Network note (2026-09-06):** this session's egress policy blocks direct access to
> `jazdtomcgqjxjueedmck.supabase.co` (both the Postgres port and the HTTPS REST endpoint
> returned a 403 from the environment's egress proxy — a policy denial, not a transient
> failure), and the project does not appear in this session's Supabase MCP project list
> (which only lists 5 projects, none matching this ref). P-0 has no schema/migration work,
> so this didn't block scaffolding, but no one has verified from this environment that the
> project is reachable, is in `ap-south-1`, or is otherwise correctly provisioned. Verify
> connectivity and region before Epic 2 (the first epic to touch this database).

## Source repositories (read-only reference material — never push to these)

| Repo | Role | Commit SHA at P-0 |
|---|---|---|
| `github.com/luvchakra/co-founder-ai` | Source of the `discovery` module | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` |
| `github.com/luvchakra/stockpilot-ai-ops` | Source of the `inventory` module (+ GST scaffolding) | `9cee43a450994dd73e63f74992d060af4c123d65` |

Their Supabase projects (`xepqdxhakfvsxjbtqjzn` co-founder-ai, `atdmyqahetqkbnrszega`
stockpilot-ai-ops) are read-only reference material for the same reason — inspect via
`list_tables`/`execute_sql` only, never `apply_migration`, never write.

## Ported directories

| Platform path | Source repo | Source path | Source commit SHA | Story |
|---|---|---|---|---|
| `packages/core/src/components/ui/*.tsx` (46 files) | stockpilot-ai-ops | `src/components/ui/*.tsx` | `853608f76cb2bfe1bdf947cd587d4b80ab46593b` | P-0 |
| `packages/core/src/lib/utils.ts` | stockpilot-ai-ops | `src/lib/utils.ts` | `853608f76cb2bfe1bdf947cd587d4b80ab46593b` | P-0 |
| `packages/core/src/hooks/use-mobile.tsx` | stockpilot-ai-ops | `src/hooks/use-mobile.tsx` | `853608f76cb2bfe1bdf947cd587d4b80ab46593b` | P-0 |
| `packages/core/src/ui-theme.css` | stockpilot-ai-ops | `src/styles.css` | `853608f76cb2bfe1bdf947cd587d4b80ab46593b` | P-0 |
| `packages/core/src/crypto/api-key.ts` | co-founder-ai | `lib/crypto/api-key.ts` | `71cf20b0d548e3abd2c12f649126136405fec01a` | P-2 |
| `packages/core/src/ai/{model-registry,operation-registry,provider-factory,client,hash}.ts` | co-founder-ai | `lib/ai/{model-registry,operation-registry,provider-factory,client,hash}.ts` | `ae844087ed0cd9b0cc411125427296400d6b4398` | P-2 |
| `packages/core/src/ai-providers/{is-provider-failure,types,test-connection}.ts` | co-founder-ai | `lib/ai-providers/{is-provider-failure,types,test-connection}.ts` | `ae844087ed0cd9b0cc411125427296400d6b4398` | P-2 |
| `packages/module-discovery/src/lib/{ai,prospects,contacts,outreach,messages,icp,research,scoring}/*.ts` (8 files) | co-founder-ai | `lib/ai/schemas.ts`, `lib/{prospects,contacts,outreach,messages,icp,research,scoring}/types.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (partial) |
| `packages/module-discovery/src/prompts/**/*.ts` (9 files) | co-founder-ai | `prompts/**/*.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (partial) |
| `packages/core/src/lib/url.ts` | co-founder-ai | `lib/url.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-2 |
| `packages/core/src/actions/ai-action-state.ts` | co-founder-ai | `lib/actions/ai-action-state.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-2 |
| `packages/core/src/email/render.ts` | co-founder-ai | `lib/email/render.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-2 |
| `packages/core/src/site.ts` | co-founder-ai | `lib/site.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-2 (adapted) |
| `packages/module-discovery/src/lib/{conversations,knowledge,usage,tenancy,interest}/types.ts`, `lib/interest/notify.ts`, `lib/prospects/pipeline.ts` | co-founder-ai | same paths | `0b30fa168a0f929d37822fb098bbb3ce19e7713f` | P-5 (partial) |

Notes on the mechanical changes applied per row (paths/wrapper only, no logic changes):

- **stockpilot-ai-ops rows (`P-0`):** added a `"use client"` directive to every file
  (StockPilot is a Vite SPA and doesn't need one; Next.js App Router does), and rewrote
  each file's internal `@/lib/utils`, `@/hooks/use-mobile` and `@/components/ui/*`
  imports to relative paths matching this package's own `src/` layout. Removed one line
  from `styles.css` (`@source "../src"`) that pointed at a path meaningful only in
  StockPilot's own repo layout; `apps/web/app/globals.css` declares the platform's own
  `@source` globs instead.
- **`lib/crypto/api-key.ts` (`P-2`):** copied verbatim, no import changes needed (only
  depends on `node:crypto`). Added a full round-trip + failure-mode test suite in
  `packages/core/src/crypto/api-key.test.ts` (none existed upstream).
- **BYOK AI provider layer (`P-2`):** the model registry, per-operation quality-tier
  routing, the Vercel AI SDK provider factory (+ per-provider web-search tool builders),
  cost estimation, deterministic input hashing, and the provider-connection-test /
  error-classification helpers — copied verbatim per `00-MASTER-PLAN.md` §6 ("`ai/` moved
  from `lib/ai` — shared by every module"), only rewriting the two `@/lib/ai/model-registry`
  imports in `lib/ai-providers/*` to relative paths. Deliberately excludes everything in
  `lib/ai/` and `lib/ai-providers/` that queries Supabase (`router.ts`, `usage.ts`, the
  `understand-product.ts`/`generate-icp.ts`/etc. operation implementations, `queries.ts`,
  `mutations.ts`) — those need the `discovery`/`core` schema and land with the rest of
  `P-5`. Added test suites for every pure function (none existed upstream): model
  resolution, operation spec lookup, cost estimation, input hashing, and the
  provider-failure regex.
- **`module-discovery` prompts + types (`P-5`, partial):** copied verbatim (pure Zod
  schemas / plain TS types / prompt-builder functions — no Supabase, no framework
  coupling), only rewriting each file's `@/lib/...` imports to relative paths. A
  deliberately small, fully self-contained, DB-independent first slice of `P-5`
  (`04-CLAUDE-CODE-BACKLOG.md`): the target Supabase project isn't reachable from this
  session (see the network note above), so anything requiring live-DB verification —
  `lib/supabase/*`, `lib/tenancy/*`, the `discovery` schema migrations, the dashboard
  routes, and every other `lib/<domain>` directory that queries Supabase — is deferred to
  a session with real connectivity, story by story, each recorded here as it lands.
- **`lib/url.ts`, `lib/actions/ai-action-state.ts`, `lib/email/render.ts` (`P-2`):**
  copied verbatim into `packages/core` — pure string/regex logic and a Next.js
  server-action error-boundary helper, no Supabase.
- **`lib/site.ts` (`P-2`, adapted, not verbatim):** the `SITE_URL` fallback pointed at
  `co-founder-ai`'s own specific Vercel deployment URL, which is wrong for this platform
  — changed the fallback to `http://localhost:3000`, otherwise unchanged.
- **Second `module-discovery` batch — `conversations`/`knowledge`/`usage`/`tenancy`/
  `interest` types, `interest/notify.ts`, `prospects/pipeline.ts` (`P-5`, partial):**
  copied verbatim, only rewriting `@/lib/...` imports to relative paths.
  `prospects/pipeline.ts`'s `deriveProspectPipelineState`/`computeConversionFunnel` are
  real pure business logic (not just types) — added a full test suite (none existed
  upstream). `tenancy/types.ts`'s `Account`/`Business`/`Product`/`Workspace` types are
  parked here matching their current source location; Epic 2's `C-1` is what actually
  moves/merges these into `core`'s canonical tenancy tables — don't treat their presence
  in `module-discovery` as the final home.
- **`packages/core/src/ui-theme.css` (re-themed, not verbatim — see `docs/DESIGN.md`):**
  `P-0` vendored StockPilot's teal/amber color values verbatim; per `CLAUDE.md`
  non-negotiable #7 (added this session) those values are replaced with the platform's
  own light/blue palette from the reference mockup in `docs/design/reference-mockup.png`.
  StockPilot's *structure* is kept (the `@theme inline` token-mapping mechanism, the
  sidebar/chart token slots the vendored components need, the print/label utilities,
  which are brand-neutral mechanism) — only the actual color values and the
  StockPilot-specific `signal`/`warn`/`surface`/gradient/glow tokens (unused by anything
  ported so far) were dropped. Fonts switched from StockPilot's Space Grotesk/DM Sans to
  Geist Sans/Mono, matching `co-founder-ai`'s own choice (`apps/web/app/layout.tsx`).
- **`packages/core/src/components/shell/*` (new, not a port):** `AppSidebar`/`AppTopbar`/
  `DashboardShell` are new components built directly against the reference mockup — no
  upstream source in either `co-founder-ai` or `stockpilot-ai-ops` has this design.

`packages/module-inventory` doesn't exist yet (story `SP-7`).
