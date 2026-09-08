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
| `fsm` | [fsm.md](test-cases/fsm.md) | `test-fsm-rls.mjs` | Partial | RLS only; no workflow automation yet despite being the largest module by story count (F-1..F-15) — highest-value next target |
| `crm` | [crm.md](test-cases/crm.md) | `test-crm-rls.mjs` | Partial | Deliberately thin — module is still a skeleton (S-1..S-3) |
| `gst` | [gst.md](test-cases/gst.md) | `test-gst-credentials-rls.mjs`, `test-gst-generation-history-rls.mjs` | Both | Filing-generation workflow (success/failure/cancel) documented only |
| Platform shell (non-module) | [platform-shell.md](test-cases/platform-shell.md) | `scripts/lint-import-boundaries.mjs` (+ its own test), `perf-check-tenant-license-rls.mjs` | Partial | UI/UX area — hold off on e2e until shell stops churning (see strategy §5) |
| Cross-cutting architecture rules | — | `lint-import-boundaries.mjs`, `lint-migration-schema.mjs` | Automated | Enforced in the `npm test`/CI path already; not duplicated here |

## How to add a new row

New module moves past skeleton, or a new cross-cutting concern emerges → add a row
here in the same PR that adds or meaningfully extends its test-case file.
