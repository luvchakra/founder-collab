# Handover to Claude Code — read this file first

**Status:** all decisions signed off by the product owner on 2026-09-06. This package is the complete brief for a brand-new Claude Code session working in a brand-new, empty GitHub repository against a blank Supabase project. Nothing has been built yet. `P-0` is the first action.

---

## 1. What you have access to, and what to do with it

You have GitHub access to **all** repositories and Supabase MCP access to **all** projects in this organization, including the two below. That access is for **reading**, in this programme, and nothing else.

| System | Identifier | Role | Access rule |
|---|---|---|---|
| Repo — CoFounderAI (source) | `github.com/luvchakra/co-founder-ai` | Source of the `discovery` module | **Read-only.** Never push, never open a PR, never modify. |
| Repo — StockPilot (source) | `github.com/luvchakra/stockpilot-ai-ops` | Source of the `inventory` module (+ GST scaffolding) | **Read-only.** Same rule. |
| Repo — Platform (target) | *to be created this session*, e.g. `cofounderai-platform` | Everything you build | Your working repo. |
| Supabase — co-founder-ai (source) | project ref `xepqdxhakfvsxjbtqjzn` | Live schema reference for `discovery` | **Read-only.** `list_tables`/`execute_sql` for inspection only — never `apply_migration`, never write. |
| Supabase — stockpilot-ai-ops (source) | project ref `atdmyqahetqkbnrszega` | Live schema reference for `inventory` | **Read-only.** Same rule. |
| Supabase — Platform (target) | *to be created this session*, region **`ap-south-1`** | Everything you build | Your working database. |

**"Live to live" instruction:** don't treat the documents in this package as a frozen spec to transcribe. They describe the destination architecture and the decisions that are locked. For the exact current shape of source code and source schema — file contents, column lists, trigger bodies, RLS policies — **re-read the live repos and re-query the live Supabase projects directly** before porting each piece. The audit in `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` was accurate as of 2026-09-06; treat it as a map, not as ground truth if it and the live source ever disagree — the live source wins, and if a material discrepancy shows up, flag it rather than silently reconciling.

**No data migrates.** Every row in both source projects is demo/seed data (confirmed by the product owner). Do not port any data, do not write a data-migration script, do not build `auth.users` mapping. Build schema and code only; the platform starts empty and real users onboard fresh.

---

## 2. Reading order

1. **This file.**
2. `01-ADR-DECISIONS.md` — 13 architecture decisions, all signed off. This is your constitution; it supersedes anything in the two source repos' own `CLAUDE.md`/blueprint files where they conflict (they were written for a different, single-module architecture).
3. `00-MASTER-PLAN.md` — tenancy model, schema layout, the entity-ownership map (the anti-duplication contract), module architecture, licensing model.
4. `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` — the StockPilot source audit and why the port is ~85% mechanical. Read this before touching any StockPilot file.
5. `06-DECISIONS-LOCKED.md` — the three final calls (no data migration, full Next.js port, `ap-south-1`) and exactly how they trim the backlog.
6. `02-FSM-PRD.md` — the field-service module spec, built from Kickserv's own documentation.
7. `03-STOCKPILOT-MIGRATION.md` — still the entity-merge design (§1–2, the ownership resolutions); its §4 execution sequence is superseded by `06`'s trimmed version.
8. `04-CLAUDE-CODE-BACKLOG.md` — the epic/story backlog. **Read `06-DECISIONS-LOCKED.md`'s "Consequences for the backlog" section first and apply it**: Epic 4 no longer contains `SP-1`, `SP-5`, `SP-6`; `SP-3` splits into `SP-3a`/`SP-3b`; `SP-7` is now XL.

Files 00–04 were written before the audit and the greenfield/no-data decisions; each carries a banner pointing back here. Where a numbered doc and a later one (05 or 06) disagree, **the later document wins.**

---

## 3. Non-negotiables carried into every story

From `01-ADR-DECISIONS.md`, restated because they're easy to erode one story at a time:
- Every module-owned table lives in its own Postgres schema (`core`, `discovery`, `inventory`, `fsm`, `crm`, `gst`). Cross-schema FKs point only into `core`.
- Every table's RLS policy is `tenant AND licensed` (ADR-4, ADR-8). No table skips the license check, including during early development when everything is "obviously" licensed — write the check now, not later.
- No module may import another module's internals. Only `@cofounderai/core` and other modules' `contract/index.ts`. This is CI-enforced (`P-4`), not a convention.
- Cancelling a license never deletes data (ADR-9).
- Before creating any table, check the entity-ownership map in `00-MASTER-PLAN.md` §5. If the concept is already listed, use the canonical table — do not create a parallel one.

---

## 4. First action

Execute **`P-0`** only, per `06-DECISIONS-LOCKED.md`'s final paragraph:

1. Create the new GitHub repository.
2. Create the new Supabase project in `ap-south-1`.
3. Scaffold npm workspaces: `apps/web` (Next.js 16), `packages/core`, `packages/module-registry`.
4. Vendor the full shadcn/ui set into `packages/core/ui` (sourced by reading the live `stockpilot-ai-ops` repo's `src/components/ui/*` — it has the complete set already; `co-founder-ai` only has 2 primitives).
5. Set up `@supabase/ssr` clients in `packages/core/db` pointed at the new project.
6. Wire eslint import-boundary rules + a migration-schema lint + CI (typecheck, lint, test).
7. Write `CLAUDE.md` for the new repo fresh, derived from `01-ADR-DECISIONS.md` — do not copy either source repo's `CLAUDE.md` verbatim, since both encode single-module rules (e.g. co-founder-ai's §41 non-goals explicitly ban the event-bus pattern ADR-5 requires).
8. Create `docs/plan/` in the new repo and commit all documents in this package into it, plus `docs/PORT-PROVENANCE.md` (empty, to be filled in as each piece is ported — record the exact source commit SHA per ported directory).
9. Record both new identifiers (repo URL, Supabase project ref) at the top of `docs/PORT-PROVENANCE.md`.

Stop after `P-0`. Report the new repo URL and Supabase project ref back before starting Epic 1.

---

## 5. Everything after `P-0`

Follow `04-CLAUDE-CODE-BACKLOG.md` in order, Epic 1 → 2 → 3 → 4 → 5 → 6, applying `06-DECISIONS-LOCKED.md`'s trims to Epic 4. One story at a time; each story's definition of done (backlog doc, final section) applies without exception, including the tenant-isolation and license-gating tests.
