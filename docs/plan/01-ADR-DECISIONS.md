# Architecture decisions requiring approval

> **Revision 1.1 — read `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` first.** The StockPilot audit is complete and the programme is now greenfield (new repo + new Supabase project); Part C of that document lists the corrections to this file.

These change rules currently written in `CLAUDE.md` and `docs/engineering-blueprint.md`. `CLAUDE.md` rule 14 says architecture doesn't change without your explicit approval, so this file exists to be approved or rejected decision by decision. **Claude Code must not start Epic 1 until this is signed off.**

---

**ADR-1 — Monorepo with module packages.** The repo becomes npm workspaces: `apps/web` (thin Next.js host) + `packages/core` + `packages/module-{discovery,fsm,inventory,crm,gst}` + `packages/module-registry`.
*Why:* five independently licensed products can't share one undifferentiated `lib/` without the boundaries rotting within weeks.
*Cost:* one disruptive move of existing code (story `P-1`/`P-5`), slightly slower local builds.
*Rejected alternative:* five repos — kills the shared `core`, guarantees schema drift, and multiplies deployment work for no benefit at this size.

**ADR-2 — Still one deployment.** Modules are separate *packages*, not separate services. One Vercel app, one Supabase project.
*Why:* keeps blueprint §2's modular-monolith intent and avoids infra you'd have to run.
*Guarantee:* because coupling is limited to `core` + `/contract` + events, extracting a module into its own deployment later is a routing change, not a rewrite. Do not build for that day now.

**ADR-3 — `core` Postgres schema; one schema per module.** `core`, `inventory`, `fsm`, `crm`, `gst`; existing discovery tables stay in `public` for now.
*Why:* `public.products` (tenancy tier) vs StockPilot `products` (SKU) is an unavoidable collision, and schema ownership makes the "no duplicate entities" rule mechanically checkable.
*Cost:* Supabase exposed-schemas config; slightly more verbose queries.

**ADR-4 — `business_id` is the tenant for fsm, inventory, crm, gst. `workspace_id` stays the tenant for discovery.**
*Why:* a business has one inventory, one GSTIN, one crew, one customer ledger, regardless of how many products it markets. Workspace grain is right for ICPs, wrong for stock.
*Cost:* two tenancy helpers instead of one; the switcher becomes two-level.
*This is the decision most expensive to reverse later — please scrutinise it.*

**ADR-5 — Database-backed domain events (`core.domain_events`), drained by the existing job pattern.** Explicitly amends the "no event bus" non-goal in blueprint §41.
*Why:* mix-and-match licensing needs "publish now, maybe consumed later, replayed when a module is bought". Direct calls can't express that.
*Constraint:* it is a table plus a cron. No broker, no Redis, no Kafka — introducing any of those remains a non-goal.

**ADR-6 — Party model replaces prospect/customer/supplier duplication.** One `core.parties` row, many `core.party_roles`.
*Why:* it is the only way "a won prospect becomes an FSM customer" doesn't mean copying records between modules.
*Cost:* a backfill of the live discovery data (`D-3`) and compatibility views for StockPilot.

**ADR-7 — One `core.documents` table for estimate / sales order / invoice / credit note / debit note / proforma / purchase order / return.**
*Why:* three modules issue money documents; three invoice tables would make GST filing and reporting a permanent join-and-union exercise.
*Cost:* a wide table with a discriminator. Mitigated by check constraints, per-type partial indexes, per-type views and per-type Zod schemas.
*Revisit trigger:* if invoice queries need >2 type predicates to stay fast in P3, split invoices out.

**ADR-8 — License enforcement lives in RLS, not only in application code.** Every module table's policy is `tenant AND licensed`.
*Why:* a route guard is bypassable through any other code path; the database is the only place the rule can't be forgotten.
*Cost:* one extra `stable security definer` function call per policy — benchmarked in `C-9`.

**ADR-9 — Removing a license never deletes data.** Cancel → 30-day read-only grace → access denied but rows retained; reactivation restores everything and replays parked events.
*Why:* customers churn a module and come back; deleting their history makes that unrecoverable and makes the mix-and-match pitch a lie.
*This is a product decision as much as a technical one — confirm it.*

**ADR-10 — No hard dependencies between modules.** Every cross-module feature has a defined degraded mode; a contract call may always return `MODULE_NOT_LICENSED` and callers must treat that as normal, not exceptional.
*Why:* any hard dependency destroys mix-and-match, which is the commercial premise of the whole platform.

**ADR-11 — StockPilot is merged, not bolted on.** Its `organizations`/`customers`/`suppliers`/`products`/document tables merge into `core`; compatibility views preserve its exact table and column names so the ported code is near-unchanged.
*Why:* satisfies both "minimum code changes" and "no duplicity" — the two constraints only coexist through views.
*Risk:* joined views need `INSTEAD OF` triggers to stay writable; each view ships with a round-trip write test (`SP-4`).

**ADR-12 — FSM is built after the StockPilot merge.** FSM's estimates and invoices go straight onto the converged `core.documents`.
*Why:* building FSM billing first would mean building it twice.

**ADR-13 — StockPilot is ported to Next.js in full; no separate TanStack Start deployment.** Confirmed by source audit (`05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` §A): ~85% of its 125 files copy verbatim (all shadcn components, all framework-agnostic `lib/` logic, all page bodies); ~19 route files need a mechanical wrapper rewrite; ~10 files (Supabase client, auth, org context, 5 server-function actions) are genuine rewrites against `@cofounderai/core`.
*Why:* one toolchain, one design system, one auth session, one licensing/nav implementation, and it's what makes the FSM↔inventory integration (parts consumption, e-invoicing) tractable.
*Cost:* the single largest story in the backlog (`SP-7`, size XL).

---

### Sign-off

**Signed off by the user 2026-09-06. All 13 decisions approved as written, including ADR-13 and the greenfield/no-data-migration consequences recorded in `06-DECISIONS-LOCKED.md`.**

| ADR | Decision | Approved? | Notes |
|---|---|---|---|
| 1 | Monorepo + module packages | ✅ | |
| 2 | Single deployment | ✅ | |
| 3 | `core` + per-module schemas | ✅ | no legacy `public` to preserve — greenfield |
| 4 | `business_id` tenancy | ✅ | |
| 5 | `core.domain_events` | ✅ | |
| 6 | Party model | ✅ | |
| 7 | Unified `core.documents` | ✅ | |
| 8 | License checks in RLS | ✅ | |
| 9 | Never delete on cancel | ✅ | |
| 10 | No hard module dependencies | ✅ | |
| 11 | Merge-with-compat-views migration | ✅ | code merges; **no data migrates** (all source data is demo data) |
| 12 | FSM after migration | ✅ | |
| 13 | Full Next.js port of StockPilot | ✅ | |
