# WonderArk Finance (F-series) build progress

Story-by-story record for the Finance module, built from
`wonderark-finance-claude-code-autonomous-requirements.md`. Same purpose as
`docs/FSM-PROGRESS.md` and `docs/EPIC6-PROGRESS.md`: what shipped, what it decided, and
what is deliberately not built yet.

The module key, Postgres schema and permission namespace all stay `gst` (CLAUDE.md
non-negotiable #1 — renaming the key would mean renaming the schema, every licence row's
`module_key` and the route prefix). Only the display name and URL segment are "Finance",
the same way `fsm` is displayed as "Service".

## Status

| Phase | Status | Commit | Notes |
|---|---|---|---|
| F0 | Done | — | Compliance → Finance rename, nav, routes, `/gst` + `/compliance` redirects |
| F1 | Done | — | Accounting foundation: accounts, periods, journal entries/lines, mappings, balances view |
| F2 | Done | `ed1ef3d` `0d13019` `f6b7f4b` `d9cf354` | Chart of accounts + provisioning, accounting periods, journal, automatic posting |
| F3 | Done | `1ac2539` | Banking: bank accounts, statement import, matching, reconciliation |
| F4 | Done | `f6b7f4b` | Posting engine wired to the ledger (rules engine itself landed with F2) |
| F5/F6 | Partial | `d9cf354` `041e857` | Inventory/Service integration via `document.issued` + `payment.allocated`; no module internals crossed |
| F7 | Done | `79f36ba` | GST ledger reconciled against the return |
| F8 | Not started | — | GSTR-2B reconciliation against the ledger |
| F9 | Not started | — | Filing readiness |
| F10 | Not started | — | Budgets, recurring entries, AI assistance |
| Reports | Done | `652f8db` | P&L, balance sheet, trial balance |
| Dashboard | Done | `39a95e8` | Money snapshot + unposted documents |
| Receivables | Done | `609bfcb` | Aging by customer and by invoice |
| **Payables** | **Blocked** | — | See "Blocked on a decision" below |

## Blocked on a decision

**There is no supplier bill / purchase invoice in the platform.** `core.documents`'
`doc_type` check allows `estimate, sales_order, invoice, credit_note, debit_note,
proforma_invoice, purchase_order, sales_return`. A purchase *order* is a commitment, not
a bill, so nothing represents "a supplier has invoiced us and we owe them by a date".

Finance's posting rules already handle `supplier_bill.created` and its aging arithmetic is
module-agnostic, so **Payables is the one Finance screen that cannot be built from
existing data**. Adding the doc_type changes the entity-ownership map
(`docs/plan/00-MASTER-PLAN.md` §5) and needs sign-off — a Finance-local bills table would
be exactly the triplication that section exists to prevent.

## Bugs found while building, and fixed

Each was caught by building the thing that depends on it, not by a separate audit.

| Bug | Found by | Fix |
|---|---|---|
| **The GST return excluded every Service invoice.** `getSalesRegister`/`getPurchaseRegister` filtered `source_module='inventory'`, carried over from StockPilot where inventory *was* the app. ₹2,196 of output tax on 3 invoices unreported against ₹63,070 counted, on the dev database. A service business would have filed an understated return. | F7's reconciliation | Filter removed from both registers — a GST return covers the supplies of the *business*, not of whichever module raised the paperwork (`79f36ba`) |
| **Reversing an entry swung the account to minus the original amount.** `gst.account_balances` counted only `posted`, but reversing marks the original `reversed`, so the original dropped out while its reversal stayed in. Reversing a ₹1,180 invoice moved receivables to −1,180 instead of 0. | Running the real write path against the dev database | `reversed` counts too — it means "posted, and since offset", not "never happened" (`f6b7f4b`) |
| **Payments never reached the ledger.** Invoices posted their receivable and nothing cleared it, so the dashboard's "Owed to you" (ledger) and Receivables (allocations) diverged with every payment. | Building Receivables next to the dashboard | `core.payments` publishes `payment.allocated`; Finance subscribes (`041e857`) |
| **Input GST had no account of its own.** The `input_gst` role resolved to `1600 Other Current Assets`, a non-system generic bucket — ITC not separable, and the account automatic purchase postings target could be switched off. | A chart-of-accounts test asserting every role's account is a system account | Own system account, `1700 Input GST` (`ed1ef3d`) |
| **A silently short trial balance.** Summing fetched lines in TypeScript would hit PostgREST's default page cap; a busy business would have got a quietly wrong statement. | Writing the reports query | Aggregation moved into `gst.account_period_totals` (`652f8db`) |
| **Bank CSV import read `Date,Description,Amount` as having a credit column.** The two-letter aliases `cr`/`dr` substring-matched inside "des-cr-iption", so no amount could be read off any row. | The importer's own tests | Header matching on whole words (`1ac2539`) |
| Five lucide icon names used by the crm/fsm/gst manifests were missing from the shell's resolver and silently rendered the fallback. | Adding a nav icon | Added to `module-icon.tsx` (`ed1ef3d`) |

## Decisions worth not re-litigating

- **A bank account is not a ledger account.** One is where money is recorded, the other
  where it physically sits; joined by `ledger_account_id`. Three current accounts can
  share one "Bank" ledger account, or each have their own.
- **Matching suggests, never decides.** A wrong automatic match is worse than no match:
  it hides a real missing entry behind a plausible one, and nobody re-checks a
  transaction already ticked off. The amount is a gate (wrong amount or sign scores
  nothing at all), candidates come back ranked with reasons, and "one clear match" is
  claimed only when the best is both confident *and* unrivalled.
- **The importer never drops a row silently.** A statement that imports "successfully"
  with four rows missing gives a reconciliation that won't balance and nothing on screen
  to explain it.
- **A reconciliation with a difference still records.** A known, explained gap someone
  accepted is a normal outcome; refusing it pushes the reconciliation into a spreadsheet
  nobody can see. But "reconciled" needs agreement *and* nothing left hanging.
- **Correction is by reversal, never by edit.** Both halves stay in the account's history,
  which is what an audit asks for. A filed period is never reopened.
- **The balance sheet shows the period's profit as its own equity line.** Until the year
  is closed nothing has moved trading results into retained earnings, so leaving it out
  puts the sheet out by exactly the profit — the classic "my balance sheet doesn't
  balance" that is a missing line, not a broken ledger.
- **Posting refusals are values, not exceptions.** "No accounting consequence" and "the
  chart of accounts isn't set up" are not fixed by the drain retrying with backoff.
  Unposted documents surface on the dashboard instead — automatic posting that silently
  does nothing is worse than no automatic posting.

## Flagged, not reconciled

**Credit notes link to their invoice under two different `source_ref` keys.** Service
writes `source_ref.invoice_id`, Inventory writes `source_ref.sales_invoice_id`. Finance
reads both (`lib/accounting/receivables.ts#creditedInvoiceId`) because reading one would
silently overstate receivables for the other module. Unifying the key is a change to two
other modules' data, not Finance's to make. Also recorded in
`docs/plan/00-MASTER-PLAN.md` §5.

## Migrations

Applied to the dev project (`jazdtomcgqjxjueedmck`) as each story landed:

| Migration | What |
|---|---|
| `20260917200000_gst_accounting_foundation` | F1: accounts, periods, journal entries/lines, mappings, balances view, 3 permissions |
| `20260917210000_gst_account_balances_include_reversed` | The reversal bug above |
| `20260917220000_core_has_module_write_service_role` | The drain has no session; its own gate would let a posting through during ADR-9's read-only grace period |
| `20260917230000_gst_account_period_totals` | Statement totals aggregated in SQL, not in the page |
| `20260917240000_gst_banking` | F3: bank accounts, transactions, reconciliations, `gst.banking.manage` |
