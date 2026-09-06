# Revision 1.1 — StockPilot source audit (`SP-0`) + greenfield setup

Supersedes parts of `00-MASTER-PLAN.md` and `03-STOCKPILOT-MIGRATION.md`. Read this before either.

Two things changed since v1.0:
1. `stockpilot-ai-ops` is public — I cloned and read it. Story `SP-0` is now **done**, and it invalidates one core assumption.
2. You've decided on a **new repo + new Supabase project**, leaving both existing setups untouched.

---

## Part A — `SP-0` audit findings

### A.1 The stacks do not match

| | co-founder-ai | stockpilot-ai-ops |
|---|---|---|
| Framework | **Next.js 16.3.4, App Router, RSC** | **TanStack Start 1.168 + TanStack Router 1.170**, Vite 8 (Lovable-generated) |
| Package manager | npm | **bun** (`bun.lock`, `bunfig.toml`) |
| Data fetching | server components + server actions | **TanStack React Query 5, client-side** |
| Supabase client | `@supabase/ssr` (cookie sessions) | `@supabase/supabase-js` raw + **localStorage sessions** |
| Forms | native + server actions | react-hook-form + `@hookform/resolvers` |
| Validation | **zod ^4.5** | **zod ^3.24** |
| UI | Tailwind 4 + hand-vendored shadcn (2 Radix packages) | Tailwind 4 + **full shadcn suite (~28 Radix packages)** + sonner, cmdk, vaul, embla, recharts |
| Icons | lucide-react ^1.41 | lucide-react ^0.575 |
| Tests | vitest | none — 6 `.mjs`/`.ts` scripts under `scripts/` (incl. `test-tenant-rls.mjs`) |
| Size | — | 125 TS/TSX files; 19 authenticated routes; **~10,570 LOC in route files alone** |

**So "copy-paste with minimum code changes" as stated in v1.0 is not achievable across two different frameworks.** That plan assumed a shared Next.js base. It isn't.

### A.2 But the damage is much smaller than that table suggests

The saving grace: **StockPilot's authenticated app is a pure client-side SPA over Supabase RLS.** `src/routes/_authenticated/route.tsx` sets `ssr: false` and does auth in `beforeLoad`; every page is a React component using `useQuery`/`useMutation` against a browser `supabase` client. There is no server-rendered data flow to unwind.

Concretely, out of 125 files:

| Bucket | Files | Port effort |
|---|---|---|
| `src/components/ui/*` (shadcn) | ~50 | copy verbatim; they're the standard shadcn sources |
| `src/components/*` (app-shell, panels, dialogs, barcode/QR) | 11 | copy verbatim, add `"use client"` |
| `src/hooks/*` (useAuth, useOrg, usePermissions, useTheme, use-mobile) | 5 | **useOrg + useAuth rewritten** to platform business/session; other 3 verbatim |
| `src/lib/*` (gst.ts, format, product-import, spreadsheet, barcode-scan, einvoice, eway-bill…) | ~14 | copy verbatim — pure logic, framework-agnostic |
| `src/lib/*-actions.ts` using `createServerFn` | **5** | rewrite as Next.js server actions / route handlers (admin-auth, api-key, admin-seed, einvoice, eway-bill) |
| `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `cron-auth.ts` | 5 | replaced by `@cofounderai/core` equivalents |
| `src/integrations/supabase/types.ts` | 1 | regenerated from the new project |
| `src/routes/_authenticated/*.tsx` | **19** | body copied verbatim as `"use client"` components; only the `createFileRoute(...)` wrapper (≈6 lines each) becomes a Next.js `page.tsx` |
| `src/routes/index.tsx`, `auth.tsx`, `blog.*`, `__root.tsx` | 5 | **discarded** — the platform owns marketing, auth and shell |

**Realistic estimate: ~85% of the code moves unchanged, ~19 thin route wrappers are mechanical, and ~10 files are genuine rewrites** (client/auth/org/server-fns). React Query works fine inside Next.js client components, so the 10.5k LOC of page logic — the expensive part — is untouched.

### A.3 Other findings worth acting on

- **27 migration files**, well beyond what the DB snapshot showed: `harden_tenant_rls`, `expand_org_roles`, `permission_model`, `enforce_status_transition_permissions`, `inventory_state_model` (+trigger), `gst_engine`, `sales_invoicing_gstr1`, `eway_bills`, `einvoicing`, `stock_transfers` (+functions), `sales_returns`, `public_api_v1`, `admin_seed_data_tool`. These contain **triggers, RPC functions and status-transition permission enforcement** — not just tables. The v1.0 plan under-counted this: the migration is schema **and** procedural code.
- **Enums confirmed** (e.g. `org_role`, plus the PO/SO/invoice status types seen as `USER-DEFINED` in the DB). They must be recreated before tables.
- `scripts/test-tenant-rls.mjs` already exists — adopt and extend it as the platform's tenant-isolation harness rather than writing a new one.
- `public_api_v1` migration + `api-key-actions` + `src/lib/api-v1/` is a working public API with rate limiting. That's a platform-level asset; promote it to `core` as planned.
- `useOrg` stores the active org in localStorage + React Query cache. The platform's active-business resolution is server-side (`proxy.ts`). This hook is the single highest-value rewrite — everything else keys off it.
- `usePermissions` mirrors a DB `has_permission()` RLS function client-side. Same pattern the platform needs for licenses — reuse the shape for `useEntitlements`.
- Lovable-generated `auth-middleware.ts` is marked "automatically generated, do not edit" — safe to delete rather than port.

### A.4 Decision this forces

**Option A — one Next.js platform (recommended).** Port StockPilot's client components into `packages/module-inventory` as described above.
- Cost: the ~10 rewrites + 19 wrappers + reconciling zod 3→4 and lucide versions + vendoring the full shadcn set into `@cofounderai/core/ui` (which FSM needs anyway — you cannot build a Kickserv-class UI on the 2 Radix primitives co-founder-ai currently has).
- Benefit: one toolchain, one design system, one auth session, one router, one build. Licensing, nav, RBAC and the shared `core` domain work exactly once.

**Option B — keep StockPilot on TanStack Start, deploy it as a separate app under a shared domain.** Truly minimal code change today; the platform shell links to `/inventory` running the original app against the shared Supabase project.
- Cost, paid forever: two toolchains, two shadcn copies, two session mechanisms to keep in sync, two nav implementations, duplicated licensing enforcement in the client, inconsistent UX, and every future cross-module feature (job → parts, invoice → e-invoice) has to cross an app boundary. It also makes the FSM↔inventory integration in `02-FSM-PRD.md` §7.4 significantly harder.
- Where it's defensible: as a **temporary bridge** — ship the platform with inventory running as-is in week 2, port it properly in month 2.

**My recommendation: Option A.** The audit says the port is ~2–3 weeks of agent work, not a rewrite, and Option B's tax compounds against exactly the integrations that make the platform worth building. If you want inventory usable sooner, take Option B explicitly as a 6-week bridge with a dated end, not as an architecture.

---

## Part B — Greenfield setup (new repo, new Supabase project)

This is the right call and it removes several risks from v1.0 — no in-place refactor of a live app, no mutating a production DB, and no possibility of breaking discovery while building the platform.

### B.1 Naming and topology

```
repo:      cofounderai-platform                (new)
supabase:  cofounderai-platform-dev            (new, ap-south-1 or ap-northeast-1 — see B.6)
           cofounderai-platform-prod           (new, later)
vercel:    cofounderai-platform                (new)

untouched: co-founder-ai (repo + supabase xepqdxhakfvsxjbtqjzn + vercel)
untouched: stockpilot-ai-ops (repo + supabase atdmyqahetqkbnrszega + vercel)
```

The two existing repos become **read-only source material**. Copy from them; never push to them.

### B.2 What this changes in the plan

| v1.0 said | Revision 1.1 |
|---|---|
| `P-1` "convert the repo to workspaces, move the existing app in" | **`P-1` becomes: scaffold a new monorepo from scratch.** Nothing to migrate in place, no regression risk to the live app |
| `P-5` "move discovery into a package" | **`P-5` becomes: port discovery** from `co-founder-ai` into `packages/module-discovery` — copy `lib/`, `components/`, `app/(dashboard)/dashboard/*`, `prompts/`, `types/`, and its 24 migrations, rebased onto the new tenancy |
| `A-3` "baseline snapshot to prove nothing regressed" | Still needed, but as a **parity checklist** ("discovery in the platform does what discovery does today"), not as a regression diff |
| `C-1` "add `core` alongside existing `public` tables" | **No legacy `public` to preserve.** Discovery's tables get created in a `discovery` schema from day one, with `workspace_id` intact. ADR-3's "leave `public` alone" caveat disappears, and the optional `S-6` rename story is deleted |
| `SP-5` "transform + load into the live platform DB" | **Load into a clean DB.** Far simpler: apply the rewritten migration timeline, then import data (if any) with no coexistence concerns |
| `SP-8` "freeze-and-cut with 30-day rollback" | Unchanged in spirit, but rollback is now trivially "keep using the old app" — the old project is never modified |

### B.3 Migration timeline strategy for a clean DB

Do **not** replay StockPilot's 27 migrations. Do this instead:

1. **Extract, don't replay.** Read all 27 files and produce a consolidated, platform-shaped migration set: enums first, then `core` tables, then `inventory`/`gst` tables, then triggers/RPCs/status-transition functions ported over, then RLS in the platform's `tenant AND licensed` form. StockPilot's migrations carry history (create-then-alter-then-fix, e.g. `sales_returns` + `sales_returns_fix`); the platform wants the end state only.
2. **Keep the procedural code.** `inventory_state_model_trigger`, `stock_transfers_functions`, `enforce_status_transition_permissions`, `gst_engine`, `sales_invoicing_gstr1` are real logic. Port them function by function with tests, not by copy-paste into a different schema layout. This is the part of `SP-3` that v1.0 sized too small — **treat it as its own story (`SP-3b`, size L).**
3. **Compat views still earn their place**, because they're what let the ported page components keep querying `products`/`customers`/`sales_orders` with unchanged column names while `core` owns the data. Nothing about the greenfield decision removes that need.
4. Because both DBs are PG 17.6, `pg_dump`-based data extraction from the old project remains straightforward.

### B.4 Data: the question you should answer before `SP-5`

The live StockPilot DB holds 5 organizations, 6 members, 36 products, 15 suppliers, 9 customers, 19 stock levels, 25 movements, 12 POs, 3 sales orders, 1 invoice, 1 return, 1 transfer, 4 alerts — and 237 profiles plus a demo-seed batch of 35 records. **That is overwhelmingly demo data.**

Three options, in increasing cost:
- **(i) No data migration.** Fresh platform, re-onboard the real users, re-import products via the existing `product-import` feature. Cost: near zero. Risk: you lose the 12 POs / 3 SOs / 1 invoice of history.
- **(ii) Selective migration.** Migrate one real organization's master data (products, suppliers, customers, warehouses, stock levels) and skip transactional history and demo rows. Cost: a day. This is my recommendation unless a real customer is depending on that history.
- **(iii) Full migration** as specified in `03-STOCKPILOT-MIGRATION.md` §4. Cost: `SP-5` + `SP-6` in full (~1 week with verification).

Whichever you pick, **`core.number_sequences` must start above the highest existing document number** if any documents come across, and `SP-6`'s verification suite scales down with the option chosen.

### B.5 Identity, revisited

With a clean project, `SP-1` gets easier: there are ~6 real users. **Don't migrate `auth.users`.** Create accounts fresh in the platform, map old→new UUIDs in `core.user_id_map` during any data load, and let people set new passwords. This removes the messiest item on v1.0's risk table entirely.

### B.6 Region

Both existing projects are `ap-northeast-1` (Tokyo); two of your older projects are `ap-south-1` (Mumbai). If the customer base is India — which the GST-first design strongly implies — **create the new project in `ap-south-1`** and accept a one-time slower data copy. Latency to users matters more than latency to a one-off migration.

### B.7 Freeze policy (the thing that actually goes wrong here)

The moment the platform repo exists, the two source repos start drifting. Agree this up front:
- `stockpilot-ai-ops`: **feature freeze** from the day `SP-7` starts. Bug fixes only, and every fix must be applied to the platform copy in the same PR.
- `co-founder-ai`: it can keep shipping until `P-5` starts; from then on, same rule.
- Record the exact source commit SHA of each repo in the platform's `docs/PORT-PROVENANCE.md` per ported directory, so "did this fix make it across?" is answerable.

### B.8 Revised phase 0

`P-0` (new first story): scaffold `cofounderai-platform` — npm workspaces, Next.js 16 `apps/web`, `packages/core` with `@supabase/ssr` clients and the **full shadcn set vendored**, `packages/module-registry`, eslint boundary rules, vitest, CI (typecheck + lint + test + boundary lint + migration-schema lint), new Supabase dev project linked, `.env.example`, `CLAUDE.md` written fresh from `01-ADR-DECISIONS.md` (not copied from `co-founder-ai`, whose §41 non-goals contradict this plan), and `docs/plan/` containing these five documents. Nothing else.

---

## Part C — Corrections to v1.0 documents

Apply these when reading the earlier files:

- `00-MASTER-PLAN.md` §0: the StockPilot row now reads "public — cloned and audited; see `05`". §9's first two risk rows ("StockPilot code is unseen", "auth.users IDs differ") are **closed**; replace with the framework-mismatch risk from A.1 and the procedural-migration risk from B.3.2.
- `00-MASTER-PLAN.md` §4: `public` schema no longer holds discovery. Use a `discovery` schema from the start.
- `01-ADR-DECISIONS.md` ADR-3: drop the "existing discovery tables stay in `public`" clause. **Add ADR-13:** the platform is Next.js-only; StockPilot's TanStack Start app is ported, not embedded (Option A above) — this needs your sign-off alongside the other twelve.
- `03-STOCKPILOT-MIGRATION.md` §3 mechanism **M1 is void** — there is no shared Supabase client factory to point at a schema, because the client itself is being replaced. Schema targeting instead happens once, in `@cofounderai/core`'s client factory for the inventory module. M2, M3 and M4 are unaffected and still carry the design.
- `03-STOCKPILOT-MIGRATION.md` §4 `SP-0` is complete; `SP-3` splits into `SP-3a` (tables/enums) and `SP-3b` (triggers, RPCs, status-transition enforcement, GST engine).
- `04-CLAUDE-CODE-BACKLOG.md`: insert `P-0` (B.8), rewrite `P-1`/`P-5` per B.2, delete `S-6`, add `SP-3b`, and re-size `SP-7` from L to **XL** (the port is the single biggest story in the programme).
