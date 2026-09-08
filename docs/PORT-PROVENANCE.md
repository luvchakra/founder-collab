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
> failure, reconfirmed later in the same session), and the project does not appear in
> this session's Supabase MCP project list (which only lists 5 projects, none matching
> this ref). No one has verified from this environment that the project is reachable, is
> in `ap-south-1`, or is otherwise correctly provisioned — **the `discovery` schema
> migration below has never been applied to it.** It has been verified against a local
> Postgres 16 instance instead (`scripts/test-discovery-rls.mjs`, wired into CI with a
> `postgres:16` service container) — same engine, same RLS mechanism, real tenant-
> isolation assertions, but `auth`/`storage` are minimal stubs
> (`supabase/tests/local-stub.sql`), not the genuine Supabase project. Apply and re-verify
> against the real target the moment a session has connectivity to it, before building
> anything further on top that assumes it's already there.
>
> **Update (2026-09-08): stale, kept only as a historical record of the 2026-09-06
> connectivity gap.** A later session had Supabase MCP access to this exact project and
> has since applied every migration in `supabase/migrations/` to it directly (through
> `discovery`, `inventory`, `fsm`, `gst`, and `crm`) and live-verified each one with a
> rolled-back transaction — see `docs/FSM-PROGRESS.md` (F-1 onward) and
> `docs/EPIC6-PROGRESS.md` (S-1 through S-5) for the story-by-story record. The project is
> reachable, correctly provisioned, and has carried every story's schema since. Do not
> read the paragraph above as describing the current state.

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
| `supabase/migrations/20260906100000_discovery_schema.sql` | co-founder-ai | all 23 files in `supabase/migrations/` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 |
| `packages/module-discovery/src/lib/{tenancy,contacts,prospects,icp,research,scoring,outreach}/{queries,mutations}.ts` | co-founder-ai | same paths under `lib/` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` / `0b30fa168a0f929d37822fb098bbb3ce19e7713f` | P-5 |
| `packages/module-discovery/src/lib/ai/{router,usage,discovery-lock}.ts` | co-founder-ai | `lib/ai/{router,usage,discovery-lock}.ts` | `0b23246f08a669ee7ce5f402507b337821a91a73` | P-5 |
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
| `packages/module-discovery/src/lib/ai/{dedup,hash,understand-product,generate-icp,research-prospect,discover-prospects}.ts`, `lib/usage/{queries,limits}.ts`, `lib/knowledge/queries.ts`, `lib/prospects/duplicates.ts` | co-founder-ai | `lib/ai/{dedup,hash,understand-product,generate-icp,research-prospect,discover-prospects}.ts`, `lib/usage/{queries,limits}.ts`, `lib/knowledge/queries.ts`, `lib/prospects/duplicates.ts` | `951d326361e4997ec26c6f8761631867416c1699` | P-5 (partial) |
| `packages/module-discovery/src/lib/ai/{generate-message,generate-reply,generate-strategy,classify-reply,chat}.ts`, `lib/conversations/queries.ts`, `lib/chat/queries.ts` | co-founder-ai | `lib/ai/{generate-message,generate-reply,generate-strategy,classify-reply,chat}.ts`, `lib/conversations/queries.ts`, `lib/chat/queries.ts` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (partial) |
| `packages/module-discovery/src/lib/ai-providers/{types,queries,mutations}.ts`, `lib/knowledge/mutations.ts`, `lib/interest/mutations.ts` | co-founder-ai | `lib/ai-providers/{types,queries,mutations}.ts`, `lib/knowledge/mutations.ts`, `lib/interest/mutations.ts` | `3c88122b7f5fc47e641c301ad747b7f5f6195f77` | P-5 (partial) |
| `packages/module-discovery/src/lib/messages/{queries,mutations,send,ingest-send-status}.ts`, `lib/conversations/{mutations,ingest-inbound-email}.ts` | co-founder-ai | same paths under `lib/` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (partial) |
| `packages/module-discovery/src/lib/dashboard/queries.ts`, `lib/prospects/{bulk-actions,csv}.ts`, `lib/scoring/score-prospect.ts` | co-founder-ai | same paths under `lib/` | `11896ff43896bc07b75e98a010696601c0f2d844` | P-5 (complete: `lib/` domain layer) |
| `packages/core/src/components/theme/{theme-provider,theme-script,theme-toggle}.tsx`, `src/components/navigation/top-progress-bar.tsx`, `apps/web/app/layout.tsx` | co-founder-ai | `components/theme/*.tsx`, `components/navigation/top-progress-bar.tsx`, `app/layout.tsx` | `72da3b5d03092f6f4b20d733218b8b183aea0c5b` | P-5 (UI layer, starting) |
| `packages/core/src/db/middleware.ts`, `apps/web/proxy.ts`, `apps/web/app/(auth)/**`, `apps/web/app/auth/callback/route.ts`, `apps/web/components/auth/*.tsx` | co-founder-ai | `lib/supabase/middleware.ts`, `proxy.ts`, `app/(auth)/**`, `app/auth/callback/route.ts`, `components/auth/*.tsx` | `0b30fa168a0f929d37822fb098bbb3ce19e7713f` | P-5 (UI layer) |
| `packages/module-discovery/src/{actions/onboarding.ts,components/onboarding/wizard.tsx,components/errors/*.tsx}`, `apps/web/app/onboarding/page.tsx` | co-founder-ai | `app/onboarding/{actions.ts,page.tsx}`, `components/onboarding/wizard.tsx`, `components/errors/*.tsx` | `19af424b4d80acd9265149a201702463f413345d` | P-5 (UI layer) |
| `apps/web/app/(dashboard)/{layout.tsx,dashboard/{page.tsx,actions.ts}}`, `apps/web/components/dashboard/dashboard-chrome.tsx`, `packages/module-discovery/src/{components/tenancy/create-business-modal.tsx,components/prospects/conversion-funnel-panel.tsx,components/ui/native-select.tsx,lib/tenancy/active-path.ts,lib/alerts/derive.ts,lib/usage/format.ts}`, `packages/core/src/{hooks/use-dismiss.ts,components/ui/submit-button.tsx}` | co-founder-ai | `app/(dashboard)/{layout.tsx,dashboard/{page.tsx,actions.ts}}`, `components/tenancy/create-business-modal.tsx`, `components/prospects/conversion-funnel-panel.tsx`, `components/ui/select.tsx`, `lib/tenancy/active-path.ts`, `lib/alerts/derive.ts`, `lib/usage/format.ts`, `hooks/use-dismiss.ts`, `components/ui/submit-button.tsx` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (UI layer, adapted) |
| `apps/web/app/(dashboard)/{loading.tsx,dashboard/{error.tsx,businesses/[businessId]/*}}`, `packages/module-discovery/src/components/{tenancy/{editable-name,editable-text,breadcrumbs}.tsx,ui/loading-skeleton.tsx}` | co-founder-ai | `app/(dashboard)/{loading.tsx,dashboard/{error.tsx,businesses/[businessId]/*}}`, `components/tenancy/{editable-name,editable-text,breadcrumbs}.tsx`, `components/ui/loading-skeleton.tsx` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (UI layer) |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/products/[productId]/*`, `packages/module-discovery/src/components/{tenancy/product-nav.tsx,ui/{expandable-text,expandable-box,collapsible-card}.tsx,ai/ai-action-form.tsx,knowledge/knowledge-source-card.tsx}` | co-founder-ai | `app/(dashboard)/dashboard/businesses/[businessId]/products/[productId]/*`, `components/tenancy/product-nav.tsx`, `components/ui/{expandable-text,expandable-box,collapsible-card}.tsx`, `components/ai/ai-action-form.tsx`, `components/knowledge/knowledge-source-card.tsx` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (UI layer) |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/products/[productId]/icp/*` | co-founder-ai | same path | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (UI layer) |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/products/[productId]/prospects/{page.tsx,actions.ts}`, `packages/module-discovery/src/components/prospects/{add-prospect-modal,prospect-toolbar-actions,prospect-filters,prospects-table,prospects-board}.tsx` | co-founder-ai | `.../prospects/{page.tsx,actions.ts}`, `components/prospects/{add-prospect-modal,prospect-toolbar-actions,prospect-filters,prospects-table,prospects-board}.tsx` | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (UI layer) |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/products/[productId]/prospects/{discover,import}/*` | co-founder-ai | same paths | `befc3ac1a1413e220afab1f6f9cea1509f801d2e` | P-5 (UI layer) |

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
- **`supabase/migrations/20260906100000_discovery_schema.sql` (`P-5`, consolidated, not
  verbatim):** the end state of all 23 `co-founder-ai` migrations, per
  `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` §B.3 ("extract, don't replay") — one file
  instead of 23, schema-qualified to `discovery` instead of `public`, in a `discovery`
  schema from day one (§B.2: no legacy `public` to preserve). Every table, index,
  trigger, `security definer` tenant-resolution function, RLS policy, and storage-bucket
  policy is the same logic as the source, just re-qualified. `discovery.accounts`/
  `account_members`/`businesses`/`products`/`workspaces` are co-founder-ai's own tenancy
  tables ported unchanged — **not yet merged into `core`** (00-MASTER-PLAN.md §5 says
  Account/Business are `core` concepts shared by every module; that merge is Epic 2's
  `C-1`, once `core` exists and there's a second module to share them with). Verified
  against a local Postgres via `scripts/test-discovery-rls.mjs` (see the network note
  above) — schema applies cleanly, `handle_new_user`/`create_default_workspace` fire
  correctly, and RLS genuinely isolates two tenants on both read and write. Not applied
  to the real target project as of this entry (2026-09-06) -- it has been since, along
  with every later migration; see the network note's own 2026-09-08 update above.

- **Schema-targeting mechanism (`P-5`), added to `packages/core/src/db/{client,server,admin}.ts`:**
  each now takes an optional `{ schema }` option, passed through to `@supabase/ssr`/
  `@supabase/supabase-js`'s `db.schema`. `03-STOCKPILOT-MIGRATION.md` mechanism M1's
  "one file changed" pointed at a single client factory getting `.schema('inventory')`;
  the platform has one client factory per module instead (three, actually — client/
  server/admin), so the equivalent is core's factories taking the schema as a parameter
  and each module's own thin `db/{client,server,admin}.ts` (new,
  `packages/module-discovery/src/db/*`) baking its schema name in once. Every ported
  query/mutation file below needed zero changes to its actual Supabase calls (`.from(...)`
  bare table names, exactly as upstream) — only the `createClient` import path changed,
  confirming M1's "minimum code changes" premise holds for discovery too.
- **`lib/{tenancy,contacts,prospects,icp,research,scoring,outreach}/{queries,mutations}.ts`
  (`P-5`):** copied verbatim; only `@/lib/supabase/server` → `../../db/server` and the
  couple of same-domain type/util imports (`@/lib/url`, `@/lib/tenancy/queries`, etc.)
  rewritten to their new locations. No logic changes.
- **`lib/ai/{router,usage,discovery-lock}.ts` (`P-5`):** the AI Router (workspace →
  account → BYOK credential → decrypted key → provider-bound model), the `ai_runs`
  usage-ledger writer, and the discovery in-flight lock — copied verbatim, imports
  rewritten to the new locations of `tenancy/queries`, `crypto/api-key`, and the
  `ai/model-registry`/`operation-registry`/`provider-factory`/`client` pieces `P-2`
  already moved into `packages/core`.
- **AI operation functions + their dependencies (`P-5`, partial):**
  `understand-product.ts`, `generate-icp.ts`, `research-prospect.ts`, and
  `discover-prospects.ts` — the four AI-calling functions that generate a product
  profile, draft an ICP, research a single prospect (two-call web-search + structuring
  pattern via the BYOK router), and discover new prospect candidates (same two-call
  pattern, behind a per-workspace advisory lock) — copied verbatim, only import paths
  rewritten (`@/lib/supabase/server` → `../../db/server`, same-domain imports → relative
  paths, `@cofounderai/core/ai/provider-factory` for `createWebSearchTools`). Their
  blocking dependencies came along in the same batch: `lib/ai/dedup.ts` (input-hash
  dedup window), `lib/ai/hash.ts` (`hashInput`), `lib/usage/{queries,limits}.ts`
  (monthly free-tier run/cost caps), `lib/knowledge/queries.ts`
  (`listProductKnowledge`), and `lib/prospects/duplicates.ts`
  (`findDuplicateProspect`, shared by discovery/CSV-import/manual-add). One
  `noUncheckedIndexedAccess` fix in `understand-product.ts` (`sources[0]!.updated_at`,
  same pattern as `P-2`'s `email/render.ts` fix) — the array is already known non-empty
  by the preceding length check, TS just can't see it through `.reduce`'s seed argument.

- **Remaining AI operation functions + their last dependencies (`P-5`, completes the
  `lib/ai/*.ts` operation layer):** `generate-message.ts` (approved-strategy → draft
  outbound message), `generate-reply.ts` (drafts a follow-up from the latest classified
  inbound reply), `generate-strategy.ts` (research + score → outreach strategy, at the
  "reasoning" quality tier), `classify-reply.ts` (runs on the *admin* client — its only
  caller is the inbound-email webhook, which has no user session — so `resolveAiModel`/
  `recordAiRun`/`assertWithinUsageLimit` all take the admin client explicitly), and
  `chat.ts` (the header AI assistant, grounded in whatever business/product is currently
  in view). Copied verbatim, only import paths rewritten. Brought their two remaining
  blocking dependencies along: `lib/conversations/queries.ts` (`getConversation`,
  `getOpenConversation`, `listConversations`) and `lib/chat/queries.ts`
  (`listChatMessages`/`appendChatMessage` — has a type-only circular import with
  `lib/ai/chat.ts` in the original source, preserved as-is since type-only imports erase
  at compile time and cause no runtime cycle).
  This also surfaced a real, previously-latent type bug in
  `packages/core/src/db/{client,server,admin}.ts`: passing a non-`"public"` schema string
  to `db.schema` widens the returned client's `SchemaName` generic from the literal
  `"public"` to plain `string`, which `classify-reply.ts` (the first ported file to pass
  an admin client into `resolveAiModel`/`recordAiRun`/`assertWithinUsageLimit`, all typed
  to accept the default-generic `SupabaseClient`) was the first thing to actually hit.
  Fixed by giving all three factories an explicit `SupabaseClient` return type plus a
  cast at the return statement — safe because every caller in this codebase queries with
  untyped `.from(table)` against `Database = any` already, so the literal schema-name
  generic never carried real type safety to begin with.

- **BYOK settings UI layer + last two standalone mutations (`P-5`):**
  `ai-providers/{types,queries,mutations}.ts` (the account-level "connect/disconnect
  provider" flow the settings page uses — tests the key via
  `@cofounderai/core/ai-providers/test-connection` before ever persisting it, mirroring
  `connectAiProvider`'s "never save a key that failed its first validation" invariant),
  `knowledge/mutations.ts` (add/update/delete a knowledge source, plus file upload with
  real PDF/DOCX text extraction via `pdf-parse`/`mammoth` — added as new dependencies to
  `module-discovery`'s `package.json`, versions matched to `co-founder-ai`'s own), and
  `interest/mutations.ts` (`recordInterestSignup`, the one other mutation besides
  `classifyReply` that runs on the admin client directly, since an anonymous "Show
  Interest" submission has no session for RLS to key off of). All copied verbatim, only
  import paths rewritten (`@/lib/crypto/api-key` → `@cofounderai/core/crypto/api-key`,
  `./test-connection` → `@cofounderai/core/ai-providers/test-connection`, `@/lib/ai/
  model-registry`'s `AiProvider` → `@cofounderai/core/ai/model-registry`).

- **Messages + conversations mutation/webhook layer (`P-5`):**
  `messages/{queries,mutations,send,ingest-send-status}.ts` (list messages;
  update/approve/mark-sent/delete a draft; `sendMessage`'s real Resend send integration,
  the only channel with automated sending; the Resend delivery-status webhook handler)
  and `conversations/{mutations,ingest-inbound-email}.ts` (lazy conversation
  creation/status transitions, manually logging a reply, and the inbound-email webhook
  that matches a reply to a contact by address and classifies it). Copied verbatim, only
  import paths rewritten (`@/lib/email/render` → `@cofounderai/core/email/render`, the
  rest to their new relative locations). `messages/types.ts` was already identical to
  the source (ported in an earlier batch) — confirmed with a diff, not re-copied.
  `ingest-send-status.ts` and `ingest-inbound-email.ts` both run on the admin client, same
  pattern as `classify-reply.ts`/`interest/mutations.ts`: a delivery-status or inbound
  webhook has no logged-in user for RLS to key off of.

- **Dashboard account-scan queries, prospect bulk actions/CSV import, deterministic
  scoring (`P-5`, completes the `lib/` domain layer):** `dashboard/queries.ts`
  (`getAccountWorkspaceEntries`/`getAccountUsageAndProspects`, the single embedded
  business→product→workspace PostgREST query the dashboard and its layout share, both
  `cache()`-memoized per account so two callers on the same request don't pay for it
  twice), `prospects/bulk-actions.ts` ("research all new"/"score all researched",
  sequential not parallel so a hit usage ceiling stops the batch cleanly),
  `prospects/csv.ts` (the pasted-CSV import parser), and `scoring/score-prospect.ts`
  (the ICP-fit/intent/timing scorer — entirely deterministic per CLAUDE.md principle 4,
  no AI call; append-only `prospect_scores` rows so score history/trend has something to
  read). Copied verbatim, only import paths rewritten; two more
  `noUncheckedIndexedAccess` non-null assertions in `csv.ts` (`lines[0]!`, `lines[i]!` —
  both already loop/length-guaranteed, same pattern as the earlier `understand-product.ts`
  and `chat.ts` fixes).
  This closes out every file under `co-founder-ai`'s `lib/` tree that `docs/
  BASELINE-DISCOVERY.md`'s parity checklist called for — the full domain/business-logic
  layer (queries, mutations, AI operations, webhooks) is now in `module-discovery`.

- **UI layer scope decision, and the first slice of it (`P-5`):** `docs/plan/04-CLAUDE-CODE-BACKLOG.md`'s `P-5` row ("move discovery into a package") is superseded by
  `docs/plan/05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` §B.2's revision, which is explicit:
  `P-5` ports `lib/`, `components/`, `app/(dashboard)/dashboard/*`, `prompts/`, `types/`
  from `co-founder-ai` **at its existing URL structure**
  (`/dashboard/businesses/[businessId]/products/[productId]/...`) — the
  `[businessSlug]`-per-module restructuring in `CLAUDE.md`'s "Repository structure"
  section is Epic 2 (`C-5`, business switcher + `proxy.ts` route resolution) and later,
  which doesn't exist yet. Started with the shared, cross-module pieces every route
  needs: the theme system (`theme-provider`/`theme-script`/`theme-toggle` — hand-rolled
  light/dark/system, no new dependency, ported verbatim) and `top-progress-bar.tsx`
  (link-navigation loading indicator). These are platform-shell concerns rather than
  discovery-specific ones (CLAUDE.md non-negotiable #7: "every module's screens share
  this one design system"), so they landed in `packages/core/src/components/{theme,
  navigation}/` — new `./theme/*` and `./navigation/*` export map entries — not
  `module-discovery`. `apps/web/app/layout.tsx` now wires `ThemeScript`/`ThemeProvider`/
  `TopProgressBar` and real `<head>` metadata (via `@cofounderai/core/site`'s `SITE_URL`)
  in place of the `P-0`-era placeholder shell, verified with a real `next build` and a
  Playwright screenshot (light theme, blue accent, `DashboardShell` sidebar/topbar
  render correctly) rather than typecheck alone.

- **Session-refresh middleware + full auth flow (`P-5`):** `lib/supabase/middleware.ts`
  → `packages/core/src/db/middleware.ts` (`updateSession` — cookie refresh + the
  authenticated/unauthenticated route boundary; only the anon-key env var name changed,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` → this platform's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`),
  wired from a new `apps/web/proxy.ts` (Next.js 16 renamed `middleware.ts`; business-
  switcher resolution and per-module license gating are still Epic 2's `C-5`, not this
  story). Session/auth is a platform-wide concern, not a `discovery` one, so both landed
  in `packages/core`/`apps/web` directly rather than `module-discovery`. Login/signup/
  forgot-password/reset-password pages, their form components, `app/(auth)/actions.ts`'s
  five server actions, and `app/auth/callback/route.ts` (the Supabase email-link code
  exchange) ported the same way — actions.ts and its four form components are tightly
  coupled to this one route group and don't need to be shared by any other module, so
  they live directly under `apps/web/app/(auth)/` and a new `apps/web/components/auth/`,
  not split into a package. Copied verbatim; only `@/lib/supabase/server` →
  `@cofounderai/core/db/server` and `@/components/ui/*` → `@cofounderai/core/ui/*`
  import rewrites.
  Ported co-founder-ai's own dark-violet `.landing-theme` token block (marketing/auth
  brand identity, `docs/landing-page-requirements.md`) into `apps/web/app/globals.css`
  verbatim, since CLAUDE.md non-negotiable #7 governs the dashboard *shell*
  (sidebar/topbar/avatar/business switcher), not pre-login marketing/auth pages — for
  those, "very closely follow the design of CoFounderAI pages" (the platform owner's own
  words) is the more specific, more recent instruction. One deliberate addition beyond a
  literal port: scoped `--primary`/`--primary-foreground`/`--ring` overrides inside
  `.landing-theme` to the same violet as `--landing-accent`, matching what was actually
  true upstream (co-founder-ai's app-wide `--primary` **was** this violet; `--landing-*`
  just duplicated it under its own name) — without this override, a shared `Button` on
  an auth page would incorrectly render in the dashboard shell's blue instead. Verified
  visually with Playwright screenshots of `/login` before and after that fix, not just
  typecheck.

- **Import-boundary rule fix, required by the onboarding port (`P-5`):**
  `scripts/lint-import-boundaries.mjs`'s `checkSpecifier` applied the same
  contract-only restriction to `apps/web` as to a peer module, which would have blocked
  every page in `apps/web` from importing anything from `module-discovery` except a
  `contract/` entry point that doesn't exist yet — `packages/module-discovery`'s
  `package.json` `exports` map (`./lib/*`, `./prompts/*`, `./db/*`, and now
  `./components/*`/`./actions/*`) is that module's real declared public surface, and
  `apps/web`'s own repo-structure doc explicitly describes its per-module route groups
  as "re-exporting from packages" — i.e. reaching into a module's route/action/component
  code, not just a `contract/`. Fixed by exempting `owner.kind === "app"` from the
  cross-module contract check (a one-line addition plus an updated docstring) — the
  module-to-module restriction (`00-MASTER-PLAN.md` §6's actual stated concern) is
  unchanged; only the host app, which every module's `package.json` exports already
  gates, is exempt. Added a fixture test proving apps/* can now import a module's
  internals, alongside the four pre-existing fixture tests (all still passing).
  This is a narrow lint-rule correction to match documented intent, not an architecture
  change requiring separate approval.
- **Onboarding flow (`P-5`):** the two-question wizard (`OnboardingWizard`) plus its
  backing server actions (`runOnboardingAction`/`approveOnboardingIcpAction` — create
  business+product+knowledge source, then run the same `understandProduct`/`generateIcp`
  pipeline the dashboard's own product/ICP pages use) live fully inside
  `module-discovery` (`src/actions/onboarding.ts`, `src/components/onboarding/wizard.tsx`)
  rather than split into `apps/web`, since every function they call is discovery's own
  domain logic — `apps/web/app/onboarding/page.tsx` is a thin page that resolves the
  current user/account and renders the wizard. Also ported `components/errors/
  {ai-error-notice,ai-error-options}.tsx` into `module-discovery/src/components/errors/`
  (the shared BYOK-failure error boundary body the wizard, and later every AI action
  form, use). Copied verbatim, import paths rewritten. Verified with a real `next build`
  producing the `/onboarding` route alongside typecheck/lint/boundaries/tests.

- **Real authenticated dashboard shell + home page (`P-5`, adapted, not verbatim):**
  the P-0-era placeholder (`DashboardShell` rendered at `/` with hardcoded
  `PLACEHOLDER_BUSINESS`/`PLACEHOLDER_USER` and no auth) is retired. `/` now redirects
  to `/dashboard` or `/login` based on session state; the real, authenticated
  `/dashboard` lives at `apps/web/app/(dashboard)/{layout.tsx,dashboard/page.tsx}`.

  This is the first piece of `P-5`'s UI layer that couldn't be a verbatim port:
  co-founder-ai's own dashboard chrome (`components/tenancy/sidebar.tsx`,
  `sidebar-account-menu.tsx`, `business-selector.tsx` — dark-violet, business/product
  drill-down nav) is exactly what CLAUDE.md non-negotiable #7 says the platform's own
  `AppSidebar`/`AppTopbar`/`DashboardShell` (built in `P-0`/`P-3`, light/blue, per
  `docs/DESIGN.md`'s reference mockup) supersede. Their docstrings said business
  switching / sign-out were "a placeholder until Epic 2's C-5" — but functional parity
  ("make sure all features present in CoFounderAI project work the same") doesn't
  require Epic 2's cross-module `core` tenancy/licensing migration: it only needs
  `discovery`'s own already-ported, already-RLS-tested account→business→product chain to
  be wired up, which the shell was simply never given yet. So both were extended with
  real functionality while keeping the new visual design:
  - `ShellBusiness` gained `id`/`description`; `AppSidebar` takes optional
    `businesses`/`activeBusinessId`/`businessHref`/`onCreateBusiness` and renders a real
    (if simpler than upstream's popover) switchable list in its footer, matching the
    mockup's existing "Businesses" section instead of a dropdown.
  - `AppTopbar`'s avatar is a real `DropdownMenu` (vendored StockPilot primitive) with a
    working "Sign out" item (`onSignOut`), replacing the static name/email display.
  - `apps/web/components/dashboard/dashboard-chrome.tsx` (new, not a port): a client
    wrapper owning the create-business modal's open state and deriving the active
    business from the URL via `getActiveIdsFromPath` (same `/dashboard/businesses/[id]`
    shape co-founder-ai's own Sidebar/BusinessSelector agreed on) — the same job
    upstream's client components did, just recomposed for the new shell's prop shape.
    `apps/web/app/(dashboard)/layout.tsx` is a thin Server Component that fetches the
    real account/businesses/user and passes them straight through.

  Everything else ported verbatim: `dashboard/page.tsx`'s KPI cards + business/product
  filter + `ConversionFunnelPanel`, `dashboard/actions.ts`'s
  `createBusinessAction`/`createProductAction`, `create-business-modal.tsx`,
  `lib/tenancy/active-path.ts`, `lib/alerts/derive.ts`, `lib/usage/format.ts`,
  `hooks/use-dismiss.ts` (→ `packages/core/src/hooks/`, generic enough for any module),
  and `components/ui/submit-button.tsx` (→ `packages/core/src/components/ui/`, same
  reasoning). One necessary rename: co-founder-ai's own hand-rolled
  `components/ui/select.tsx` (a native `<select>`, needed here because the dashboard's
  business/product filter is a plain GET `<form>`) collides on name with
  `@cofounderai/core/ui/select` — StockPilot's vendored Radix-based composable Select,
  a different component entirely. Ported as `NativeSelect` in
  `module-discovery/src/components/ui/native-select.tsx` instead of overwriting or
  aliasing the vendored one.
  `components/tenancy/business-selector.tsx`, `sidebar.tsx`, `sidebar-account-menu.tsx`,
  `sidebar-context.tsx`, `sidebar-toggle.tsx`, `breadcrumbs.tsx`, `editable-name.tsx`,
  `editable-text.tsx`, `product-nav.tsx`, `business-list.tsx`, and
  `components/ui/logo-mark.tsx` (depends on binary PNG brand assets not yet copied over)
  were **not** ported — their functionality is now covered by the shell extension above
  or belongs inside the business/product detail pages once those exist, not the global
  layout. `components/alerts/alert-bell.tsx` and `components/chat/ai-chat-widget.tsx`
  are deferred too (additive, don't block the dashboard home page).

  Verified with a real `next build` (`/dashboard` compiles), a running dev server
  confirming `/` → `/login` and `/dashboard` → `/login` redirects for an anonymous
  visitor (both via curl, not just typecheck), plus the full typecheck/lint/boundaries/
  test suite.

- **Business detail page (`P-5`):** `app/(dashboard)/dashboard/businesses/[businessId]/
  {page.tsx,actions.ts,loading.tsx}` — the business's product list (with per-product
  profile/ICP/prospect-count status chips) plus inline rename/description-edit and a
  create-product form. Copied verbatim, import paths rewritten. Brought
  `components/tenancy/{editable-name,editable-text,breadcrumbs}.tsx` (→
  `module-discovery/src/components/tenancy/`, generic inline-edit controls the product
  detail page will reuse) and `components/ui/loading-skeleton.tsx` (→
  `module-discovery/src/components/ui/`, no name collision with core's `skeleton.tsx` —
  a different, StockPilot-vendored shimmer-block primitive) along verbatim.
  `app/(dashboard)/loading.tsx` and `dashboard/error.tsx` ported too, the former with one
  simplification: it originally centered `LogoMark` inside the spinner, which depends on
  the binary PNG brand assets not yet copied over (tracked below) — rendered as a plain
  spinner for now, no logo.

- **Product detail page + overview tab (`P-5`):**
  `app/(dashboard)/dashboard/businesses/[businessId]/products/[productId]/
  {layout.tsx,page.tsx,actions.ts,error.tsx,loading.tsx}` — the product layout (name/
  description header, `ProductNav`'s four-tab chevron strip, breadcrumbs) and the
  Overview tab (editable description/website, AI-generated product profile via
  `AiActionForm`, knowledge-source list/upload). Copied verbatim, import paths
  rewritten. Brought the remaining generic UI primitives along:
  `product-nav.tsx` (→ `module-discovery/src/components/tenancy/`),
  `expandable-text.tsx`/`expandable-box.tsx`/`collapsible-card.tsx` (→
  `module-discovery/src/components/ui/` — same reasoning as `loading-skeleton.tsx`
  earlier: generic, but only discovery consumes them so far), `ai-action-form.tsx` (→
  `module-discovery/src/components/ai/` — the shared "AI action with inline BYOK-failure
  handling" form wrapper every AI-invoking button in the app uses), and
  `knowledge-source-card.tsx` (→ `module-discovery/src/components/knowledge/`).

- **ICP tab (`P-5`):** `.../products/[productId]/icp/{page.tsx,actions.ts,error.tsx}` —
  generate/regenerate an ICP draft from the approved product profile, approve it, and
  hand-edit every field (industries, company sizes, geographies, roles, pain points,
  buying signals, exclusions — one-per-line textareas via `parseListField`). Copied
  verbatim, import paths rewritten; every dependency (`generateIcp`, `icp/mutations`,
  `AiActionForm`, `runAiAction`) was already in place from earlier batches, so this one
  needed no new shared components.

- **Prospects list page (`P-5`):** the pipeline board — search (client-side, over the
  already server-filtered list), the Advanced status/stage/industry/sort filter panel
  (a GET form, needs a fresh server sort), the stage-grouped table with per-row
  "stretched link" navigation and bulk research/score selection, and the toolbar's
  Add/Import/Discover entry points (`AddProspectModal` reusing `CreateBusinessModal`'s
  chrome). Copied verbatim, import paths rewritten; `components/ui/select.tsx` usage in
  `prospect-filters.tsx` became `NativeSelect` (the same rename `dashboard/page.tsx`
  needed earlier, same reason — a plain GET-form `<select>`, not core's vendored
  Radix-based `Select`).

- **Prospect discover + import pages (`P-5`):** the AI-discovery review screen
  (search the web for up to 10 ICP-matching companies, review/approve/discard each
  suggestion before anything touches the real pipeline) and the CSV-paste import flow
  (dedup against both the existing pipeline and the rest of the same paste). Copied
  verbatim, import paths rewritten; every dependency was already ported.

- **Prospect detail page (`P-5`, `befc3ac1a1413e220afab1f6f9cea1509f801d2e`):**
  `.../prospects/[prospectId]/{page.tsx,actions.ts,error.tsx}` — the largest single page
  in the port (~930 lines): prospect edit form and status update, then a chain of
  `AiActionForm`-gated sections (Research → Score → Outreach strategy → Message
  generation) linked by `DependencyArrow`s, a Conversations section rendering each
  thread's inbound/outbound messages with close-with-outcome/log-reply/generate-reply
  forms, and a Contacts section (list + add form). Copied verbatim, import paths
  rewritten; every `<Select>` usage (outbound-message contact picker, status update,
  generate-strategy contact picker) renamed to `NativeSelect`, same reason as the
  prospects-list and dashboard filters earlier. Brought `components/prospects/
  contact-row.tsx` (→ `module-discovery/src/components/prospects/` — inline-edit-toggle
  contact list item, self-contained, no new dependencies) along verbatim. Every other
  dependency (`ai-action-form`, `expandable-box`, all `lib/` queries/mutations/AI
  operations) was already ported in earlier batches.

- **Conversions + usage tabs (`P-5`, `befc3ac1a1413e220afab1f6f9cea1509f801d2e`):**
  `.../products/[productId]/{conversions,usage}/{page.tsx,error.tsx}` — the conversion
  funnel (built entirely from `listProspects` + the already-ported
  `computeConversionFunnel`/`ConversionFunnelPanel`, no new query or AI call) plus a
  won-deals list, and the monthly AI usage tab (credits-used bar, per-operation run
  counts) reading `getWorkspaceUsage`/`creditsUsedPercent`/`FREE_TIER_MONTHLY_RUN_LIMIT`.
  Copied verbatim, import paths rewritten; both tabs' full dependency chain was already
  in place, so no new shared components were needed.

- **Settings pages (`P-5`, `befc3ac1a1413e220afab1f6f9cea1509f801d2e`):**
  `dashboard/settings/{profile,appearance,ai-provider,usage,billing}/{page.tsx,
  loading.tsx}` (+ `profile/actions.ts`, `ai-provider/actions.ts`) — profile (avatar
  upload + name/bio/phone form), appearance (the already-ported `ThemeToggle`), AI
  provider (connect/replace/disconnect a BYOK key against the already-ported
  `ai-providers` lib), account-wide usage (credits used across every business/product,
  not just one workspace), and a static billing/free-tier explainer page. Copied
  verbatim, import paths rewritten. Unlike every other batch this session, these pages
  and their supporting `components/settings/{avatar-upload-form,profile-form,
  ai-provider-form}.tsx` were placed directly under `apps/web/` rather than in
  `module-discovery` — profile/appearance/billing are platform-wide account concerns
  with no discovery dependency at all, and even ai-provider/usage (which do read
  discovery's `ai-providers`/`usage`/`tenancy` libs) are account-level settings, not a
  workspace-scoped discovery feature, matching where the auth flow was placed earlier.
  This batch's initial commit also added a migration
  (`20260906110000_avatars_storage_bucket.sql`) for the profile page's avatar upload,
  believing no equivalent existed yet — wrong: `20260906100000_discovery_schema.sql`
  already carries the exact same `avatars` bucket + per-user-folder storage policies
  (added speculatively in an earlier lib-porting batch, ahead of the UI that would use
  it). `CREATE POLICY` has no `IF NOT EXISTS`, so the duplicate broke `test:db`'s
  from-scratch migration apply in CI; caught via the PR's CI check failing, fixed by
  deleting the redundant file in a follow-up commit. Lesson: grep existing migrations
  for the feature before adding a new one, not just the lib layer.

- **Webhook routes (`P-5`, `befc3ac1a1413e220afab1f6f9cea1509f801d2e`):**
  `apps/web/app/api/webhooks/{email-inbound,email-status}/route.ts` — the
  provider-agnostic inbound-email webhook (shared-secret header, delegates to the
  already-ported `ingestInboundEmail`) and the Resend delivery-status webhook (manual
  Svix HMAC-SHA256 signature verification, delegates to the already-ported
  `ingestSendStatus`). Copied verbatim, import paths rewritten; no UI, no new
  dependencies. Also filled in `apps/web/.env.example`, which had fallen behind the
  libs it now documents: `EMAIL_INBOUND_WEBHOOK_SECRET`/`RESEND_WEBHOOK_SECRET` (new,
  needed by these two routes), plus `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (needed by the
  already-ported `lib/messages/send.ts`), `API_KEY_ENCRYPTION_SECRET` (needed by the
  already-ported BYOK `crypto/api-key.ts`), and `NEXT_PUBLIC_SITE_URL` (optional,
  already-ported `site.ts` fallback) — all previously used by shipped code but
  undocumented.

- **Alert bell + AI chat widget (`P-5`, `befc3ac1a1413e220afab1f6f9cea1509f801d2e`,
  adapted, not verbatim):** the two functional topbar features co-founder-ai's own
  header carried, re-homed onto the platform's own shell instead of porting
  co-founder-ai's header wholesale (`components/tenancy/{sidebar,sidebar-account-menu,
  sidebar-context,sidebar-toggle,business-selector,business-list}` and
  `components/ui/logo-mark` are superseded by `packages/core/src/components/shell/*`
  per CLAUDE.md non-negotiable #7 — the platform's own design takes precedence over
  co-founder-ai's chrome, so those files are intentionally not ported).
  - **Alert bell**: `components/alerts/alert-bell.tsx` ported to
    `packages/core/src/components/shell/alert-bell.tsx` — it's purely presentational
    (a dropdown over whatever alert list it's handed) and doesn't touch discovery at
    all, so it lives in core like the rest of the shell. Its `Alert` type became a new
    `ShellAlert` in `shell/types.ts` (core can't import discovery's own `Alert` type
    from `lib/alerts/derive.ts` — modules depend on core, never the reverse).
    `AppTopbar`/`DashboardShell` gained an `alerts` prop threading through to it, and
    `apps/web`'s `DashboardChrome`/dashboard `layout.tsx` now call the already-ported
    `deriveAccountAlerts` (fetching `getAccountUsageAndProspects` alongside the
    existing `getAccountWorkspaceEntries` call) and pass the result down.
  - **AI chat widget**: `components/chat/{ai-chat-widget,chat-markdown}.tsx` ported to
    `module-discovery/src/components/chat/` (unlike the alert bell, this one is not
    presentational — it owns its own state and calls discovery's chat lib directly, so
    it belongs in the module, not core). `app/(dashboard)/chat-actions.ts` became
    `module-discovery/src/actions/chat.ts`, following the same "actions that call
    discovery-only functions live in the module" placement as `actions/onboarding.ts`
    earlier. Every dependency (`lib/ai/chat.ts`, `lib/chat/*`, `lib/tenancy/
    active-path.ts`, `lib/ai/router.ts`'s `AiProviderError`, `lib/usage/limits.ts`'s
    `UsageLimitExceededError`) was already ported. Since core can never import a
    module component directly, `AppTopbar`/`DashboardShell` instead gained a generic
    `chatSlot?: ReactNode` prop, and `DashboardChrome` (apps/web, which can import any
    module) passes `<AiChatWidget />` into it. `chat-markdown.tsx` needed two `!`
    non-null assertions on a regex capture group TypeScript couldn't otherwise narrow
    (`noUncheckedIndexedAccess`-adjacent strictness on optional regex groups) — same
    pattern used for array-index assertions elsewhere in this repo.

- **Marketing landing page (`P-5`, `befc3ac1a1413e220afab1f6f9cea1509f801d2e`):**
  `components/marketing/*` (14 section components: `navbar`, `hero`, `founder-problem`,
  `transformation`, `how-it-works`, `benefits`, `differentiation`,
  `prospect-intelligence`, `trust`, `pricing`, `social-proof`, `faq`, `final-cta`,
  `footer`) plus the shared `landing-button`/`fade-in`/`animated-score`/`show-interest`
  primitives, all copied verbatim (import paths rewritten) into `apps/web/components/
  marketing/` — platform-wide, not discovery-owned, same placement reasoning as the
  auth flow. `app/page.tsx` now renders this page for a signed-out visitor instead of
  redirecting straight to `/login` (a signed-in visitor still skips straight to
  `/dashboard`, preserving the P-0 redirect's original purpose). Copied `public/
  logo-lockup.png` alongside it — the only binary asset the marketing page's `<Image>`
  tags reference (`components/ui/logo-mark.tsx`'s two-PNG light/dark swap is dashboard
  chrome, not marketing, and stays unported per the non-negotiable #7 reasoning above).
  `show-interest.tsx`'s backing `app/actions.ts` (`submitInterestAction`) became
  `module-discovery/src/actions/interest.ts` — its lib (`lib/interest/{mutations,
  notify,types}.ts`) and the `discovery.interest_signups` table were already ported in
  an earlier bulk-lib batch, so this was the last missing piece. Verified end-to-end
  with a real dev-server + Playwright pass (temporary placeholder `.env.local`, deleted
  immediately after): the full page renders correctly section-by-section on real
  scroll; only a `fullPage` screenshot (which stitches via CDP without dispatching real
  scroll events) showed blank sections below the fold, a `FadeIn`
  IntersectionObserver + screenshot-tooling interaction, not an app bug.

This completes `P-5`'s UI-layer port. Remaining unported by design (see the
non-negotiable #7 discussion above): co-founder-ai's own
`components/{tenancy/{sidebar,sidebar-account-menu,sidebar-context,sidebar-toggle,
business-selector,business-list},ui/logo-mark}/*` — its dashboard chrome, superseded by
`packages/core/src/components/shell/*`.

## `SP-7` (Epic 4 — port StockPilot's Next.js UI, XL, split by route group)

`packages/module-inventory` created this story. First slice landed: the shared adapter
layer plus one complete master-data route, proving the schema-compat pattern (SP-4) and
this platform's Server Component/Server Action conventions work end-to-end for a ported
StockPilot page before mass-porting the remaining 17.

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/{format,gst}.ts` | stockpilot-ai-ops | `src/lib/{format,gst}.ts` | `9cee43a450994dd73e63f74992d060af4c123d65` | Verbatim, no import changes (pure functions, no `@/` imports). |
| `packages/module-inventory/src/lib/warehouses/{types,queries,mutations}.ts` | stockpilot-ai-ops | `src/routes/_authenticated/warehouses.tsx` (its `warehouses` useQuery + `saveWarehouse`/`toggleActive` useMutations) | `9cee43a450994dd73e63f74992d060af4c123d65` | Adapted, not verbatim: split out of the route file into a queries/mutations layer (matching module-discovery's own `lib/<domain>/{queries,mutations}.ts` split) and rewritten from client-side react-query + a Bearer-token Supabase client to a server-side, RLS-scoped client (`db/server.ts`) called from Server Actions — this platform has no react-query dependency and an established Server Action convention (`AiActionForm`/`EditableText`/`RenameActionState`) that the client-side original didn't need to fit. `org_id` → `business_id` (SP-3a's own column rename, ADR-4). |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/inventory/warehouses/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/warehouses/{warehouse-modal,warehouses-list}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/warehouses.tsx` (component body) | `9cee43a450994dd73e63f74992d060af4c123d65` | UI/behavior kept: same fields, same table columns, same create/edit/activate/deactivate flow. `AppShell` (StockPilot's own sidebar/topbar/business-switcher/theme wrapper) was **not** ported — the page renders inside this platform's own `DashboardShell` (CLAUDE.md non-negotiable #7: one shared design system, a module never brings its own shell). The dialog is this platform's own hand-rolled overlay pattern (see `create-business-modal.tsx`), not the vendored shadcn `Dialog` primitive StockPilot used, for the same reason. The mobile-only card layout StockPilot rendered alongside the desktop table is dropped for this first pass (horizontal scroll instead); can be added back later if needed. |

**Foundational pieces built alongside (not file-for-file ports):**
- `packages/module-inventory/src/db/{client,server,admin}.ts` — thin wrappers around `@cofounderai/core/db/*` scoped to `{ schema: "inventory" }`, exactly mirroring `packages/module-discovery/src/db/*`. This *is* what "rewrite `client.ts`/`client.server.ts`/`auth-middleware.ts`/`auth-attacher.ts` against `@cofounderai/core`" (04-CLAUDE-CODE-BACKLOG.md's `SP-7` row) turned out to mean in practice: those four StockPilot files exist to solve TanStack Start's client→server RPC hop (a Bearer-token-carrying middleware pair) — a problem that doesn't exist for Next.js Server Actions/Server Components, which already run authenticated via `@supabase/ssr` cookies. `cron-auth.ts` likewise isn't ported as a separate file; any future inventory cron route reuses this platform's own existing inline `CRON_SECRET` header-comparison convention (see `apps/web/app/api/cron/drain-events/route.ts`) instead of introducing a second cron-auth convention.
- `useOrg`/`useAuth`/`usePermissions` (stockpilot-ai-ops hooks) are **not ported at all** — each maps onto infrastructure Epic 2 already built and this platform already uses everywhere: `useOrg`'s org switching → the `businessId` route param + topbar `BusinessSwitcher` (already built, C-5); `useAuth` → server-side `supabase.auth.getUser()`; `usePermissions`/`useRolePermissions` → `core.has_permission()`/`requirePermission()` (C-7, previously unused by any real call site until this story). Added `hasPermission()` (non-throwing sibling of `requirePermission()`) to `packages/core/src/rbac/require-permission.ts` for UI-gating use (show/hide the "New warehouse" button and edit controls), since only the throwing variant existed before.

**Live-schema correction:** `docs/plan/04-CLAUDE-CODE-BACKLOG.md`'s `SP-7` row describes the source as needing `postal_code`/`contact_name`/`contact_phone` columns; a first read of only `20260906110000_inventory_schema.sql` (SP-3a) suggested those were dropped. They weren't — `20260906111000_inventory_procedural_layer.sql` (SP-3b) `alter table`s them back in. Confirmed against the live dev project (`jazdtomcgqjxjueedmck`) via Supabase MCP `list_tables` before writing the form, per CLAUDE.md's "live source of truth" rule — `inventory.warehouses` is column-identical to stockpilot-ai-ops's original except `org_id` → `business_id`.

### Slice 2 — Products

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/products/{types,queries,mutations}.ts` | stockpilot-ai-ops | `src/routes/_authenticated/products.tsx` (its `products`/`categories`/`suppliers` useQuerys + `saveProduct`/`toggleStatus` useMutations) | `9cee43a450994dd73e63f74992d060af4c123d65` | Same queries/mutations-layer adaptation as warehouses. Reads `inventory.products` directly rather than `inventory.products_safe` (a column-masking view stockpilot-ai-ops had — confirmed via Supabase MCP that no such view exists in this platform's compat layer, SP-4 built row-level compat views only): `listProducts()` takes `canViewCost` and nulls `cost_price` server-side before the row ever reaches a Client Component, same effect, enforced in code instead of a second DB view. |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/inventory/products/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/products/{product-modal,products-list}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/products.tsx` (component body) | `9cee43a450994dd73e63f74992d060af4c123d65` | Same UI adaptation as warehouses (own shell, hand-rolled modal, no mobile card layout). Barcode/QR generation and CSV import (both originally deferred here) were added in a later pass — see below. |

**Barcode/QR labels and CSV import (added post-launch, direct user request):** the two features deferred above.
- `packages/module-inventory/src/components/products/{barcode-image,barcode-label-dialog}.tsx` are ported near-verbatim from stockpilot-ai-ops's `src/components/{barcode-image,barcode-label-dialog}.tsx` (same commit SHA) — swapped the direct-Supabase `useMutation` for this platform's own Server Action + `useTransition` pattern (see `purchase-orders-list.tsx`'s `runPrimaryAction` for the precedent), and the shadcn `Select`/`Card` bits for `NativeSelect`/plain markup to match this platform's own product-modal conventions. `generateBarcodesForProducts()` (module-inventory's `lib/products/mutations.ts`) is a new, small server-side mutation covering what the original did as a client-side `products.update` loop: never overwrites an existing barcode, encodes SKU. New deps: `jsbarcode`, `qrcode` (+ `@types/qrcode`) on `packages/module-inventory` — the label print CSS (`.print-area.label-sheet`, `.label-card`) already existed in `packages/core/src/ui-theme.css` from the initial theme scaffold, unused until now. `@zxing/browser` camera-scanning (`camera-scan-dialog.tsx`/`scan-input.tsx` in the original) was **not** ported — out of scope for "the products page is missing barcode/import," a distinct scan-to-find workflow rather than label generation.
- CSV import (`packages/module-inventory/src/lib/products/csv.ts`, `apps/web/.../inventory/products/import/{page.tsx,actions.ts}`) is **not** a line-by-line port of the original's `ProductImportDialog` (`src/components/product-import-dialog.tsx` + `src/lib/{product-import,spreadsheet}.ts`) — that version is a 4-step file-upload wizard (drag-drop .csv/.xlsx, column-mapping UI with alias-matching, inline preview-grid editing, chunked commit) built for a client-side-Supabase app with `react-query`/`sonner`. This platform already has an established, simpler pattern for the same job — module-discovery's prospects CSV import (`prospects/import/{page.tsx,actions.ts}`): paste CSV into a textarea, exact-header-name columns, one Server Action parses+dedupes+inserts, redirects with `?imported=&skipped=&duplicates=` counts. Products import follows that same shape instead, per CLAUDE.md's "prefer the simplest implementation that works" — no new dependency, no wizard state machine, no `.xlsx` binary parsing. Required columns: `sku, name`; optional: `brand, category, supplier, unit, hsn_code, tax_rate, cost_price, selling_price, reorder_point, reorder_quantity, barcode, description` — `supplier` resolves by exact-name match against the business's own supplier list (unmatched names are left unset, not an error); `category` reuses the existing find-or-create `resolveCategoryId` (now exported from `mutations.ts`) per row. New test: `packages/module-inventory/src/lib/products/csv.test.ts` (vitest, colocated with the parser it tests — matches `prospects/pipeline.test.ts`'s convention).
| `packages/core/src/components/ui/native-select.tsx` | (moved, not newly ported) | was `packages/module-discovery/src/components/ui/native-select.tsx` (`P-5`) | n/a | Relocated to `core/ui` once module-inventory needed the same plain `<select>`-for-Server-Action-forms component module-discovery already had — a non-domain-specific form control belongs in the shared UI kit, not duplicated a third time. Updated its 3 call sites (`prospect-filters.tsx` and two `apps/web` pages). |

**Live-schema check (Products):** confirmed `inventory.products`'s exact column list (still named `org_id`, not `business_id` — unlike `warehouses`, this one **is** a SP-4 compat view over `core.items`/`core.item_inventory_attrs` with `INSTEAD OF` insert/update/delete triggers, so it deliberately keeps the original column name) and `inventory.categories`/`inventory.suppliers`'s columns against the live dev project via Supabase MCP before writing any query — same due-diligence step as warehouses, this time confirming rather than correcting.

### Slice 3 — Suppliers

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/suppliers/{types,queries,mutations}.ts` | stockpilot-ai-ops | `src/routes/_authenticated/suppliers.tsx` (its `suppliers` useQuery + `saveSupplier`/`toggleActive` useMutations) | `9cee43a450994dd73e63f74992d060af4c123d65` | Same queries/mutations-layer adaptation as warehouses/products. GSTIN validation (`isValidGstin`, already ported in the foundation slice) kept exactly where the original had it -- inside the mutation, so a bad GSTIN fails the same way (thrown message surfaced as the form's inline error) whether the caller is this UI or anything else that calls `createSupplier`/`updateSupplier` directly. |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/inventory/suppliers/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/suppliers/{supplier-modal,suppliers-list}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/suppliers.tsx` (component body) | `9cee43a450994dd73e63f74992d060af4c123d65` | Same UI adaptation as warehouses/products. Gated on the `suppliers.edit` permission key (not `inventory.edit`) -- matches both the original's own `can("suppliers.edit")` check and the seeded `core.permissions` catalog, which keys suppliers separately from general inventory. `text-warn`/`fill-warn` (StockPilot's own theme token for the rating star) doesn't exist in this platform's theme -- swapped for the equivalent `text-warning`/`fill-warning` token `packages/core/src/ui-theme.css` actually defines. |

**Live-schema check (Suppliers):** confirmed `inventory.suppliers` has the same `INSTEAD OF` insert/update/delete trigger set as `products` (a real compat view over `core.parties`, not an auto-updatable one like `categories`) via Supabase MCP before writing mutations.

### Slice 4 — Customers

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/customers/{types,queries,mutations}.ts` | stockpilot-ai-ops | `src/routes/_authenticated/customers.tsx` (its `customers` useQuery + `saveCustomer`/`toggleActive` useMutations) | `9cee43a450994dd73e63f74992d060af4c123d65` | Same queries/mutations-layer adaptation as warehouses/products/suppliers. This one is column-identical to the original with no live-schema surprises (`inventory.customers` -- id, org_id, name, gstin, phone, email, billing_address, shipping_address, state, is_active, created_at, updated_at -- matches exactly). GSTIN validation same shape as suppliers'. |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/inventory/customers/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/customers/{customer-modal,customers-list}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/customers.tsx` (component body) | `9cee43a450994dd73e63f74992d060af4c123d65` | Same UI adaptation as the earlier slices. Gated on `customers.edit` (confirmed in the seeded `core.permissions` catalog, module `inventory`), matching the original's own `can("customers.edit")` check. |

**Live-schema check (Customers):** confirmed `inventory.customers`'s exact column list and its `INSTEAD OF` insert/update/delete trigger set (a compat view over `core.parties`, like suppliers) via Supabase MCP before writing any query.

This completes `SP-7c`'s sidebar-linked scope: Warehouses, Products, Suppliers, Customers are the 4 of stockpilot-ai-ops's config/master-data routes that have a sidebar nav entry. `Team` does not (no `Administration` nav group exists in this platform's `INVENTORY_NAV` yet) and per explicit instruction this session ("use the sidebar menus for inventory module which we added") is deferred, not built speculatively — same for `Account`/`Admin`/`Alerts`/`Audit Log`/`Dashboard`/`GST Filing`/`Onboarding`, none of which the sidebar links to today.

**Remaining for `SP-7`** at that point: `SP-7d` -- Inventory(stock)/Stock Transfers/Sales Orders/Sales Invoices/Sales Returns/Purchase Orders (transactional routes, all sidebar-linked); `SP-7e` -- GST Filing + einvoice/eway-bill panels and actions (not sidebar-linked yet); `SP-7f` -- Admin/Audit Log/Alerts/Dashboard/Onboarding/Team + `public_api_v1` promotion to `core` (none sidebar-linked); the deferred barcode/import features noted in Slice 2. `SP-9` (manifest + `contract/index.ts`) still not started.

## `packages/module-gst` (new package -- GST slice, explicit user request)

Per direct instruction: promote 3 sections stockpilot-ai-ops had folded into its
account/profile settings page (GST profile, e-Way Bill credentials, e-Invoicing
credentials) into their own menu items under this platform's `gst` module instead of
staying account-settings afterthoughts, plus move GST Filing there too (ported in a
later slice). Matches `docs/plan/00-MASTER-PLAN.md` §5's entity-ownership map verbatim:
"gst module: e-invoice, e-way bill, credentials, return workspaces (seeded from
StockPilot's existing tables)" -- this was always gst-owned territory, not inventory's.

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `supabase/migrations/20260907150000_gst_credentials_schema.sql` (`gst.eway_bill_credentials`, `gst.einvoice_credentials` + status RPCs) | stockpilot-ai-ops | `supabase/migrations/20260908000000_eway_bills.sql`, `20260909000000_einvoicing.sql` (credential-table halves only) | `9cee43a450994dd73e63f74992d060af4c123d65` | Column-identical except `org_id` -> `business_id` and schema `public` -> `gst`. Ported **verbatim** the one security property that matters most: no `SELECT` grant or policy for `authenticated` on either table at all -- a GSP (GST Suvidha Provider) password/client_secret can never reach the browser, only `service_role` can read it; non-secret status (provider, URLs, `updated_at`) is exposed via `eway_bill_credentials_status()`/`einvoice_credentials_status()`, `SECURITY DEFINER` functions that never select the secret columns, extended with this platform's own tenant+license check (upstream had no licensing concept). RLS write policies add `settings.manage` on top (upstream's own gate) and `write_licensed_business_ids('gst')` (this platform's addition). The generation-history tables (`eway_bills`/`einvoices`, their own generate/cancel permissions) are explicitly **not** ported this slice -- out of scope for "move these 3 settings sections", a later slice ports those alongside the actual generate/cancel server actions. New test: `scripts/test-gst-credentials-rls.mjs`, wired into `test:db` -- specifically proves nobody (owner, licensed, permitted) can `SELECT` a raw secret column back, on top of the usual tenant/license/permission matrix. |
| `packages/module-gst/src/lib/profile/{types,queries,mutations}.ts`, `packages/gst/profile` route | stockpilot-ai-ops | `src/routes/_authenticated/account.tsx` ("GST profile" card only -- `saveOrg`'s gstin/state/gst_registration_type fields) | `9cee43a450994dd73e63f74992d060af4c123d65` | **No new table** -- these 3 fields already live on `core.business_settings` (C-2), confirmed via Supabase MCP (`gstin`, `state`, `gst_registration_type` columns exist, one row per business, no auto-create-on-business-creation trigger -- hence an upsert, not a plain update, matching `core.business_settings`'s own INSERT+UPDATE RLS policies). Gated on `settings.manage` (the same key already seeded for this exact purpose: `('settings.manage', 'inventory', 'Edit the business''s inventory and GST profile')` -- module tag is cosmetic, the key itself works regardless). Inline form, not the list+dialog CRUD pattern (upstream never had this as a dialog either -- one always-visible settings form, same shape as this platform's own licenses settings page). |
| Sidebar: `GST_NAV` in `packages/core/src/components/shell/app-sidebar.tsx` | -- | `src/components/app-shell.tsx`'s `NAV_GROUPS` "Compliance"/settings entries (as a pattern, not a file port) | -- | 4 items under the `gst` module selection: GST Profile (real), e-Way Bill / e-Invoicing / GST Filing (404 until their own slices land -- same "link now, build later" convention `INVENTORY_NAV` already established). |

**Moved to `core` (needed by 2+ modules now):** `packages/module-inventory/src/lib/{gst,format}.ts` -> `packages/core/src/lib/{gst,format}.ts`. `module-gst`'s GST profile form and future e-Way Bill/e-Invoicing forms need `INDIAN_STATES`/`isValidGstin`/`GST_RATE_SLABS`/`inr`, and a module can only import another module's `contract/` (neither inventory nor gst has one yet) -- same reasoning as `native-select.tsx`'s move in Slice 2. Updated 6 call sites in `module-inventory` accordingly; both files are pure ports with no internal imports of their own, so the move itself needed no rewrite, just new import paths at each call site.

**Infra gap found and fixed while wiring this up:** PostgREST only routes requests to schemas listed in the `authenticator` role's `pgrst.db_schemas` setting (confirmed via `select rolconfig from pg_roles where rolname = 'authenticator'`) -- this was set to `'public, graphql_public, core, discovery, inventory'` out of band at some point (not captured in any prior migration in this timeline, a pre-existing gap, not introduced here). The new migration appends `gst` to that list itself (guarded by a role-existence check so it no-ops on the local/CI test harness, which has no `authenticator` role), applied live via Supabase MCP and confirmed by re-querying `pg_roles`.

### e-Way Bill / e-Invoicing credential forms

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-gst/src/lib/{eway-bill,einvoicing}/{types,queries,mutations}.ts` | stockpilot-ai-ops | `src/routes/_authenticated/account.tsx` ("e-Way Bill (GST compliance)" / "e-Invoicing (IRN + QR code)" cards -- `ewbStatus`/`einvStatus` useQuerys + `saveEwayBillCredentials`/`saveEinvoiceCredentials` useMutations) | `9cee43a450994dd73e63f74992d060af4c123d65` | `queries.ts` calls the `gst.eway_bill_credentials_status()`/`einvoice_credentials_status()` `SECURITY DEFINER` RPCs (the migration from the prior slice) rather than selecting the tables directly -- there's no SELECT grant to do so. `mutations.ts` is a plain upsert into the credentials table (single-row-per-business, so there's no create-vs-update branch to carry, unlike a list resource). |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/gst/{eway-bill,einvoicing}/{page.tsx,actions.ts}`, `packages/module-gst/src/components/{eway-bill/eway-bill-form,einvoicing/einvoicing-form}.tsx` | stockpilot-ai-ops | same account.tsx cards (component body) | `9cee43a450994dd73e63f74992d060af4c123d65` | Write-only forms: only `gsp_provider` is ever pre-filled from the status query, matching the original's own behavior exactly -- its status RPC also returns `auth_url`/`generate_url`/`cancel_url`, but the original never wired those back into form state either, and the 4 username/password/client id/secret fields are never returned by the status RPC at all (no SELECT grant on the underlying columns), so they start blank on every render, always. Ported faithfully rather than "fixed" without being asked. Gated on `settings.manage`, matching the GST Profile slice and the original's own single settings-permission check across all 3 account.tsx GST cards. `border-warn`/`text-warn` swapped for this platform's own `border-warning`/`text-warning` token, same substitution as the suppliers rating star (Slice 3). |

Both business_id-primary-keyed (per-business credentials, not account-wide) -- every GST menu item (Profile, e-Way Bill, e-Invoicing) resolves against whichever business is active in the navbar, same as every Inventory menu item.

**Remaining GST scope:** GST Filing (StockPilot's separate top-level route, not part of account.tsx) still 404s -- its own slice. The generation-history tables/actions (`eway_bills`/`einvoices`, the actual "generate a bill/IRN from a sales order" workflow) remain deferred, as noted in the credentials-schema slice above.

## `SP-7d` -- the 6 transactional inventory routes (all sidebar-linked)

Completes `SP-7`'s full sidebar-linked scope for the `inventory` module: every item in
`INVENTORY_NAV` now has a real route. Built in dependency order (simplest first), each
slice independently verified (typecheck/lint/lint:boundaries/test:db/`next build`) and
committed separately.

### Slice 1 -- Inventory (stock levels)

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/stock/{types,queries,mutations}.ts`, `apps/web/.../inventory/stock/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/stock/{stock-list,movement-modal}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/inventory.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | `inventory.stock_levels` is a real inventory-schema table (`business_id`-keyed, SP-3a/SP-3b), joined with `products`/`warehouses`/`purchase_order_items`/`purchase_orders` in JS (no PostgREST embed across these compat views -- confirmed no FK exists between them for PostgREST to use). "Incoming" derivation (open POs' outstanding ordered-minus-received quantity, filtered to `approved`/`sent`/`partially_received` statuses) ported exactly. Stock on hand is never edited directly -- `recordStockMovement()` just inserts into `stock_movements`; SP-3b's own `apply_stock_movement()` trigger posts the resulting `stock_levels` update. **Deferred:** barcode-scan-to-add (`ScanInput`/`resolveProductByScan`), consistent with the Products slice's own deferral. |

### Slice 2 -- Stock Transfers

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/stock-transfers/{types,queries,mutations}.ts`, `apps/web/.../inventory/transfers/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/stock-transfers/{transfers-list,transfer-form,transfer-detail}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/stock-transfers.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | First dynamic multi-line form in this module: line items are add/remove rows serialized into one JSON-encoded hidden `<input>`, since Server Actions read plain `FormData` -- this pattern is reused by every later slice (Purchase Orders, Sales Orders, Sales Returns). Ship/receive/cancel call SP-3b's existing `ship_stock_transfer()`/`receive_stock_transfer_item()`/`cancel_stock_transfer()` RPCs; plain status transitions (submit for approval, approve, complete) go through a direct `UPDATE`, enforced by SP-3b's own status-transition permission trigger rather than a duplicated app-level check. |

### Slice 3 -- Purchase Orders

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/purchase-orders/{types,queries,mutations}.ts`, `apps/web/.../inventory/purchase-orders/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/purchase-orders/{purchase-orders-list,po-form,po-detail}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/purchase-orders.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | `mutations.ts` computes each line's CGST/SGST/IGST **server-side** from the business's own GST profile (`core.business_settings`, via a new `getBusinessGstProfile()` added to `lib/tenancy/queries.ts` -- a small, module-local copy of `module-gst`'s own `getGstProfile`, since modules can't import each other's internals) and the supplier's state/GSTIN, rather than trusting client-computed tax amounts for a financial document -- a deliberate hardening over the original's own client-side `computeLineGst` call; the form itself just submits raw line items, no live tax preview. `receive_purchase_order_item()` takes `_document_line_id`, not `_item_id` (confirmed via `pg_proc` before writing the mutation -- the platform's own RPC signature differs from stockpilot's naming since it operates on `core.document_lines` directly). Stage stepper/totals breakdown/receive-capped-at-ordered-quantity all ported directly from the original's own JSX. |

### Slice 4 -- Sales Orders

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/sales-orders/{types,queries,mutations}.ts`, `apps/web/.../inventory/sales-orders/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/sales-orders/{sales-orders-list,so-form,so-detail}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/sales-orders.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | Same server-side GST computation as Purchase Orders, seller/buyer swapped (the business is the seller here). Confirm/Ship/Cancel call SP-3b's existing `confirm_sales_order()`/`ship_sales_order()`/`cancel_sales_order()` RPCs (`_document_id` param, matching the platform's own naming, not `_so_id`). `so_number` generation is left to the existing `sales_orders` compat-view insert trigger (`coalesce(new.so_number, inventory.next_sales_order_number(...))`) rather than calling that RPC redundantly from the mutation -- confirmed the trigger already does this before writing the code. "Create return" navigates to Sales Returns with `?so=<id>`, same UX as the original's own router navigation. |

### Slice 5 -- Sales Invoices

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/sales-invoices/{types,queries,mutations}.ts`, `apps/web/.../inventory/sales-invoices/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/sales-invoices/{invoices-list,generate-invoice-modal,invoice-detail}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/sales-invoices.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | Unlike every other create form in this module, generating an invoice has no line-item entry -- `generate_sales_invoice()` (SP-3b) copies the order's own lines and header totals, so "New invoice" is just a select-a-confirmed-sales-order form. Detail view's "record credit note" calls `create_credit_note()`, added by the `SP-7d` sales-returns-workflow migration below (this slice landed after that migration specifically so this form would have something real to call). **Deferred, consistent with the credentials-schema slice's own scoping:** print/CSV-export/e-way-bill/e-invoice generation panels -- separate, not-yet-built generation-history features. |

### Slice 6 -- Sales Returns

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/sales-returns/{types,queries,mutations}.ts`, `apps/web/.../inventory/sales-returns/{page.tsx,actions.ts}`, `packages/module-inventory/src/components/sales-returns/{returns-list,return-form,return-detail}.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/sales-returns.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | Create a return against a shipped/delivered SO, pre-filling draft lines from that order's own items (each capped later at approval, not at draft time, matching the original). Approve calls `approve_sales_return()` (the sales-returns-workflow migration, see below). Reads the `so` query param via `useSearchParams`/`usePathname`/`useRouter` (next/navigation) to preselect and open the create form, then clears it with `router.replace` -- the Next.js equivalent of the original's TanStack Router `validateSearch` + `navigate({search:{}})` round trip. |

### The sales-returns-workflow migration (`supabase/migrations/20260907160000_sales_returns_workflow.sql`)

SP-3b's own procedural-layer migration explicitly deferred this ("Deliberately NOT
built here: sales_returns' full approval workflow... a future story extends it to
sales_returns the same way SP-3b did for sales_orders/purchase_orders/stock_transfers").
This is that future story, built because the Sales Returns/Sales Invoices UI slices
above need it.

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `inventory.create_credit_note()` | stockpilot-ai-ops | `supabase/migrations/20260905000000_sales_invoicing_gstr1.sql` (SP-5, its own `create_credit_note`) | (later migration than the base `9cee43a4...` snapshot -- read live per this repo's "live source wins" rule) | Full-or-partial credit note against an invoice's remaining taxable value/tax: a full note reverses exactly whatever's uncredited (`invoice.cgst - credited_cgst`, not a re-derived ratio); a partial one takes an explicit taxable value and derives CGST/SGST/IGST as that value's proportional share of the invoice's own tax, never a caller-supplied rate. Ported with one intentional divergence: not `SECURITY DEFINER` (the live source is, specifically because issuing a credit note there is gated by `invoices.cancel` at the RLS layer and `sales_manager` deliberately lacks it -- this platform's `core.documents` RLS is uniformly `tenant AND licensed` regardless of role, so that gap doesn't exist here). |
| `inventory.approve_sales_return()`, `inventory.sales_returns_instead_of_insert()` (extended), `core.enforce_inventory_document_status_transition()` (extended), `sales_returns.*` permission catalog | stockpilot-ai-ops | `supabase/migrations/20260913000000_sales_returns.sql` (SP-11) + `20260913000100_sales_returns_fix.sql` (its own follow-up correction) | (same live-read note as above) | Caps each line's return quantity against what's actually still returnable (already-approved/completed returns for the same order+item count against the cap) -- SP-11's own later fix, ported **already-applied**, not as a separate follow-up migration. Posts a `return` (good) or `damage` (damaged) stock movement per restock line, then issues one credit note via `create_credit_note()` against the invoice generated for the return's sales order -- **requires** that invoice to already exist (raises "Generate the sales invoice for this order before approving a return against it" otherwise), matching the live source exactly (a return can be drafted before an invoice exists, but not approved). `sales_returns_instead_of_insert()` (SP-4's original) is extended via `CREATE OR REPLACE` to resolve `sales_invoice_id` server-side (never trusted from the client) and validate the linked SO is shipped/delivered -- matches the live source's own `enforce_sales_return_creation()` trigger. `core.enforce_inventory_document_status_transition()` (SP-3b's original) is extended the same way with a new `doc_type = 'sales_return'` branch, exactly filling the gap its own docstring left open ("anything else passes through untouched, leaving other modules free to enforce their own transitions"). New permission keys (`sales_returns.create/approve/cancel/delete`, module `inventory`) mapped to `owner`/`admin` (everything) and `sales_manager` (create/approve/cancel/delete) + `accountant` (approve only) -- this platform's own role names, not the live source's `manager`/`staff`. New test: `scripts/test-sales-returns-workflow.mjs`, wired into `test:db`. |

## `SP-7e` -- GST Filing (completes the GST module's 4 sidebar menu items)

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-gst/src/lib/filing/{types,queries}.ts`, `packages/module-gst/src/components/filing/gst-filing-view.tsx`, `apps/web/.../gst/filing/page.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/gst-filing.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | Purchase register (inward, supplier-wise + HSN-wise ITC summary) and sales register (outward, B2B/B2C split + HSN-wise + credit notes), for GSTR-2B/3B and GSTR-1 respectively, for a selected month. Reads `core.documents`/`core.document_lines` **directly**, not through `module-inventory`'s compat views or package -- GST Filing needs inventory-sourced purchase orders/sales invoices/credit notes, but `core.documents` is core-owned shared data, not `module-inventory`'s internals, so this is legal mechanism 1 ("read shared data from core directly"), not a boundary violation (confirmed clean against `lint:boundaries`). Per-line HSN codes come from `core.items` for purchase orders (which never snapshot one) vs. the invoice line's own snapshot for sales invoices (which do) -- matches the original schema's own asymmetry between `purchase_order_items` (no `hsn_code` column) and `sales_invoice_items` (has one, copied by `generate_sales_invoice()`). Period selection is a plain GET form (`?period=YYYY-MM`, full page reload) rather than client-side `react-query` state, matching this codebase's own established filter convention (`native-select.tsx`'s docstring) for an otherwise fully read-only, server-rendered report. No new permission gating -- neither did the original, beyond module access. |

**`SP-7` status after this batch:** every sidebar-linked route in both `INVENTORY_NAV` (10/10) and `GST_NAV` (4/4) now exists. Remaining, all deliberately deferred as not sidebar-linked: `SP-7f` (Admin/Audit Log/Alerts/Dashboard/Onboarding/Team + `public_api_v1` promotion to `core`), the `eway_bills`/`einvoices` generation-history tables and their generate/cancel actions, print/CSV-export/e-way-bill/e-invoice panels on Sales Invoices, and barcode/QR scanning throughout. `SP-9` (module-inventory's `manifest.ts`/`contract/index.ts`) also not started.

### SP-7f (started) -- Dashboard and Audit Log, direct user request

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/dashboard/{types,queries}.ts`, `packages/module-inventory/src/components/dashboard/dashboard-view.tsx`, `apps/web/.../inventory/dashboard/page.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/dashboard.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | KPI row, daily-brief GST summary, reorder watchlist, attention center, 14-day stock-movement chart -- ported near-verbatim, computed server-side in one Server Component fetch (`getDashboardSummary`) instead of the original's client-side `react-query` hook. `products_safe`'s column-masking doesn't exist in this platform's compat layer (SP-4 built row-level views, not column-level), so `stockValue` is masked to `null` server-side for a caller without `inventory.view_cost`, same approach as `products/queries.ts`'s own `listProducts`. Links point at this platform's own routes (`/gst/profile`, `/gst/filing`, `/inventory/transfers`) instead of stockpilot's `/account`/`/gst-filing`/`/stock-transfers`. New sidebar entry: `INVENTORY_NAV`'s new "Overview" heading (first group, ahead of "Catalog & Inventory"), matching stockpilot's own IA where Dashboard is the landing page. |
| `packages/core/src/audit/{queries,format}.ts` (extended), `packages/core/src/components/audit-log/audit-log-view.tsx`, `apps/web/.../inventory/audit-log/page.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/audit-log.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | `core.audit_log` (D-10) and its `listAuditLogForBusiness` query already existed but were unused by any UI until this slice. Lives in `packages/core`, not `module-inventory`, even though its sidebar entry sits under `INVENTORY_NAV` -- `core.audit_log` is genuinely business-wide (its `document.status_changed` trigger fires for every module using `core.documents`, not just inventory), so the URL segment reflects nav placement per the user's request, not code ownership; the page itself reads `@cofounderai/core/audit/*` directly, the same "mechanism 1" precedent GST Filing already established for reading core-owned data from a business-scoped route. New migration `20260907180000_inventory_stock_adjustment_audit_log.sql` wires `inventory.stock_movements`' human-initiated correction types (`adjustment`/`damage`/`expired`) into `core.write_audit_log()` as `stock.adjusted` -- the one action type the original had that this platform's D-10 triggers didn't yet cover (`purchase_order.status_changed`/`organization.settings_changed` were already superseded by D-10's more general `document.status_changed`/`business_settings.updated`). System-driven movement types (reserve/receive/ship/transfers) are deliberately excluded, matching stockpilot's own `log_stock_adjustment()` scoping exactly. New `listAuditActors()` (business_members -> user_profiles join, no FK) for the actor filter/display, mirroring the original's own client-side join. Filters are a plain GET form (same convention as GST Filing's period picker), not client `react-query` state. New assertions added to `test-inventory-procedural.mjs` covering the new trigger. |

### SP-7f (continued) -- Admin section (platform-admin demo-data seed/delete)

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/core/src/rbac/platform-admin.ts` | stockpilot-ai-ops | `src/lib/admin-auth.ts` | `9cee43a450994dd73e63f74992d060af4c123d65` | Ported near-verbatim: a pure `PLATFORM_ADMIN_EMAILS` env-var gate (comma-separated, case-insensitive), deliberately separate from `core.business_members`'s own role column since `/dashboard/admin` acts across every business, not one. `isPlatformAdminEmail()` (pure, no DB call) is used once in `apps/web/app/(dashboard)/layout.tsx` (which already calls `auth.getUser()`) to decide whether to render the account menu's "Admin" link (new `ShellUser.isPlatformAdmin` field, `SidebarAccountMenu`'s new menu item); `requirePlatformAdmin()` is the actual security boundary, called first by every admin server action, matching the original's own "UI hiding isn't the boundary" split. New env var documented in `apps/web/.env.example`. |
| `supabase/migrations/20260907190000_admin_demo_seed_tool.sql` (`core.demo_seed_batches`/`core.demo_seed_records`), `packages/core/src/admin/{queries,demo-seed-tracking}.ts`, `packages/module-inventory/src/lib/admin/seed.ts`, `packages/module-inventory/src/components/admin/delete-demo-data-button.tsx`, `apps/web/app/(dashboard)/dashboard/admin/{page.tsx,actions.ts}` | stockpilot-ai-ops | `src/routes/_authenticated/admin.tsx`, `src/lib/admin-seed-actions.ts`, `supabase/migrations/20260912000000_admin_seed_data_tool.sql` | `9cee43a450994dd73e63f74992d060af4c123d65` | **Not** a line-by-line port of the original's ~2000-line seeder (every PO/SO status permutation, damaged/expired stock, credit/debit notes, stock transfers). Seeds a smaller, representative slice instead -- 2 warehouses, 2 categories, 2 suppliers, 2 customers, 6 products with opening stock (deliberately including two below their reorder point, so `inventory.check_stock_alerts()` fires real alerts rather than hand-inserting fake ones), one pending (`sent`) purchase order, one draft sales order -- enough to populate every master-data list page and the operations dashboard for a demo. Bookkeeping (`demo_seed_batches`/`demo_seed_records`) promoted to `core` (not `public`, single-schema like the original) since this platform's tables span multiple schemas -- each tracked record now carries both `schema_name` and `table_name`. Writes go through a service-role client (`@cofounderai/core/db/admin`, `@cofounderai/module-inventory/db/admin`) directly into the `inventory.*` compat views/real tables, since the acting admin isn't a member of the target business (the normal RLS-scoped `lib/{products,suppliers,...}/mutations.ts` functions can't be reused here) -- confirmed live against the dev project (`jazdtomcgqjxjueedmck`) via Supabase MCP before finalizing, which caught two real bugs no amount of local typechecking would have: (1) `inventory.categories`' auto-updatable view expects `org_id`, not `business_id`, on insert; (2) `inventory.purchase_order_items` expects `unit_cost`, not `unit_price` (the sales-order-side view *does* use `unit_price` -- the two aren't symmetric). Also discovered live: `core.next_number()` (used by `inventory.next_sales_order_number()` for auto-generated `so_number`s) explicitly checks `core.user_business_ids()` and throws "Not a member of this business" under a service-role client with no session -- so, unlike every other seeded document, the sales order's `so_number` is supplied explicitly (Postgres's `COALESCE` short-circuits, so the RPC is never called). `inventory.alerts.entity_id` has no FK (a generic polymorphic reference), so `deleteAllSeedDataForBusiness()` also sweeps for alerts whose `entity_id` no longer resolves to a live `stock_levels` row for that business, rather than leaving them orphaned after their triggering item is deleted -- verified live (3 real alerts left dangling after a full seed+delete cycle, confirmed correctly identified and removable by that exact query) since this is exactly the kind of thing that's easy to get subtly wrong. Deletion order (`core.documents` -> `core.items` -> `core.item_categories` -> `core.parties` -> `inventory.warehouses`) matters for one FK (`core.document_lines.item_id`, `ON DELETE RESTRICT`) -- verified live end-to-end (seed, confirm every row landed correctly including the 3 alerts, delete, confirm zero residue and the business's 20 pre-existing, unrelated `core.parties` rows from `discovery` untouched). |

### SP-7f (continued) -- Alerts

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/module-inventory/src/lib/alerts/{types,queries,mutations}.ts`, `packages/module-inventory/src/components/alerts/alerts-list.tsx`, `apps/web/.../inventory/alerts/{page.tsx,actions.ts}` | stockpilot-ai-ops | `src/routes/_authenticated/alerts.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | `inventory.alerts` and its `check_stock_alerts()` engine already existed (SP-3a/SP-3b) with no UI reading or managing them until this slice -- no new migration needed, `alerts.manage`/`alerts.delete` were already seeded in C-7's permission catalog. Straightforward port: open/acknowledged alerts with Acknowledge/Resolve/Dismiss actions, a collapsed "Resolved & dismissed" section below. Status updates go through a Server Action + `useTransition` (the `runPrimaryAction` pattern already established by `purchase-orders-list.tsx`) instead of the original's `react-query` mutation. New sidebar entry in `INVENTORY_NAV`'s "Overview" group, between Dashboard and Audit Log. |

### SP-7f (continued) -- Team

| Platform path | Source repo | Source path | Source commit SHA | Notes |
|---|---|---|---|---|
| `packages/core/src/rbac/permission-catalog.ts` (new), `packages/module-inventory/src/lib/tenancy/{queries,types}.ts` (extended: `listBusinessMembers`/`BusinessMember`), `apps/web/.../inventory/team/page.tsx` | stockpilot-ai-ops | `src/routes/_authenticated/team.tsx` | `9cee43a450994dd73e63f74992d060af4c123d65` | Fully read-only, no client component needed at all -- one Server Component fetch. `core.permissions`/`core.role_permissions` (C-7) already existed with no UI reading them; `listPermissionCatalog()`/`listRolePermissions()` live in `packages/core` (genuinely shared -- any module's roles could show up here, not just inventory's) alongside the existing `require-permission.ts`. Confirmed `owner`/`admin` having "every permission" is a literal seeded row per permission (C-7's own cross-join), not a code-level special case, so a plain `role_permissions` read already renders correctly with no extra logic. `ACTIVE_ROLES` dropped the original's two legacy labels (`manager`/`staff`) -- this platform's `business_members.role` check constraint never had them to begin with. Member names are joined client-side (well, server-side here) against `core.user_profiles` since `business_members.user_id` carries no FK, same reasoning as the original. New sidebar entry: `INVENTORY_NAV`'s new "Administration" heading (after Purchasing), since Team doesn't fit any of the existing operational groups. |

**`onboarding.tsx` -- deliberately not ported.** stockpilot-ai-ops's own onboarding route creates a brand-new `organizations` row (+ a first warehouse) as its own dedicated "create your business" page. This platform already has one unified, cross-module business-creation flow (`CreateBusinessModal`/`createBusinessAction`, shared by every module via licensing) -- porting stockpilot's version verbatim would stand up a second, competing way to create a business, which is exactly the kind of architecture change CLAUDE.md requires explicit approval for, not something to slip in as a routine SP-7f route. The one piece of stockpilot's onboarding that's still genuinely missing -- auto-creating a first warehouse when a business's `inventory` license activates -- is a narrower, well-scoped follow-up in its own right (hook into `core.licenses`' activation path, not a new route), left for a future story rather than bundled in here.

**Remaining after this batch:** `public_api_v1` (stockpilot-ai-ops's `src/lib/api-v1/` -- API-key auth, generic CRUD, OpenAPI generation, 8 resource route handlers, ~1500 lines total) promoted to `core`. Substantial enough, and security-sensitive enough (a new external-facing auth mechanism), to warrant its own focused story rather than a rushed tail-end addition to this batch.

## `SP-9` -- module-inventory manifest + contract/index.ts (new build, not a port)

Unlike every entry above, this story has no stockpilot-ai-ops source to port from -- StockPilot was a single-module app with nothing analogous to a cross-module contract surface. This is new platform infrastructure implementing 00-MASTER-PLAN.md §6 mechanism 2 ("call another module's `contract/index.ts` function synchronously") and mechanism 3 (publish/subscribe via `core.domain_events`) for `module-inventory`, per the backlog's own spec (`docs/plan/04-CLAUDE-CODE-BACKLOG.md`, SP-9): "Manifest, `contract/index.ts` (`reserveStock`, `releaseStock`, `consumeStock`, `getAvailability`, `listWarehouses`, `upsertItem`), event publish/subscribe wiring."

| Path | What | Notes |
|---|---|---|
| `packages/module-inventory/src/manifest.ts` | `inventoryManifest: ModuleManifest` | Mirrors the existing (placeholder) `moduleRegistry` entry in `packages/module-registry/src/index.ts` verbatim (`permissions: ["inventory.access"]`) rather than enumerating the real ~30-key permission catalog -- wiring `manifest.ts` to replace that static array is a separate, broader change than this story's scope. |
| `supabase/migrations/20260907200000_inventory_adjust_stock_contract_rpc.sql` (`inventory.adjust_stock_for_contract()`) | New generic validate-then-insert RPC for `reserve`/`unreserve`/`outbound` movements | None of the three existing workflow RPCs (`confirm_sales_order`/`ship_stock_transfer`/`receive_purchase_order_item`) are generic enough for an arbitrary contract caller -- each hardcodes its own movement type and validation for its own document workflow. Reuses the same `available = quantity - reserved - damaged - expired` formula `ship_stock_transfer` already established. Deliberately not `SECURITY DEFINER`; runs as the calling user, same RLS backstop as any direct write. Caught live (via Supabase MCP against the dev project, `jazdtomcgqjxjueedmck`): the first version omitted `created_by`, which `inventory.stock_movements` requires `NOT NULL` -- every existing RPC sets it to `auth.uid()`, fixed to match. All six branches (reserve/unreserve/outbound, success and rejection) verified live before and after the fix, then covered permanently by new assertions in `scripts/test-inventory-procedural.mjs` (section "1c"). |
| `packages/core/src/licensing/queries.ts` (`hasModule()`, added) | Thin wrapper over `core.has_module()` (C-3) | The pre-check every contract function uses to return `{ ok: false, error: "MODULE_NOT_LICENSED" }` (ADR-10) instead of a raw RLS error. |
| `packages/module-inventory/src/contract/{index,types}.ts` | The six required functions + `ContractResult<T>` | `upsertItem()` writes directly to `core.items`/`core.item_inventory_attrs`, not the `inventory.products` compat view -- that view's `INSTEAD OF` insert trigger hardcodes `kind = 'good'`, so it can't be reused for `'part'`/`'service'`/etc rows, and `core.items` is genuinely core-owned cross-module data (its `kind` enum already anticipates non-inventory kinds). `reserveStock`/`releaseStock`/`consumeStock` call the new RPC then `publish()` an `inventory.stock.contract_adjusted` domain event (fire-and-forget, after already answering the caller synchronously). All functions run through the normal RLS-scoped client (not service-role) -- a contract call represents the same signed-in user asking inventory to act on their behalf, constrained exactly as if inventory's own code had done it directly. |
| `packages/module-inventory/src/events/handlers.ts` (new) | Subscribes to `inventory.stock.contract_adjusted` | Not speculative: the drain loop (`core/events/drain.ts`) treats a published event type with no registered handler as a permanent failure on its very next attempt, so publishing `contract_adjusted` requires inventory to also handle it. The handler folds each one into `core.audit_log` as `stock.contract_adjusted` (new `ACTION_LABEL` entry in `packages/core/src/audit/format.ts`), landing in the same Audit Log page the DB-trigger path (`stock.adjusted`) already populates. |
| `apps/web/app/api/cron/drain-events/route.ts` (edited) | Side-effect import of `@cofounderai/module-inventory/events/handlers` | Populates `core/events/registry.ts`'s in-process handler map before the drain loop runs; every module's own `events/handlers.ts` gets imported here for the same reason. |
| `packages/module-inventory/package.json` (edited) | `sideEffects` narrowed from `false` to `["./src/events/handlers.ts"]`; `exports` gained `manifest`/`contract/*`/`events/*` | The package-wide `sideEffects: false` would let a bundler tree-shake away `events/handlers.ts`'s side-effect-only `registerEventHandler()` call (no exports consumed), silently breaking event handling in production -- caught by reasoning about the interaction, not an observed failure. |

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db` suite green (including the new section-1c assertions); `npm run build --workspace=apps/web` succeeds; all six RPC branches and all `upsertItem`/`getAvailability`/`listWarehouses` query shapes independently confirmed live against the dev Supabase project before the SQL-level test assertions were written, with test fixtures cleaned up afterward.

## `SP-7` (completed) -- `public_api_v1` + `api-v1` lib promoted to `core`

The one piece SP-7's own spec line left unfinished ("...promote `public_api_v1` + `api-v1`
lib to `core`"), previously deferred at the end of the SP-7f batch as "substantial enough,
and security-sensitive enough (a new external-facing auth mechanism), to warrant its own
focused story." Picked up as the next item once SP-9 finished, since no other unstarted
item remained in the SP list.

Split, deliberately, unlike a same-package original: the API-key auth/CRUD/response
engine is generic core infrastructure (any future module's own public API could reuse the
same `core.api_keys` table and permission-snapshot model), so it lives in
`packages/core/src/api-v1/`; the actual resource handlers, OpenAPI spec, and dispatch
table are inventory-specific business logic, so they live in
`packages/module-inventory/src/api-v1/` -- legal per 00-MASTER-PLAN.md §6 mechanism 1
("read shared data from core directly") in reverse: a module consuming a core-owned
generic engine, not another module's internals.

| Path | Source | Notes |
|---|---|---|
| `supabase/migrations/20260907210000_core_api_keys.sql` (`core.api_keys`, `core.api_key_secrets`, `core.api_rate_limit_counters`, `core.check_api_rate_limit()`) | `stockpilot-ai-ops/supabase/migrations/20260914000000_public_api_v1.sql` | Business-scoped (`business_id`) instead of org-scoped; RLS gated by `core.has_permission(business_id, 'settings.manage')` (C-7's own permission, already tagged module `inventory` in the seed catalog) instead of a bespoke `has_permission()`. No "tenant AND licensed" gate on these tables themselves -- api_keys isn't a licensed module's table any more than `core.audit_log` is (see the migration's own header comment); what a key can actually reach *is* module-gated, enforced in `router.ts` below. Also adds `core.next_number_for_api()`, a new function with no direct source-file analogue: stockpilot's own `sales-orders.server.ts` duplicated its counter's arithmetic by hand specifically to avoid a membership check that fails under a service-role client; this platform's equivalent (`core.next_number()`, D-5) has the identical problem, so rather than re-duplicating arithmetic in TypeScript, `next_number_for_api()` duplicates it once, correctly, as a second SQL function sharing the exact same `core.number_sequences` counter -- service_role-only grant, `core.next_number()` itself untouched. Also grants `core.has_module()` (C-3) to `service_role` (additive only; that function has no session dependency to begin with) so `router.ts`'s license check can call it from the same service-role context. |
| `packages/core/src/api-v1/{response,auth.server,crud.server}.ts` | `stockpilot-ai-ops/src/lib/api-v1/{response,auth.server,crud.server}.ts` | Near-verbatim; `ApiKeyContext.orgId` renamed `businessId` throughout. `crud.server.ts`'s `CrudConfig` gained two fields the single-schema original had no reason to need: `schema` (which Postgres schema the admin client targets) and `filterColumn` (this platform's compat views expose `org_id`, kept for StockPilot-shape compatibility, while genuinely inventory-native tables like `warehouses`/`stock_levels` use `business_id` -- no single default is safe) plus an optional `queryFilters` (arbitrary `?field=value` passthrough filters, used by stock-levels' `item_id`/`warehouse_id`). |
| `packages/core/src/api-v1/keys/{types,queries,mutations}.ts` | `stockpilot-ai-ops/src/lib/api-key-actions.ts` | Powers the Settings UI (not the public API itself) -- runs through the ordinary RLS-scoped client, not the admin one, exactly like the original: the real authorization is `core.api_keys`/`core.api_key_secrets`' own RLS, not re-implemented in application code. |
| `packages/module-inventory/src/api-v1/openapi.ts` | `stockpilot-ai-ops/src/lib/api-v1/openapi.ts` | Near-verbatim; retitled, and documents the new `403 module_not_licensed` response. |
| `packages/module-inventory/src/api-v1/resources/{products,warehouses,customers,suppliers,stock-levels}.server.ts` | `stockpilot-ai-ops/src/lib/api-v1/resources/{products,warehouses,customers,suppliers,inventory}.server.ts` | Thin `createCrudHandler()` configs. `stock-levels.server.ts` (registered under the resource key `"inventory"` in `router.ts`, keeping the original's own `/api/v1/inventory` URL) drops the original's `product_id`/`warehouse_id` PostgREST embeds (`products(sku,name)`, `warehouses(name,code)`) -- this platform's compat views carry no real foreign keys for PostgREST to embed across (the same limitation `stock/queries.ts` already worked around for the UI); a caller resolves names via `/products`/`/warehouses` instead. `warehouses.server.ts` drops `contact_name`/`contact_phone` -- columns the original had that `inventory.warehouses` (SP-3a) never carried on this platform. |
| `packages/module-inventory/src/api-v1/resources/{purchase-orders,sales-orders,sales-invoices}.server.ts` | `stockpilot-ai-ops/src/lib/api-v1/resources/{purchase-orders,sales-orders,sales-invoices}.server.ts` | Hand-written, same reasons as the source (nested line items; sales-invoices additionally hand-written here, unlike the source's CRUD-factory version, purely to resolve its line items on single-fetch without an embed). `sales-orders.server.ts` mints `so_number` via the new `core.next_number_for_api()` RPC instead of reimplementing the counter by hand in TypeScript (see the migration entry above) -- a straightforward improvement the source's own comment on that exact workaround invited, now that a same-guarantee RPC exists. **Fixed 2026-09-08, `20260908150000_inventory_compat_view_tax_fields_fix.sql`** (was: known limitation, not fixed at the time this API layer was ported): `purchase_orders_instead_of_insert()`/`sales_orders_instead_of_insert()` (SP-4) never referenced `subtotal`/`cgst_amount`/`sgst_amount`/`igst_amount`/`total_amount` in their own `INSERT INTO core.documents`, so a header total posted through either compat view -- from this API or from `module-inventory`'s own UI mutations (`lib/purchase-orders/mutations.ts` computes and posts these exact fields) -- was silently dropped whenever the header was created with zero line items (the common case of >=1 line item already self-healed via `core.recompute_document_totals()`'s own AFTER trigger on `core.document_lines`, moments after the header insert). Both `..._instead_of_insert()` functions now persist whatever the caller posts, matching `discount_amount`/`shipping_amount`'s existing treatment; the UPDATE-side triggers were deliberately left alone (a separate, correct, pre-existing trigger already recomputes authoritatively from lines on every update). This API resource's own comment about "only posting the fields the trigger actually persists" is now stale in the narrow sense that `subtotal`/`cgst_amount`/`sgst_amount`/`igst_amount`/`total_amount` could be added to its own POST body too, though neither resource was updated to actually do so as part of this fix (out of scope -- this fix targets the trigger-layer bug itself, not re-opening the API resource's own request shape). |
| `packages/module-inventory/src/api-v1/router.ts` | `stockpilot-ai-ops/src/lib/api-v1/router.server.ts` | The HTTP-interception hack the source needed (its TanStack Start version had no file-based API route primitive) is gone -- Next.js App Router route handlers do this natively (`apps/web/app/api/v1/{openapi.json,[resource],[resource]/[id]}/route.ts`). What's left here: the resource dispatch table and one check the single-module source never needed at all -- `hasModule(ctx.businessId, "inventory")` (called via the admin client directly, not `core/licensing/queries`' session-scoped helper, since there's no session on an incoming API request) before dispatching to any resource, returning `403 module_not_licensed` for a lapsed license. The API layer runs as service_role, which bypasses the "tenant AND licensed" RLS every compat view/table carries -- this is that check restored in application code, the same reasoning as `contract/index.ts`'s own `requireLicensed()` (SP-9). |
| `packages/module-inventory/src/components/api-keys/api-keys-panel.tsx` | `stockpilot-ai-ops/src/components/api-keys-panel.tsx` | Generate/revoke go through plain Server Actions + `useTransition` (this codebase's own established pattern, e.g. `alerts-list.tsx`) instead of a react-query mutation; errors surface as inline state rather than a toast (no toast dependency in `module-inventory`, and no existing precedent for one in this module's other components). |
| `apps/web/app/(dashboard)/dashboard/businesses/[businessId]/inventory/api-keys/{page.tsx,actions.ts}` | `stockpilot-ai-ops/src/routes/_authenticated/account.tsx` (the "API keys" card) | Promoted from a card inside Organization Settings to its own page, under `INVENTORY_NAV`'s "Administration" group next to Team -- `settings.manage` (C-7) is itself an inventory-module permission on this platform's seeded catalog, not a generic business-wide one, so it doesn't belong under a not-yet-built generic business-settings page. |

New test: `scripts/test-core-api-keys.mjs` (wired into `test:db`, positioned after `test-core-audit-log.mjs`) -- settings.manage-gated create/read/revoke, that `api_key_secrets` has no SELECT policy for anyone including the creator, tenant isolation, that `check_api_rate_limit()`/`next_number_for_api()` are unreachable for an ordinary authenticated caller but work correctly for `service_role`, and that `next_number_for_api()` continues the exact same sequence `core.next_number()` itself would produce.

Verified: `typecheck`/`lint`/`lint:boundaries`/`lint:migrations` all clean; full `test:db` suite green; `npm run build --workspace=apps/web` succeeds (all three new API routes + the new Settings page compile and register). Live-verified against the dev Supabase project (`jazdtomcgqjxjueedmck`) before finalizing: the full `resolveApiKey()` query chain (secret lookup by hash -> key lookup -> revoked check -> `check_api_rate_limit()`), `router.ts`'s `has_module()` license check under `service_role`, and a full products create/list/update cycle through `inventory.products` scoped by `org_id` -- all against a real API key row, all cleaned up afterward.
