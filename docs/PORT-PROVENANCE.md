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
  correctly, and RLS genuinely isolates two tenants on both read and write. Not yet
  applied to the real target project.

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

Not yet ported: `components/{tenancy/{sidebar,sidebar-account-menu,sidebar-context,
sidebar-toggle,business-selector,business-list},alerts,chat,marketing,ui/logo-mark}/*`,
the product's ICP/prospects/conversions/usage tabs (the core GTM pipeline: prospect
discovery, research, scoring, outreach), settings pages, and `app/api/webhooks/*`.
Tracked as the remaining scope of `P-5`, continuing story by story.

`packages/module-inventory` doesn't exist yet (story `SP-7`).
