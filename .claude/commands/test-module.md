---
description: Run one platform module's automated tests on demand (package vitest suite + its DB/RLS + workflow scripts).
argument-hint: <core|discovery|inventory|fsm|crm|gst|all>
---

Run `node scripts/test-module.mjs $ARGUMENTS` and report the result.

- If it exits 0, say which module passed and how many scripts ran.
- If it fails, show the failing script's name and the actual error output (not just
  "it failed") -- e.g. an RLS assertion mismatch, a Postgres error, or a typecheck
  failure in the package suite -- then say whether it looks like a real regression or
  an environment issue (e.g. no local Postgres running -- see scripts/lib/rls-test-harness.mjs).
- Do not fix anything unless asked to; this command is for running and reporting.
