# Test cases: `gst` (stories: GST profile/e-Way Bill/e-Invoicing split-off, S-2 filing)

Covers `packages/module-gst/src/**`. Split out from `inventory` (`1bd4b2d`) so other
modules' documents (FSM invoices, inventory sales invoices) can call into GST
features without `inventory` owning GST logic directly — the cross-module contract
boundary is the main thing worth testing here, on top of GST correctness itself.

### TC-GST-001: e-Way Bill and e-Invoicing credentials are encrypted and business-scoped
**Feature:** `b857eb3` — credential settings forms, `test-gst-credentials-rls.mjs` covers RLS.
**Priority:** P0 · **Story:** post-split settings
**Steps:**
1. Save e-Way Bill/e-Invoicing credentials for Business A.
2. Inspect the stored value directly in the database.
**Expected result:** Encrypted at rest (same standard as BYOK keys in `core.crypto`,
TC-BYOK-style expectation carried over from discovery) — not plaintext.

### TC-GST-002: GST Filing generation history records a successful attempt — a failed one is not recorded at all
**Feature:** `b2a6f6d` — generation-history tables + `document.issued` consumer.
**Priority:** P0 · **Story:** S-2
**Correction:** this case previously claimed a failed generation attempt (e.g. a GSP
rejecting the request) "should still be recorded, not silently dropped" with a
`status`/`failure` value. That's not how the actual schema or code work, confirmed by
reading both: `gst.einvoices`/`gst.eway_bills`' own check constraint only allows
`status in ('generated', 'cancelled')` — there is no `'failed'` state to record — and
`generateEinvoice()`/`generateEwayBill()` (`packages/module-gst/src/lib/{einvoicing,
eway-bill}/mutations.ts`) call `.insert()` only *after* a successful GSP response; a
thrown error (missing credentials, a rejected/unreachable GSP call) exits the function
before that insert ever runs. A failed attempt today leaves zero trace in
`gst.einvoices`/`gst.eway_bills` — the caller sees the thrown error (per TC-GST-007's
own error-message fix), but nothing is persisted for later audit.
**Steps:**
1. Configure valid e-Invoicing credentials, issue an invoice, trigger generation.
2. Check `gst.einvoices` for that document.
3. Configure credentials pointing at a GSP endpoint that returns an error (or omit
   credentials entirely), trigger generation again for a different document.
4. Check `gst.einvoices` for that second document.
**Expected result (current, accurate):** Step 2 finds exactly one row, `status =
'generated'`, IRN/ack fields populated. Step 4 finds **no row at all** — the failure
surfaced only as a thrown error to whoever clicked "Generate," with nothing recorded.
**If a real audit trail of failed attempts is wanted later:** that needs a schema
change (a `'failed'` status, or a separate attempts-log table distinct from this
"one row per document, ever" design) — flagging as a real, currently-open gap rather
than building it speculatively in this pass.
**Automated coverage:** `scripts/test-gst-generation-history-rls.mjs` (successful-insert
path, RLS/tenant/permission gating around it) plus the new
`packages/module-gst/src/lib/gsp-client.test.ts` (`callGsp`'s own sanitized-error-message
coverage, TC-GST-007). Nothing exercises "does a failed generation leave a row behind"
because the current code guarantees it never does — there is nothing to assert yet.

### TC-GST-003: Manual generate/cancel UI matches the recorded history state
**Feature:** S-2's manual generate/cancel actions.
**Priority:** P1 · **Story:** S-2
**Steps:**
1. Manually cancel a previously generated filing.
**Expected result:** Generation-history reflects the cancellation; re-generating
afterward creates a new history entry rather than mutating the cancelled one
(audit-trail preservation, same principle as TC-FSM-006's void behavior).

### TC-GST-004: Inventory sales invoices call GST via contract, not direct import
**Feature:** Cross-module boundary enforcement (ADR non-negotiable #3), specifically
for the inventory→gst path noted in `inventory.md` TC-INVENTORY-010.
**Priority:** P0 · **Story:** post-split
**Steps:**
1. Search `module-inventory`'s source for any import reaching into
   `module-gst/src/lib/**` or `src/db/**` directly (not `src/contract`).
**Expected result:** None found — `lint:boundaries` should already catch this in CI;
this case is the manual spot-check to run if that lint rule itself is ever suspected
of a gap.

### TC-GST-005: GST module degrades gracefully when not licensed
**Feature:** ADR-10, applied to the FSM/inventory→GST handoffs.
**Priority:** P0 · **Story:** ongoing
**Steps:**
1. With `gst` not licensed, issue an invoice from `fsm` or `inventory` that would
   normally trigger GST filing.
**Expected result:** Invoice issues normally; the GST contract call returns
`MODULE_NOT_LICENSED` and the caller proceeds without error — no filing attempted,
no crash.

### TC-GST-006: The module's sidebar scope stays complete under its current "Compliance" name
**Feature:** `af7a35b` — originally "completes the GST module's 4 sidebar menu items";
re-scoped after the GST→Compliance rename (this platform session's own task #65) added
a 5th item.
**Correction:** the module now has **5** nav items, not 4 —
`packages/module-registry/src/index.ts`'s `gst` entry (display `name: "Compliance"`,
`key`/schema/`routePrefix` deliberately still `"gst"` per CLAUDE.md non-negotiable #1)
lists an "Overview" group with "Dashboard" plus a "GST" group with "GST Profile",
"e-Way Bill", "e-Invoicing", and "GST Filing". Updating the count here rather than
leaving "4" to quietly mislead the next reader.
**Priority:** P2 · **Story:** af7a35b, extended by task #65
**Steps:**
1. Confirm all 5 documented sidebar menu items for `gst`/Compliance are reachable and
   none 404.
**Expected result:** All 5 present and functional.
**Automated coverage:** `apps/web/tests/menu-routes.test.ts` — generic, registry-driven
(iterates every module's `nav` array, not a hardcoded gst-specific count), so it already
self-updates whenever this list changes; no manual case is needed to keep it in sync,
only to notice when the *description* here goes stale, as it just did.

### TC-GST-007: A failed GSP call surfaces a clean, actionable message — not a raw URL and HTTP status
**Feature:** `packages/module-gst/src/lib/gsp-client.ts#callGsp`, shared by
`generateEinvoice`/`cancelEinvoice`/`generateEwayBill`/`cancelEwayBill`.
**Priority:** P0 · **Story:** error-message audit (this pass)
**Background — a real bug found and fixed this session:** `callGsp` used to throw
`` `GSP request to ${url} failed: ${response.status} ${response.statusText}` `` — the
business's own configured GSP endpoint URL, verbatim, plus a bare HTTP status. The only
thing catching this (`apps/web/components/gst/gst-document-panel.tsx`'s `DocRow`) does
`err instanceof Error ? err.message : "Something went wrong."` and renders it directly
under the Generate/Cancel button — so a business owner clicking "Generate" on an
e-invoice with a misconfigured GSP would see the internal endpoint URL and a raw status
code, nothing they could act on. Fixed by sanitizing every failure mode inside
`callGsp` itself (auth rejection, other HTTP failure, unreachable host, malformed
response) into a specific, actionable message with no URL in it, while still logging
the full detail server-side via `console.error` for whoever debugs it later.
**Steps:**
1. Call `callGsp` against a URL that returns HTTP 401 or 403.
2. Call it against a URL that returns some other non-2xx status (e.g. 500).
3. Call it against an unreachable host (network/DNS failure).
4. Call it against a URL that returns HTTP 200 with a non-JSON body.
**Expected result:** Each throws a distinct, actionable `Error` — "credentials
rejected," "provider could not process this request (HTTP `<code>`)," "could not reach
the configured GST service provider," and "returned an unexpected response,"
respectively — and none of the four thrown messages contain the request URL.
**Automated coverage:** `packages/module-gst/src/lib/gsp-client.test.ts` — a real
TypeScript-level unit test (mocked `global.fetch`, no live GSP or database needed),
following the same precedent this file's own `decryptGspSecrets` tests already set.
This is the first genuinely TS-level (not raw-SQL) automated test added across this
whole test-deepening pass — worth reusing this pattern (mock the one external
boundary, assert on the thrown message) for other pure-logic error paths, rather than
assuming this repo's raw-SQL harness is the only testing tool available.
