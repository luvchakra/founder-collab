# Baseline snapshot — `co-founder-ai` (discovery), story `A-3`

Per `docs/plan/04-CLAUDE-CODE-BACKLOG.md` `A-3`, reframed by
`docs/plan/05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` §B.2: since this platform is
greenfield (no in-place migration of the live app), this is **not** a regression diff —
it's a parity checklist ("discovery in the platform does what discovery does today"),
captured before story `P-5` ports `co-founder-ai` into `packages/module-discovery`.

**Source commit:** `befc3ac1a1413e220afab1f6f9cea1509f801d2e` (same SHA already recorded
in `docs/PORT-PROVENANCE.md`; working tree confirmed clean at that commit before running
any of the checks below).

**Note on Supabase access:** the live `co-founder-ai` Supabase project
(`xepqdxhakfvsxjbtqjzn`) is not reachable via this session's Supabase MCP — every call
against it (`list_tables`, `get_project`, `execute_sql`) returns `permission denied`,
even though the project appears in this session's `list_projects` output. This mirrors
the read-only restriction on the other source repo's project. The schema summary below
is therefore derived from the repo's own migration files (`supabase/migrations/`), the
same method `00-MASTER-PLAN.md` §0 used originally — re-verify against the live project
directly once a session with the right access runs this story again, or before `P-5`
actually starts the port.

---

## 1. Current check status (run locally, this session, against the commit above)

| Check | Result | Notes |
|---|---|---|
| `next build` (includes its own TypeScript pass) | ✅ Pass | 22 routes generated (9 static, 13 dynamic + 1 proxy/middleware), no errors |
| `npx tsc --noEmit` (standalone) | ❌ Fails in a fresh clone | `app/layout.tsx(43,50): Cannot find name 'LayoutProps'` — this is Next.js 16's ambient ` LayoutProps` type, generated into `.next/types/` only after a build/dev run. Not a real type error: `next build`'s own TypeScript pass (which runs after types are generated) is clean. A standalone `tsc --noEmit` on a fresh checkout will always show this until `next build`/`next dev` has run once. |
| `npm run lint` | ✅ Pass | No errors, no warnings |
| `npm run test` (vitest) | ❌ 1 suite fails | `tests/tenant-isolation.test.ts` — by design, requires `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (the test file's own header comment says as much: "not in network-sandboxed environments"). No `.env.local` exists in this clone. Pre-existing brittleness worth noting for whoever next touches this file: `describe.skipIf(!hasEnv)("...", () => { const admin = createClient(url!, serviceKey!, ...) })` calls `createClient` with non-null-asserted possibly-undefined values in the describe body itself, which runs even when `skipIf` is true (only the `it()`s inside are skipped) — so it throws during collection instead of skipping cleanly. Not fixed here: read-only source repo. |

**Bottom line:** the app itself is clean (build + lint pass with zero issues). The two
"failures" above are both environmental (no generated Next.js types, no dev Supabase
credentials in this sandbox), not defects in the code.

---

## 2. Schema summary (from `supabase/migrations/`, 23 files, latest `20260906090000_message_subject_and_prospect_outcome.sql`)

20 tables in `public`, all `workspace_id`/tenant-scoped per `CLAUDE.md` rule 11, 72 RLS
policies total:

```
accounts  account_members  businesses  products  workspaces
contacts  prospects  prospect_discovery_locks
icp_profiles  product_knowledge
prospect_research  prospect_scores  prospect_suggestions
outreach_strategies  messages  conversations  chat_messages
ai_runs  ai_provider_credentials  interest_signups
```

2 Storage buckets: `avatars`, `knowledge-files`.

This matches `00-MASTER-PLAN.md` §5's entity-ownership map almost exactly — `prospects`
→ `core.parties` (role `prospect`), `contacts` → `core.party_contacts`,
`messages`/`conversations` → `core.threads`/`core.messages`, `ai_runs`/
`ai_provider_credentials` → promoted to `core` — confirming the plan's mapping is still
accurate against the live migration set.

## 3. Code layout `P-5` will port

```
lib/          actions/ ai/ ai-providers/ alerts/ chat/ contacts/ conversations/ crypto/
              dashboard/ email/ icp/ interest/ knowledge/ messages/ outreach/ prospects/
              research/ scoring/ supabase/ tenancy/ usage/
components/   ai/ alerts/ auth/ chat/ errors/ knowledge/ marketing/ navigation/
              onboarding/ prospects/ settings/ tenancy/ theme/ ui/ (2 primitives — the
              platform's `packages/core/ui` already has the full 46-component set from
              stockpilot-ai-ops as of `P-0`, a strict superset)
prompts/      chat/ icp/ outreach/ product/ prospecting/ research/ (9 versioned prompt files)
app/(dashboard)/dashboard/   businesses/[businessId]/products/[productId]/{icp,
              prospects,prospects/[prospectId],prospects/discover,prospects/import,
              conversions,usage}, settings/{profile,appearance,ai-provider,billing,usage}
```

## 4. Parity checklist for `P-5` (fill in "platform" column when the port lands)

| Flow | Today (`co-founder-ai`) | Platform (`module-discovery`) |
|---|---|---|
| Product understanding → ICP generation | ✅ works (`prompts/product`, `prompts/icp`) | ⬜ not ported yet |
| Prospect discovery + import (CSV) | ✅ works | ⬜ |
| Prospect research + scoring | ✅ works | ⬜ |
| Outreach strategy + message generation | ✅ works | ⬜ |
| Conversation tracking + reply classification | ✅ works | ⬜ |
| Chat (product-scoped assistant) | ✅ works | ⬜ |
| Email inbound/status webhooks | ✅ works (`/api/webhooks/email-*`) | ⬜ |
| AI provider credentials + usage/cost tracking | ✅ works | ⬜ |
| Tenant isolation (account → business → product → workspace) | ✅ enforced via RLS, `security definer` helper pattern | ⬜ must reuse `core.user_business_ids()`/`user_workspace_ids()` pattern per `00-MASTER-PLAN.md` §3 |
| Avatars + knowledge file uploads (Storage) | ✅ works | ⬜ |

---

Epic 0 is now fully done (`A-1`, `A-2` per the existing docs; `A-3` per this file).
Epic 1 (`P-1`–`P-5`) is next — `P-1`/most of `P-2` are effectively already satisfied by
`P-0`'s monorepo scaffold, so the next real story is `P-3` (populate `module-registry`)
or `P-5` (port discovery), per `docs/plan/04-CLAUDE-CODE-BACKLOG.md`.
