# Test Coverage Index

Single source of truth for coverage state, across both automated scripts and
documented cases. Update this table in the same commit as any change to a test-case
file or `scripts/test-*.mjs`. See `TESTING_STRATEGY.md` for the policy.

**First execution pass:** 2026-09-08, see `../EXECUTION-2026-09-08.md` for what was
actually run/traced against `main` and what it found (four real gaps, none caught by
the existing automated suite: ADR-9's grace-period expiry is never invoked by anything,
`fsm`'s `cancelJob()` leaks reserved inventory stock forever, GST GSP credentials are
stored in plaintext rather than encrypted like BYOK keys, and `requireModule()` — named
by `CLAUDE.md` as a required enforcement layer — doesn't exist in the codebase).

Status values: `Automated` (real script/test in CI path) · `Documented` (manual case
file exists) · `Both` · `Partial` · `Not started`.

| Module | Test-case file | Automated coverage (existing) | Status | Notes |
|---|---|---|---|---|
| `core` | [core.md](test-cases/core.md) | `test-core-{parties,addresses,items,number-sequences,documents,payments,tags-fields-attachments,domain-events,audit-log,api-keys,messages}-rls.mjs` | Both | RLS layer thorough; license-lifecycle workflow (§5 of strategy doc) still only documented |
| `discovery` | [discovery.md](test-cases/discovery.md) | `test-discovery-rls.mjs`, `test-discovery-party-backfill.mjs` | Both | Feature/AI-pipeline behavior documented only; consider porting `co-founder-ai`'s `score-prospect`/`normalize-url` unit tests into this package |
| `inventory` | [inventory.md](test-cases/inventory.md) | `test-inventory-{rls,procedural,compat-views}.mjs`, `test-sales-returns-workflow.mjs` | Both | Best-covered module at the automated-workflow level; extend that pattern to PO/SO/invoice chains |
| `fsm` | [fsm.md](test-cases/fsm.md) | `test-fsm-rls.mjs`, `test-fsm-workflow.mjs` | Both | Workflow script covers the opportunity→job→invoice chain, tenant isolation, and `core.has_permission()` data for the `opportunities.edit`/`estimates.edit`/`jobs.edit`/`jobs.reopen` keys added this pass (TC-FSM-015..018) — fixed a real gap where those permissions were declared in migrations but never enforced anywhere in application code. Still a DB-level harness only: the actual `requirePermission()` TS call sites and job status-transition guards aren't exercised by an automated test yet (see the script's own header comment) — that needs a TS-level harness this repo doesn't have. `schedule.manage`/`schedule.print_work_orders`/`time_entries.edit`/`expenses.edit`/`notes.edit`/`messages.manage` permission enforcement was out of scope for this pass and remains unverified — same likely gap, not yet audited |
| `crm` | [crm.md](test-cases/crm.md) | `test-crm-rls.mjs` | Partial | Deliberately thin — module is still a skeleton (S-1..S-3), no fine-grained permission model or routing engine yet (confirmed against source, not assumed — TC-CRM-001/003 corrected from an earlier overclaim). This pass added grace-period read/write coverage (TC-CRM-004) and fixed+tested a real bug: `updateTicketStatus`/`assignTicket`/`setChannelActive`/`setRoutingRuleActive` silently no-op'd on an RLS-denied update instead of throwing (TC-CRM-005) — the same silent-UPDATE-failure class is worth auditing in other modules' id-only setters too |
| `gst` | [gst.md](test-cases/gst.md) | `test-gst-credentials-rls.mjs`, `test-gst-generation-history-rls.mjs` | Both | Filing-generation workflow (success/failure/cancel) documented only |
| Platform shell (non-module) | [platform-shell.md](test-cases/platform-shell.md) | `scripts/lint-import-boundaries.mjs` (+ its own test), `perf-check-tenant-license-rls.mjs` | Partial | UI/UX area — hold off on e2e until shell stops churning (see strategy §5) |
| Menu / navigation smoke (all modules) | [menu-smoke.md](test-cases/menu-smoke.md) | `apps/web/tests/menu-routes.test.ts` | Both | **3 confirmed failing items**: 2 in `fsm` (missing route files) + 1 platform-wide licensing-filter gap that explains the reported CRM/GST 404s (sidebar shows unlicensed modules — confirmed against real dev-DB license data) — fix before next release |
| Cross-cutting architecture rules | — | `lint-import-boundaries.mjs`, `lint-migration-schema.mjs` | Automated | Enforced in the `npm test`/CI path already; not duplicated here |

## How to add a new row

New module moves past skeleton, or a new cross-cutting concern emerges → add a row
here in the same PR that adds or meaningfully extends its test-case file.
