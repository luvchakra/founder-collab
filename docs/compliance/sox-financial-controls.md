# Financial-reporting controls (SOX ITGC / ICFR)

Implemented in `supabase/migrations/20260908100000_core_financial_controls.sql`; proven by
`scripts/test-core-financial-controls.mjs`. All of it is enforced in Postgres, so it holds
for every code path: inventory's compat views, FSM, the GST module, scripts, and the service role.

## Control matrix

| # | Risk | Control | Type |
|---|---|---|---|
| FC-1 | Audit evidence altered or deleted | `core.audit_log` is append-only for **every** role (trigger, not just RLS; `TRUNCATE` blocked). Each entry carries a per-business `seq` and a SHA-256 hash chain (`prev_hash` -> `row_hash`); `core.verify_audit_chain()` detects altered, deleted or reordered entries. `created_at` is server-forced (no backdating). | Preventive + detective |
| FC-2 | Forged audit entries | `write_audit_log()` checks business membership and forces `actor_id = auth.uid()` for user callers; internal triggers use `append_audit_log()`, which no client role can execute. | Preventive |
| FC-3 | Issued documents edited after the fact | `core.post_document()` (needs `documents.post`) locks a document's party, number, dates, amounts and lines. Corrections are made with a credit/debit note. Documents are auto-posted when a payment is first allocated. | Preventive |
| FC-4 | Invoices deleted, breaking gap-free numbering | Numbered invoices, credit notes and debit notes can never be deleted, posted or not. | Preventive |
| FC-5 | Prior-period figures changed after close | `core.financial_close.closed_through`: nothing dated on or before it can be created, changed or deleted (documents, lines, payments). Closing needs `finance.close_period`; reopening needs `finance.reopen_period` (a **different** permission) plus a written reason; both are audited. | Preventive |
| FC-6 | Payments altered or deleted | Payments are immutable once recorded (only `notes` may change) and are never deleted; `core.void_payment()` needs `payments.void` and a reason. Allocations are insert-only. Voided payments drop out of `document_balances`. | Preventive |
| FC-7 | One person records and reverses a payment | Maker-checker in `void_payment()`: whoever recorded a payment can't void it unless they're an owner/admin. | Preventive (SoD) |
| FC-8 | Excessive access | Permissions split by duty: `payments.record`, `payments.void`, `documents.post`, `finance.close_period`, `finance.reopen_period`, `audit.view`, `billing.manage`, `privacy.manage`. Accountants can close but not reopen; sales managers can record but not void. | Preventive (SoD) |
| FC-9 | Unreviewed access changes | Every `business_members` add, role change and removal is audited (ITGC user access management), as are license and subscription status changes and payment-gateway connect/disconnect. | Detective |
| FC-10 | Online payments recorded wrong | `core.record_gateway_payment()` is atomic and idempotent, rejects amount/currency mismatches against the payment request, and lands in the same ledger, under the same controls, as manual payments. | Preventive |
| FC-11 | Records lost before retention ends | Business deletion is blocked while it holds posted/numbered tax documents; the audit trail outlives deleted businesses (no FK) and records `business.deleted`. Audit rows can only be purged after 8 years (GST: CGST Act s.36; SOX s.802: 7 years). | Preventive |

Evidence for auditors: **Settings -> Audit & controls** shows the log, the chain-integrity
result and the close date; `select * from core.verify_audit_chain('<business>')`.

## Limits, and the operating procedures that cover them

- **Tail truncation.** A hash chain can't detect removal of its *newest* entries by
  someone with superuser access who disables triggers. Mitigation: periodically export
  each business's latest `(seq, row_hash)` to storage outside the database (WORM bucket
  or ticket); a later verify run proves the chain still contains that head.
  `select business_id, max(seq), (array_agg(row_hash order by seq desc))[1] from core.audit_log group by 1;`
- **Superuser access** to Postgres bypasses triggers (`session_replication_role`). Restrict
  it to break-glass use, log it in Supabase, and review the access log.
- **Owners/admins hold every permission**, by design for small businesses. Where SoD
  matters, give staff `accountant`/`sales_manager` roles rather than admin.
- **Posting is explicit** for inventory documents (StockPilot's flow never "issues" an
  invoice). Period close covers them regardless; SP-7/F-8 should call
  `post_document()` when a document is sent to the customer.

## Required operating procedures (management-owned)

1. Monthly close: post all issued documents, reconcile `document_aging`, then close the period.
2. Quarterly access review: export business members and roles, and sign off.
3. Quarterly: run `verify_audit_chain` for every business and anchor the chain heads.
4. Change management: GitHub branch protection plus required CI on `main` (see `security.md`).
