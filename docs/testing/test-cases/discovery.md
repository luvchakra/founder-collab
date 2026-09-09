# Test cases: `discovery` (ported from co-founder-ai, stories P-0..P-5 + ongoing)

Covers `packages/module-discovery/src/**` — the customer-acquisition pipeline:
product intelligence, ICP, prospects, research, scoring, outreach, messages,
conversations, chat, BYOK. This module keeps `workspace_id` as its tenant (ADR-4,
distinct from every other module's `business_id`) — several cases below exist
specifically to pin that down at the feature level, since it's the one place this
module's tenancy model differs from its siblings.

### TC-DISCOVERY-001: Workspace tenancy, not business tenancy, gates prospect access
**Feature:** ADR-4's discovery-specific exception.
**Priority:** P0 · **Story:** P-5 port, D-1 (party backfill)
**Preconditions:** One business with two products (= two workspaces).
**Steps:**
1. From Product A's workspace, attempt to load a prospect belonging to Product B's workspace.
**Expected result:** Not found — even though both workspaces share the same
`business_id`, `discovery` isolates by `workspace_id`. (`scripts/test-discovery-rls.mjs`
should already assert this at the DB layer; this case confirms the UI/action layer
enforces the same boundary.)

### TC-DISCOVERY-002: Prospects backfill into `core.parties` correctly
**Feature:** D-3 — "write through core going forward."
**Priority:** P0 · **Story:** D-3
**Steps:**
1. Create a new prospect through the discovery UI.
2. Check `core.parties`/`party_roles`.
**Expected result:** A corresponding `core.parties` row exists with a `prospect` role
— the write goes through `core`, not into a discovery-only shadow table (see
`scripts/test-discovery-party-backfill.mjs` for the migration-time version of this;
this case is the forward-going-live path for newly created prospects).

### TC-DISCOVERY-003: Full pipeline — research → score → strategy → message → send → reply
**Feature:** End-to-end regression across all ported AI operations
(`understandProduct`, `generateIcp`, `researchProspect`, `discoverProspects`,
message/reply/strategy generation, reply classification).
**Priority:** P0 · **Story:** P-5 port (all AI operations)
**Steps:**
1. Walk one prospect through every stage in order.
**Expected result:** Each stage's output is consistent with the one before it (e.g.
the strategy references the actual research findings, the message reflects the
approved strategy) — a regression check that the port didn't silently drop context
passed between AI calls.

### TC-DISCOVERY-004: BYOK always wins when connected; only an unconnected account falls back to the platform's own key
**Feature:** Ported BYOK layer (`f55ba0e`) — **reversed by item #16 of a later UX
pass**, `lib/ai/router.ts#resolveAiModel`.
**Priority:** P0 · **Story:** P-2 (BYOK port), then this pass
**Correction — this case previously described a permanent, absolute "no fallback"
policy; that's no longer accurate and the previous wording (and the AI Provider
settings page's own former copy, "we never use a shared or company-owned AI account
on your behalf") was a real, deliberate architecture decision this pass explicitly
reversed, not a bug:** `resolveAiModel()` now checks the account's own BYOK credential
*first* — an exhausted/invalid BYOK key still fails with the real provider error and
never falls back, exactly as before. But an account with **no BYOK credential
connected at all** now falls back to `PLATFORM_AI_API_KEY` (an optional, env-gated
Anthropic key) instead of being blocked outright — the new `credentialSource: "byok"
| "platform"` field on `ResolvedAiModel` tells callers which happened. The sidebar's
own "AI credits used" percentage (`app-sidebar.tsx`) is shown only in `"platform"`
mode and hidden once BYOK is connected, since a BYOK account bills to the founder's
own provider account with no platform-side cap to show a percentage of.
**Steps:**
1. Exhaust a *connected* provider's quota (BYOK present).
2. Trigger any discovery AI operation with **no** BYOK credential connected and
   `PLATFORM_AI_API_KEY` unset in the environment.
3. Repeat step 2 with `PLATFORM_AI_API_KEY` set.
4. Connect a BYOK key, then check the sidebar's own credits-percentage indicator; then
   disconnect it and check again.
**Expected result:** Step 1 fails with the real provider error — BYOK still never
falls back to anything, quota exhaustion included. Step 2 still throws
`AiProviderError("no_provider_connected")` (nothing configured to fall back to). Step
3 succeeds on the platform's own Anthropic credential, and `credentialSource` reads
`"platform"`. Step 4 shows the percentage while BYOK is disconnected and hides it
immediately once connected.
**Automated coverage:** none yet — needs either a live `PLATFORM_AI_API_KEY` (not
present in this sandbox; the code path is otherwise complete and typechecked/built)
or a mocked provider-factory unit test, neither of which exists yet for this file.

### TC-DISCOVERY-005: AI cost/usage limits are enforced per workspace, still
**Feature:** Ported usage/cost ceiling logic (`lib/usage`).
**Priority:** P0 · **Story:** P-5 port
**Steps:**
1. Bring a workspace to its cost ceiling.
2. Attempt `discoverProspects` (the most expensive single operation).
**Expected result:** Blocked before any model/web-search call — consistent with
pre-port behavior, now also consistent with the platform's shared `ai_runs` table
(`core.ai_runs` per ADR-6/7 — confirm usage aggregation reads from the shared table,
not a discovery-local copy that could drift).

### TC-DISCOVERY-006: Real email sending still works post-port
**Feature:** Ported message send/mutation layer (`e9b520d`) + webhook handlers.
**Priority:** P0 · **Story:** P-5 port
**Steps:**
1. Approve and send a message to a valid test address.
2. Trigger a delivery-status webhook event for it.
**Expected result:** Same behavior as pre-port `co-founder-ai`: real send via Resend,
status updates from the real webhook — confirm `apps/web/app/api/webhooks/email-status`
(ported per `b7f8c27`) is wired to the same underlying `lib/messages` logic.

### TC-DISCOVERY-007: Deterministic scoring formula ported without silent drift
**Feature:** `a0d50fd` "deterministic scoring."
**Priority:** P0 · **Story:** P-5 port
**Steps:**
1. Score an identical prospect/research/ICP combination using both the pre-port
   `co-founder-ai` app (read-only reference) and the platform's ported version.
**Expected result:** Identical `overall_score` and sub-scores — the port should be
mechanical for pure logic; any difference is a regression, not an intentional change,
unless explicitly documented.

### TC-DISCOVERY-008: Discovery→FSM handoff on prospect.won
**Feature:** Cross-module domain event (F-13, `discovery -> fsm handoff`).
**Priority:** P0 · **Story:** F-13
**Preconditions:** Both `discovery` and `fsm` licensed for the business.
**Steps:**
1. Mark a prospect as won.
2. Check `fsm` for the resulting handoff (e.g. an opportunity or job created).
**Expected result:** `fsm` receives the handoff via `core.domain_events`
(ADR-5 mechanism 3) — not a direct import of discovery internals (ADR-10/CLAUDE.md
non-negotiable #3).

### TC-DISCOVERY-009: Discovery→FSM handoff degrades gracefully when FSM isn't licensed
**Feature:** ADR-10's "no hard dependencies" guarantee, applied to this specific handoff.
**Priority:** P0 · **Story:** F-13
**Steps:**
1. With `fsm` not licensed for the business, mark a prospect as won.
**Expected result:** Discovery's own flow completes normally (prospect marked won);
the handoff attempt returns/logs a normal "module not licensed" result, not an
exception that breaks the discovery action.

### TC-DISCOVERY-010: Narrowed discovery search (beyond ICP) returns relevant, non-duplicate results
**Feature:** `c386216` — "narrow a Discover prospects search beyond the ICP."
**Priority:** P1 · **Story:** post-port enhancement
**Steps:**
1. Run a discovery search with an additional narrowing filter (e.g. a keyword beyond
   the ICP's own criteria).
**Expected result:** Results respect both the ICP and the narrowing filter; still
excludes existing prospects (per the original `TC-DISCOVERY` dedup behavior).

### TC-DISCOVERY-011: Outreach emails can be generated from the business's own Resend templates
**Feature:** `124869c` — "generate outreach emails from their Resend templates."
**Priority:** P1 · **Story:** post-port enhancement
**Steps:**
1. Configure a custom Resend template for a business.
2. Generate an outreach message.
**Expected result:** Uses the configured template's structure/branding, not a
hardcoded default, when one is set; falls back sensibly when none is set.

### TC-DISCOVERY-012: Gemini website research uses url_context, not mislabeled as key failure
**Feature:** `cb4dec4` — bug fix regression guard.
**Priority:** P1 · **Story:** bugfix
**Steps:**
1. With Google/Gemini connected as the BYOK provider, trigger "auto-populate" website
   research (`3ab3d6c`).
2. Separately, simulate an actual invalid-API-key scenario.
**Expected result:** The two failure modes are distinguishable in the UI — a
url_context/tool failure is never shown as "invalid API key" (the bug this fix addressed).
**Confirmed this pass, with a real regression test added (not just prose):** traced the
actual message text — `understand-product.ts` throws `` `Gemini could not retrieve
${url} (status: ${status}). The site may be blocking automated access, redirecting, or
returning an error -- check it loads without a login and isn't behind a WAF/CDN
challenge.` `` on a failed `url_context` retrieval, and the UI's classifier
(`packages/core/src/ai-providers/is-provider-failure.ts#isAiProviderFailure`, a regex
over the message text) does not match any of its own patterns against that message —
confirmed by running it, not just reading it. Added that exact message as a permanent
case in `is-provider-failure.test.ts` (already had passing-case coverage, but nothing
pinning down this specific historical bug's message before this pass) so a future
change to the regex that accidentally starts matching url_context failures again gets
caught immediately, not rediscovered by a user hitting the original bug a second time.

### TC-DISCOVERY-013: "Let AI Auto-populate Products from website" parses a real catalog, not a stub
**Feature:** Items #10/#12 of a UX pass — `lib/ai/discover-products.ts`
(`discoverProductsFromWebsite`), `AutoPopulateProductsButton`.
**Priority:** P0 · **Story:** this pass
**Steps:**
1. Set a business's website (`updateBusinessWebsiteAction`) to a real multi-product
   storefront.
2. Click "Let AI Auto-populate Products from website" and review the preview.
3. Confirm the preview to actually create the products.
4. Repeat against a site Gemini's `url_context` tool can't retrieve (blocked,
   redirecting, WAF-gated).
5. Repeat against a business with zero existing workspaces anywhere on the account.
**Expected result:** Step 2's preview lists up to 30 `{name, website}` pairs actually
found on the site (via `generateText` + `createUrlContextTools`, then
`generateObject` structuring into `DiscoveredProductsSchema`), not a fixed/fake list.
Step 3 creates real `discovery.products` rows. Step 4 surfaces the same
`url_context`-failure message class TC-DISCOVERY-012 already pins down — never
mislabeled as an invalid API key. Step 5 attributes AI usage tracking to
`getFirstWorkspaceForAccount()`'s own fallback (no workspace exists yet for this
specific business to charge the run against) rather than throwing on a business with
a genuinely empty account.
**Automated coverage:** none yet — needs a live BYOK/platform key and a real website
to fetch; not reachable by this repo's DB-only harness.

### TC-DISCOVERY-014: Deleting a product cascades correctly; deleting a knowledge source no longer silently no-ops
**Feature:** Item #12 (`deleteProduct`) and item #14 (`deleteKnowledgeSource` fix).
**Priority:** P0 · **Story:** this pass
**Background — the same silent-RLS-no-op bug class found earlier in `crm`'s own
mutations (see `crm.md` TC-CRM-005):** `deleteKnowledgeSource()` did a plain
`.delete().eq("id", sourceId)` with no `.select()`, so a delete denied by RLS (the
row already gone, or access changed) returned successfully having deleted nothing,
with no error and no way for the UI to tell the founder why their click did nothing.
Fixed by adding `.select("id")` and throwing an actionable error on an empty result,
exactly mirroring `crm`'s own fix.
**Steps:**
1. Delete a product that has prospects/research/ICP data under it.
2. Delete a product with zero prospects.
3. Call `deleteKnowledgeSource` on a source that's already been removed (or whose
   workspace access just changed).
4. Call it again on a source that still exists and is still accessible.
**Expected result:** Steps 1-2 hard-delete the product row; `discovery.workspaces`'
own `on delete cascade` on `product_id` removes everything beneath it — no orphaned
prospects/research left behind, and the confirmation dialog's own wording differs
based on whether prospects exist (per `DeleteProductButton`'s own prospect-count
branch). Step 3 throws `"This knowledge source could not be deleted -- it may have
been removed already, or your access to it may have changed."` instead of silently
succeeding. Step 4 succeeds and the source disappears from the UI.
**Automated coverage:** none yet — same DB-access gap as most of this pass's fixes;
the underlying RLS fact (a denied `DELETE` returns zero rows via `returning id`, not
an error) is the same one `crm`'s own `test-crm-rls.mjs` already proves for its own
tables, just not yet ported to a `discovery`-side script.

### TC-DISCOVERY-015: Prospect cards show attributes as chips on small screens, a table on large ones
**Feature:** Item #1 of a UX pass — `components/prospects/prospects-cards.tsx`, and
CLAUDE.md's new platform-wide compact-cards-below-`md` principle (item #15) this
component was the first to establish.
**Priority:** P2 · **Story:** this pass
**Steps:**
1. View a product's prospects list at a narrow (sub-`md`) viewport width.
2. Widen the viewport past `lg`.
**Expected result:** Step 1 shows one compact card per prospect, each attribute as its
own labeled chip, more than one per row when text width allows. Step 2 switches to a
proper table layout, not a horizontally-scrolling or truncated version of the mobile
card.
**Automated coverage:** none — a pure layout/CSS behavior, no DB or logic to assert
against; would need a visual/e2e test this repo doesn't have infrastructure for yet.

### TC-DISCOVERY-016: `module-discovery`'s first `contract/index.ts` — the CRM handoff and the Customer 360 panel's own Discovery section
**Feature:** `docs/design/crm-module-design.md` Part A/B —
`createProspectFromExternalLead`, `getProspectSummaryForParty`. See `crm.md`
TC-CRM-008/009 for the calling side; this case is discovery's own contract behavior.
**Priority:** P0 · **Story:** this pass
**Steps:**
1. Call `createProspectFromExternalLead` for a business with `discovery` unlicensed.
2. Call it for a business with zero products/workspaces.
3. Call it with `existingPartyId` set to a party CRM's own webhook ingestion already
   created (a lead-only party, no role yet).
4. Call `getProspectSummaryForParty` for a party that has never been a prospect, and
   for one that has, across two different businesses.
**Expected result:** Step 1 returns `{ ok: false, error: "MODULE_NOT_LICENSED" }`, not
an exception (ADR-10). Step 2 returns `{ ok: false, error: "NOT_FOUND" }`. Step 3
creates the prospect linked to that *same* party (via the direct `.update({party_id})`
+ `addPartyRole` path — not a second, disconnected party from `createProspect()`'s own
auto-create), and adds the `'prospect'` role to it. Step 4 returns `{ ok: true, data:
null }` for the never-a-prospect case, and the real `{prospectId, productName, status,
outcome}` for the other — scoped correctly per business (RLS on `discovery.prospects`
already enforces this without an extra manual business-id filter in the contract
function itself).
**Automated coverage:** none yet — same cross-module-live-data gap as `crm.md`
TC-CRM-008.
