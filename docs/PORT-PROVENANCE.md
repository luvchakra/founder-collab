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

Mechanical changes applied on port (paths/wrapper only, no logic changes): added a
`"use client"` directive to every file (StockPilot is a Vite SPA and doesn't need one;
Next.js App Router does), and rewrote each file's internal `@/lib/utils`,
`@/hooks/use-mobile` and `@/components/ui/*` imports to relative paths matching this
package's own `src/` layout. Removed one line from `styles.css` (`@source "../src"`) that
pointed at a path meaningful only in StockPilot's own repo layout; `apps/web/app/globals.css`
declares the platform's own `@source` globs instead.

| `packages/module-discovery/src/lib/{ai,prospects,contacts,outreach,messages,icp,research,scoring}/*.ts` (8 files) | co-founder-ai | `lib/ai/schemas.ts`, `lib/{prospects,contacts,outreach,messages,icp,research,scoring}/types.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (partial) |
| `packages/module-discovery/src/prompts/**/*.ts` (9 files) | co-founder-ai | `prompts/**/*.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (partial) |

Copied verbatim (pure Zod schemas / plain TS types / prompt-builder functions — no
Supabase, no framework coupling), only rewriting each file's `@/lib/...` imports to
relative paths. This is a deliberately small, fully self-contained, DB-independent first
slice of `P-5` (`04-CLAUDE-CODE-BACKLOG.md`): the target Supabase project isn't reachable
from this session (see the network note above), so anything requiring live-DB
verification — `lib/supabase/*`, `lib/tenancy/*`, the `discovery` schema migrations, the
dashboard routes, and every other `lib/<domain>` directory that queries Supabase — is
deferred to a session with real connectivity, story by story, each recorded here as it
lands. `packages/module-inventory` doesn't exist yet (story `SP-7`).
