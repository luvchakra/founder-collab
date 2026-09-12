# Test cases: `discovery` (ported from co-founder-ai, stories P-0..P-5 + ongoing)

Covers `packages/module-discovery/src/**`. Originally the customer-acquisition
pipeline (product intelligence, ICP, prospects, research, scoring, outreach, messages,
conversations, chat, BYOK); since 2026-09-11/12 the "Offering-Centric" backlog
(`docs/design/discovery-offering-backlog-audit.md`, 39/68 stories shipped, Phases A–E)
grew it into a much larger surface — offerings/buyer-personas/discovery-definitions,
an Opportunity Intelligence engine (signals/negative-signals/research-briefs/scoring),
a CRM handoff, and a 14-stage autonomous website-to-offering pipeline. **This module
keeps `workspace_id` as its tenant for everything pre-dating Phase E** (ADR-4, distinct
from every other module's `business_id`) — but Phase E's own website-onboarding tables
(`website_onboarding_runs`/`_pages`/`_offering_candidates`) are deliberately
`business_id`-scoped instead, since no offering/workspace exists yet at that point in
the flow — see TC-DISCOVERY-032 for why this is a genuine, documented exception, not an
inconsistency to "fix."

**⚠ `docs/plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md` remains
superseded-in-practice**, never independently built — the offering-centric backlog's
own Phase C (05.1–07.3: opportunities/signals/scoring/why-now/research-briefs/buyer
intelligence) was explicitly built to satisfy its intent too, confirmed by that session's
own pre-implementation reconnaissance. No test case should be attributed to `08-...md`
directly.

**Priority-one gap across this whole file (flagged once here, not repeated per case):**
13 new tenant/business-scoped tables shipped in Phases A–E with **zero automated
RLS-script coverage** — `scripts/test-discovery-rls.mjs` is still scoped to
`products`/`workspaces`/`prospects` only. Per CLAUDE.md dev principle #9 ("tenant-
isolation tests are mandatory for anything touching workspace- or business-scoped
data"), every P0 case below that says "Covers: [a new table]" with no accompanying
`scripts/test-discovery-*-rls.mjs` name is documentation-only until that script exists.

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
**⚠ Superseded (Story 12.1, 2026-09-12):** the shared failure path moved from
`understand-product.ts` into `lib/ai/research-website.ts#researchWebsite()`, now shared
across `understandProduct`, `understandBusinessWebsite`, `researchProspect`, and every
per-page fetch inside `crawlWebsite()` (09.2). Current wording is prefixed with a
direct-fetch failure first: `` `A direct fetch of ${website} failed (${directFetchError}),
and ${provider} could not retrieve ${failedRetrieval.retrievedUrl} either (status:
${failedRetrieval.urlRetrievalStatus}). ...` `` — still doesn't match
`isAiProviderFailure`'s own patterns (re-confirmed), so the underlying fix still holds;
the pinned regression string above is now a historical shape other, older code paths
might still produce — kept, not replaced. Add the current wording as a second pinned
string in `is-provider-failure.test.ts`.

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
**Update (2026-09-12):** the contract has grown two more surfaces this case doesn't yet
cover: `listOfferingsForBusiness()` (Story 01.1, a new `contract/index.ts` export) and
`getProspectSummaryForParty()`'s new `latestOpportunity: ContractOpportunitySummary |
null` field (Story 08.1, resolved from the prospect's most-recent opportunity, including
`researchBriefSummary`/`discoveryDefinitionName`) — add a step 5 for the former and amend
step 4/expected-result for the latter (`null` for a prospect with no opportunity;
most-recent-first when several exist).

---

## Phase A — Offering foundation (Story 01.1–02.3)

### TC-DISCOVERY-017: Three-way offering status transitions and duplication don't corrupt tenant/product state
**Priority:** P0 · **Story:** 01.1/01.3
**Steps:**
1. Cycle an offering through `active`→`inactive`→`archived`→`active` via
   `setOfferingStatus`.
2. Call `duplicateOffering()` on it.
**Expected result:** (1) all transitions succeed. (2) the clone gets a fresh
`product_profile` (never copied — cloning stale research onto a new row would
misrepresent it as current) and its own workspace.
**Covers:** `lib/offerings/mutations.ts`, `discovery.products.status` constraint.

### TC-DISCOVERY-018: Pre-existing products backfilled with `offering_type='product'` never silently regress to null
**Priority:** P1 · **Story:** 01.2
**Covers:** `20260911003700_discovery_offering_type_backfill.sql`.

### TC-DISCOVERY-019: AI-suggested offering fields are proposals only, never auto-persisted
**Priority:** P0 · **Story:** 02.1
**Steps:**
1. Call `suggestOfferingProfile()` from an offering's Edit flow, review the dialog,
   close it without saving.
2. Check Create mode for the same option.
**Expected result:** (1) nothing written to `discovery.products` until the founder
explicitly saves the (possibly-edited) dialog. (2) the option is absent — no workspace
exists yet to charge AI usage against.
**Covers:** `lib/offerings/ai/suggest-offering-profile.ts`.

### TC-DISCOVERY-020: Cloning an ICP into a workspace that already has one overwrites it, never duplicates
**Priority:** P1 · **Story:** 02.2
**Steps:**
1. Clone ICP A into workspace B, which already has an approved ICP.
**Expected result:** B ends with exactly one `icp_profiles` row, in `draft` status; A's
own row is untouched.
**Covers:** `lib/icp/mutations.ts#cloneIcpProfileToWorkspace`.

### TC-DISCOVERY-021: Buyer personas are workspace-scoped and inaccessible cross-workspace
**Priority:** P0 (RLS/tenant) · **Story:** 02.3
**Steps:**
1. Attempt to read/edit/delete Product A's persona from Product B's workspace context.
**Expected result:** Denied at RLS; `listBuyerPersonas()` never leaks it.
**Covers:** `lib/personas/{queries,mutations}.ts`, `discovery.buyer_personas` RLS —
**currently untested by any `scripts/test-discovery-*.mjs`.**

## Phase B/C — Discovery Definitions & Opportunity Intelligence Engine (Story 04.1–07.3)

### TC-DISCOVERY-022: Discovery Definitions are workspace-scoped; deleting the source ICP doesn't break or cascade-delete the definition
**Priority:** P0 (RLS/tenant) · **Story:** 04.1
**Steps:**
1. Create a definition against an approved ICP, then delete that ICP.
2. Attempt cross-workspace access as in TC-DISCOVERY-021.
**Expected result:** (1) the definition still exists and functions (`icp_id` now null,
`on delete set null`) rather than erroring or vanishing. (2) denied.
**Covers:** `lib/discovery-definitions/{queries,mutations}.ts`.

### TC-DISCOVERY-023: Discovery Plays pre-fill but never auto-create a definition
**Priority:** P2 · **Story:** 04.2
**Expected result:** Clicking a play preset opens the create dialog pre-filled; nothing
is written until the founder explicitly clicks Create.

### TC-DISCOVERY-024: Every new opportunity-intelligence table is workspace-scoped and denies cross-workspace access
**Priority:** P0 (single highest-priority gap in this file) · **Story:** 05.1/05.3/05.5/06.2
**Steps:**
1. Attempt cross-workspace read of each of: `opportunities`, `signals`,
   `signal_correlations`, `negative_signals`, `research_briefs`.
**Expected result:** RLS denial on all five.
**Recommend promoting to:** a real `scripts/test-discovery-opportunities-rls.mjs` — this
is documentation-only today.

### TC-DISCOVERY-025: `computeOpportunityScore` never zero-fills a missing component
**Priority:** P1 · **Story:** 05.2
**Steps:**
1. Score an opportunity with zero populated components.
2. Score one with a partial set.
**Expected result:** (1) `{score: null, confidence: "low", reason: "Insufficient
evidence"}`. (2) only populated components averaged.
**Covers:** `lib/opportunities/scoring.ts` (unit-tested; this documents the same
guarantee at the feature level).

### TC-DISCOVERY-026: A single weak signal never manufactures a high-confidence correlation
**Priority:** P1 · **Story:** 05.3
**Steps:**
1. Correlate one signal, then two, then three+.
**Expected result:** One → low confidence with explicit "insufficient corroboration"
rationale. Two → still cautious. Three+ → medium/high.
**Covers:** `lib/signals/correlation.ts`.

### TC-DISCOVERY-027: Auto-detected negative signals correct themselves as new evidence arrives; manual-only reasons are never overwritten
**Priority:** P1 · **Story:** 05.5
**Steps:**
1. Trigger `wrong_industry` via an ICP mismatch, then change the ICP so it no longer
   mismatches, re-sync.
2. Confirm `existing_active_relationship`/`known_incompatible_solution` (manual-only)
   never come back from `detectNegativeSignals()`, and a manually recorded one survives
   an auto-sync pass untouched.
**Expected result:** (1) the stale auto row is deleted. (2) as stated.
**Covers:** `lib/negative-signals/{detect,mutations}.ts`.

### TC-DISCOVERY-028: Research Brief generation is a real, metered AI operation that never invents buying-committee people
**Priority:** P0 · **Story:** 06.2
**Steps:**
1. Generate a brief at a workspace's cost ceiling.
2. Generate one normally and inspect the buying-committee section.
**Expected result:** (1) blocked like every other AI op (TC-DISCOVERY-005). (2) only
real `discovery.contacts` rows matched to real `buyer_personas` — never a fabricated
name.
**Covers:** `lib/ai/generate-research-brief.ts`, `lib/research-briefs/match-committee.ts`.

### TC-DISCOVERY-029: Buyer intelligence / Next Best Action / dashboard classification never invents a recommendation with no basis
**Priority:** P2 · **Story:** 06.3/07.1/07.2/07.3
**Expected result:** A resolved opportunity gets no recommendation; a hard negative
signal forces Dismiss; a low-contactability/no-contact opportunity recommends "Find
Better Contact"; dashboard bins match `classifyOpportunityForDashboard`'s own
precedence (watching-status wins over score; null-score wins over status).
**Covers:** `lib/buyer-intelligence/`, `lib/opportunities/{next-best-action,dashboard}.ts`.

## Phase D — CRM Handoff (Story 08.1–08.3)

### TC-DISCOVERY-030: Sending an opportunity to CRM carries full context through the existing contract, degrading gracefully when CRM isn't licensed
**Priority:** P0 (licensing/cross-module) · **Story:** 08.1
**Steps:**
1. Send an opportunity to CRM with `crm` licensed.
2. Repeat with `crm` unlicensed.
**Expected result:** (1) Customer 360's "Opportunity" block shows score/why-them/
why-now/research-brief/recommended-action/discovery-definition context. (2)
`sendOpportunityToCrmAction` fails gracefully (ADR-10), never an exception.
**Covers:** `contract/index.ts#getProspectSummaryForParty`,
`components/opportunities/send-to-crm-button.tsx`.

### TC-DISCOVERY-031: Handoff status is computed correctly; a failure persists across reload with a working retry
**Priority:** P1 · **Story:** 08.3
**Steps:**
1. Force a handoff failure (the action throws).
2. Reload the page.
3. Click Send again.
**Expected result:** (1)/(2) `handoff_failed_at`/`handoff_error` persist. (3) success
clears both.
**Covers:** `lib/opportunities/handoff.ts`, `recordOpportunityHandoffFailure()`.
**Note:** Story 08.2 (Existing Relationship Detection) is a `module-crm` change
surfaced inside this page — see `crm.md` TC-CRM-047 for its own case.

## Phase E — Autonomous website-to-offering pipeline (Story 09.1–14.1)

### TC-DISCOVERY-032: Website-onboarding runs/pages/candidates are business-scoped, not workspace-scoped — the one deliberate exception
**Priority:** P0 (RLS/tenant — a genuine, documented exception to this module's usual
tenant key) · **Story:** 09.1/09.2/09.3
**Steps:**
1. Confirm a run/page/candidate created for Business A is inaccessible from Business
   B's context.
**Expected result:** Denied — no offering/workspace exists yet at this point in the
flow, so `business_id` is deliberately the tenant key here, unlike everywhere else in
this module.
**Covers:** `website_onboarding_{runs,pages,offering_candidates}` RLS — untested by any
script today.

### TC-DISCOVERY-033: Activating reviewed offering candidates cannot create duplicates on a double-click/retry
**Priority:** P0 (an accepted, untested risk named in the audit log itself) · **Story:** 09.4
**Steps:**
1. Click "Create Offerings," then immediately click/retry again.
2. Test Edit/Merge/Remove on individual candidates before activation.
**Expected result:** (1) `activated_at` is set server-side (re-checked, never trusted
from the client); a second click creates nothing further. (2) `mergeOfferingCandidates()`'s
field-consolidation and `offeringInputFromCandidate()`'s target-market combination
produce the expected payload each time.
**Covers:** `lib/website-onboarding/offering-review.ts`,
`createOfferingsFromWebsiteOnboardingAction`.

### TC-DISCOVERY-034: "Run AI Discovery" runs one stage per request to avoid same-request cache staleness; usage limits still apply per stage
**Priority:** P0 (licensing/AI-cost) · **Story:** 10.1
**Steps:**
1. Generate an ICP, then immediately run the next pipeline stage in the same request
   flow.
2. Run a stage at a workspace's cost ceiling.
3. Confirm `account_discovery`'s auto-approval never sends outbound communication.
**Expected result:** (1) the next stage sees the freshly-written product profile — the
exact staleness bug this architecture was redesigned to avoid. (2) blocked, same as
TC-DISCOVERY-005. (3) `crm_handoff` stays read-only; nothing is sent.
**Covers:** `lib/pipeline/handlers.ts`, `run-ai-discovery/route.ts`.

### TC-DISCOVERY-035: Retrying a failed pipeline stage preserves history; editing upstream invalidates only genuinely downstream stages
**Priority:** P1 · **Story:** 10.2/11.3
**Steps:**
1. Fail a stage, retry it.
2. Edit the ICP via "Save & Run Downstream."
**Expected result:** (1) `pipeline_stage_runs` keeps the failed attempt alongside the
new success. (2) exactly `downstreamOf("icp")`'s stages reset (their opportunity columns
actually clear, not just the stage-status row); upstream/unrelated stages untouched.
**Covers:** `lib/pipeline/{dependencies,invalidate}.ts`.

### TC-DISCOVERY-036: A pipeline run id is re-validated server-side against the caller's own workspace on every per-stage request
**Priority:** P0 (tenant-safety — a bare FK only checks the row exists, not who it
belongs to) · **Story:** 14.1
**Steps:**
1. Pass a real `runId` belonging to a different workspace's run into a per-stage
   request.
**Expected result:** Silently treated as "no run," never attaching that history to the
wrong tenant's pipeline.
**Covers:** `run-ai-discovery/route.ts`'s `getPipelineRun(workspaceId, runId)` guard.

### TC-DISCOVERY-037: ICP `confidence`/`evidence` are AI provenance judgments — never editable, cleared on manual edit, never cloned
**Priority:** P0 (the task's own explicit ICP-confidence callout) · **Story:** 13.1
**Steps:**
1. Generate an ICP (expect `confidence`/`evidence` populated).
2. Manually edit any field via the plain edit form.
3. Clone this ICP into another workspace via `cloneIcpProfileToWorkspace`.
**Expected result:** (2) both reset to `null`/`[]`, alongside the existing
`status→draft` reset. (3) the clone's `confidence`/`evidence` stay `null`/`[]` even
though every other field copies — evidence about one offering's product must never
misrepresent support for a different offering.
**Covers:** `20260912090000_discovery_icp_confidence_evidence.sql`, `lib/icp/mutations.ts`.

### TC-DISCOVERY-038: Prospect research evidence distinguishes first-party from external sources; a missing prospect website degrades gracefully
**Priority:** P1 · **Story:** 12.2
**Steps:**
1. Research a prospect with a live website.
2. Research one with none/unreachable.
**Expected result:** (1) `source_type: "first_party"` items alongside `"external"`
ones. (2) the run still succeeds using external findings only.
**Covers:** `lib/ai/research-prospect.ts`.

## Phase F / P1 (not yet started)

None of `docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md`'s P1-01.1 through P1-05.4
has shipped — confirmed against that backlog's own progress table. No test cases yet.
