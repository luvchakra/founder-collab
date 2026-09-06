# Decisions locked — ready for Claude Code

These three answers close every open question in `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` §A.4, B.4 and B.6. Nothing further is pending before `P-0`.

| Question | Decision |
|---|---|
| Data migration (05 §B.4) | **None.** All data in both existing projects is demo data. The platform starts empty. `SP-5`/`SP-6` (data load + verification) are **removed from the backlog**. Users are created fresh in the new project (05 §B.5 already assumed this). |
| StockPilot port strategy (05 §A.4) | **Option A.** StockPilot's TanStack Start app is ported into the Next.js platform in full — no bridge, no separate deployment. `packages/module-inventory` is Next.js from day one. |
| Region (05 §B.6) | **`ap-south-1` (Mumbai).** New Supabase project created there. |

## Consequences for the backlog (`04-CLAUDE-CODE-BACKLOG.md`)

- **Epic 4 shrinks.** Remove `SP-1` (identity migration — moot with no data), `SP-5` (data migration script), `SP-6` (data verification suite), `SP-8`'s cutover/rollback content (nothing to cut over from; just delete the "runbook" half, keep nothing).
- **Epic 4 becomes, in full:**

| ID | Story | Size |
|---|---|---|
| `SP-3a` | `inventory` schema DDL — tables + enums, column-identical to StockPilot's shape (`org_id` kept as the column name, FK repointed to `core.businesses`) | M |
| `SP-3b` | Port the procedural layer: inventory-state trigger, stock-transfer RPCs, status-transition permission enforcement, GST engine, GSTR1 invoicing logic — with tests | L |
| `SP-4` | Compat views + `INSTEAD OF` triggers for the tables that merge into `core` (`organizations`→`core.businesses`, `customers`/`suppliers`→`core.parties`, `products`→`core.items`, order/invoice/PO/return tables→`core.documents`), each with a round-trip write test | L |
| `SP-7` | **Port StockPilot's Next.js port** (05 §A.2): copy `src/components/ui/*` and `src/components/*` verbatim into `@cofounderai/core/ui` and `module-inventory`; copy `src/lib/*` (gst, format, product-import, spreadsheet, barcode-scan, einvoice, eway-bill) verbatim; rewrite `client.ts`/`client.server.ts`/`auth-middleware.ts`/`auth-attacher.ts`/`cron-auth.ts` against `@cofounderai/core`; rewrite `useOrg`→business-scoped session, `useAuth`→platform auth; convert the 5 `createServerFn` action files (`admin-auth`, `api-key-actions`, `admin-seed-actions`, `einvoice-actions`, `eway-bill-actions`) to Next.js server actions; convert the 19 `_authenticated/*.tsx` routes to `page.tsx` + client component (mechanical — body unchanged, wrapper rewritten); adopt `scripts/test-tenant-rls.mjs` as the tenant-isolation harness baseline; promote `public_api_v1` + `api-v1` lib to `core`. **Size: XL** (largest single story in the programme — split into sub-stories per route group if it runs long: config/master-data routes, transactional routes, GST routes, admin/api routes) | XL |
| `SP-9` | Manifest, `contract/index.ts` (`reserveStock`, `releaseStock`, `consumeStock`, `getAvailability`, `listWarehouses`, `upsertItem`), event publish/subscribe wiring | M |

- **`P-0`** (05 §B.8) now explicitly provisions the `ap-south-1` Supabase project and records its ref in `.env.example` / `docs/PORT-PROVENANCE.md`.
- **`A-2` (`SP-0`) is done** — already reflected in doc 05.
- Nothing else in Epics 0, 1, 2, 3, 5, 6 changes.

## Consequences for the ADRs (`01-ADR-DECISIONS.md`)

Add and approve:

**ADR-13 — StockPilot is ported to Next.js in full, no bridge deployment.**
*Why:* one toolchain, one design system (StockPilot's full shadcn set becomes the platform's shared UI kit — a strict upgrade over co-founder-ai's current 2-primitive setup), one auth session, one licensing/nav implementation. Confirmed by the source audit as ~85% direct copy by file/LOC.
*Cost:* the largest single story in the backlog (`SP-7`, size XL).

## What starts now

`P-0`: scaffold `cofounderai-platform` (new repo), new Supabase project in `ap-south-1`, npm workspaces skeleton, `@cofounderai/core` with `@supabase/ssr` client + vendored shadcn set, `module-registry`, eslint boundary rules + migration-schema lint, CI, fresh `CLAUDE.md` derived from the approved ADRs, `docs/plan/` containing all six documents. Nothing application-specific yet.
