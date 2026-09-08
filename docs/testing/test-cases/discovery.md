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

### TC-DISCOVERY-004: BYOK provider router still enforces "no fallback to a company key"
**Feature:** Ported BYOK layer (`f55ba0e`), same design as pre-port.
**Priority:** P0 · **Story:** P-2 (BYOK port)
**Steps:**
1. Exhaust a connected provider's quota.
2. Trigger any discovery AI operation.
**Expected result:** Fails with the real provider error, does not silently route to
a platform-owned key.

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
