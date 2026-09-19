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
| FIN-1 | Done | `e7138b2` | Exceptions queue: unposted documents, ITC at risk, filing blockers, one triage queue |
| FIN-2 | Done | `pending` | Backfill: scans documents + payment allocations, posts the eligible ones, routes the rest to FIN-1 |
| F0 | Done | — | Compliance → Finance rename, nav, routes, `/gst` + `/compliance` redirects |
| F1 | Done | — | Accounting foundation: accounts, periods, journal entries/lines, mappings, balances view |
| F2 | Done | `ed1ef3d` `0d13019` `f6b7f4b` `d9cf354` | Chart of accounts + provisioning, accounting periods, journal, automatic posting |
| F3 | Done | `1ac2539` | Banking: bank accounts, statement import, matching, reconciliation |
| F4 | Done | `f6b7f4b` | Posting engine wired to the ledger (rules engine itself landed with F2) |
| F5/F6 | Partial | `d9cf354` `041e857` | Inventory/Service integration via `document.issued` + `payment.allocated`; no module internals crossed |
| F7 | Done | `79f36ba` | GST ledger reconciled against the return |
| F8 | Done | `11e53c7` | ITC view: ledger vs purchase register vs GSTR-2B, with what is claimable and what is at risk |
| F9 | Done | `9a33e77` | Filing readiness: one pre-flight check drawing on the ledger, registers, 2B, bank and period lock |
| F10 | Done | `89e605e` + `pending` | Recurring entries (template + schedule + drain) and budget vs actual. No AI: Finance is deterministic arithmetic, and CLAUDE.md #4 says not to use an LLM for that |
| Reports | Done | `652f8db` | P&L, balance sheet, trial balance |
| Dashboard | Done | `39a95e8` | Money snapshot + unposted documents |
| Receivables | Done | `609bfcb` | Aging by customer and by invoice |
| Bills (§19) | Done | `d25b1d2` | Hand entry for supplier bills |
| Expenses (§20) | Done | `d25b1d2` | Hand entry, optionally paid on the spot |
| Payments (§21) | Done | `d25b1d2` | One payment across a supplier's bills, from Payables |
| **Payables** | Done | `7e87a40` | Supplier bills are now canonical `core.documents`; aging by supplier and by bill |

## Resolved: supplier bills are canonical documents

`core.documents` had no supplier bill / purchase invoice type, which made Accounts Payable
the one Finance screen that could not be built. Signed off and added 2026-09-18
(`20260918120000_core_supplier_bill_doc_type`), along with `supplier_credit`.

Put in `core.documents` rather than a Finance-local table so payments, parties and
allocations work on bills unchanged, and so Inventory can raise them against its own
purchase orders later. A purchase order deliberately still does not count as a payable: it
creates no liability and is routinely for a different amount than what is billed.

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
| **A bill or supplier credit that failed to post never showed up as unposted anywhere.** `listUnpostedDocuments`'s own `POSTABLE_DOC_TYPES` list (`invoice`/`credit_note`/`debit_note`/`sales_return`) was a second, silently drifted copy of `document-events.ts`'s `EVENT_BY_DOC_TYPE`, which had grown to include `supplier_bill`/`supplier_credit` when Payables shipped without the dashboard's own list being updated alongside it. | Scoping FIN-2's backfill to "invoices, bills, payments and expenses" and finding bills fell out of the scan entirely | `POSTABLE_DOC_TYPES` is now exported from `document-events.ts` (the one place that already had to stay correct) and imported everywhere else needs it, so there is one list, not two (`pending`) |

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

## What remains, against the spec's own 54 sections

Tracked as **Epic 7** in `docs/plan/04-CLAUDE-CODE-BACKLOG.md` (`FIN-1` … `FIN-13`).
Surveyed 2026-09-18 against
`wonderark-finance-claude-code-autonomous-requirements.md`, section by section, not from
memory. The accounting engine, the ledger and the reporting on top of it are done. What is
left is mostly *entry* screens and the onboarding path — Finance can currently read and
reconcile everything the operational modules produce, but a founder cannot yet type a bill
or an expense into it directly.

### Entry screens — built 2026-09-18

Bills, expenses and payments can now be entered directly, which is what made Finance
read-only for anything not raised in Inventory or Service.

**A bill and an expense are one document.** `core.documents` with
`doc_type = 'supplier_bill'`, differing only in which account takes the value and whether
money moved at the same time. Separate tables would be the triplication §5 exists to
prevent, and every payables query would have had to read two places and hope they agreed.
Which it was is recorded in `source_ref.kind`.

**Entered header-only.** `core.document_lines` requires an `item_id` and a rent bill has no
item — but more to the point, a supplier's line detail is on the supplier's own paper, and
re-keying it to reach a total the bill already states buys nothing. Verified that header
totals survive: with no lines the recompute trigger never fires, so it cannot zero them.

**A chosen account beats the role.** The posting rules resolve accounts by role, and no
role means "Rent". Bills carry `valueAccountId`, and the rule's value line is now marked
so `postFinanceEvent` substitutes it — for that line only, leaving tax and the payable to
resolve by role as before. Without this a founder picks Rent and the money lands in
Inventory Asset.

**Posting still goes through the drain**, not inline. Finance already has one path from a
document to its ledger entry with idempotency the database enforces; a second inline path
would be a second place for that to be wrong. The e-invoicing handler on the same event
guards on `docType === 'invoice'`, so a bill passes it by.

### Exceptions queue (FIN-1) — built 2026-09-19

One triage queue, `gst.finance_exceptions`, over the three sources §38 named as scattered:
unposted documents (the dashboard), ITC at risk (the GST ledger), filing blockers
(readiness). Those three screens keep their own live view; the queue sits on top, with
Open/In Review/Resolved/Ignored status and an assignable owner.

**A second table, not a widened `gst.reconciliation_exceptions`.** That table already
persists a triage queue, but a narrower one built for GSTR-2B reconciliation/IMS, with a
three-state status (`open`/`resolved`/`dismissed`) and its own `exception_type` check
constraint its own migration says widening is a future story's call. FIN-1's four states
and three different sources didn't fit it, so `gst.finance_exceptions` is additive, same
precedent as every other "new kind of exception source" in this schema.

**Sync is additive-only and manual**, same rule as the reconciliation queue's own sync: a
fresh sync inserts an `open` row for a candidate with no existing row for its own natural
key, and never touches an existing row's own status — nobody's triage decision is silently
undone by a re-sync. It's a button, not automatic on page load, because it's a write.

**The `posted` filing-readiness blocker is deliberately excluded** from the filing-blocker
exceptions: it's the same underlying fact the unposted-document exceptions already raise
one row per document for, and repeating it as a fourth, coarser exception would just be the
same issue counted twice.

### Backfill (FIN-2) — built 2026-09-19

Scans `core.documents` and `core.payment_allocations` for anything with an accounting
consequence that hasn't reached `gst.journal_entries` yet -- typically the whole of a
business's history from before it licensed Finance -- and posts the eligible ones.

**No posting path of its own.** The scan hands each candidate to
`postIssuedDocument`/`postPaymentAllocation`, the exact functions the live
`document.issued`/`payment.allocated` event drain already calls. A second way to reach the
ledger is a second place for that to disagree with the first, and idempotency is already
solved there (the unique index on `idempotency_key`/`source_entity_id`) -- running the
backfill twice, or after the drain has already caught some of the same history, converges
on the same ledger either way. "Must never silently duplicate history" falls out of reusing
that path rather than needing its own guarantee.

**Scan-then-run, not a predictive preview.** Whether an entry will actually post depends on
the chart of accounts being set up -- state a dry run would have to fake to answer
honestly. So the screen shows what will be *attempted* (a count of unposted documents and
payments) and the run's own result says what happened, rather than a preview that
guesses.

**Whatever can't post is routed into `gst.finance_exceptions`** (the same additive-insert
FIN-1's own sync uses) rather than reported once and dropped. A new `unposted_payment`
exception type was added for this (`20260919110000_gst_finance_exceptions_unposted_payment`)
-- a payment allocation isn't a `core.documents` row, so reusing `unposted_document` would
have made `reference_key` ambiguous between the two.

### Not built

| § | Item | Note |
|---|---|---|
| 18 | Finance invoice view | Invoices list with accounting / payment / GST / e-invoice status kept independent. The data all exists; this is a screen. |
| 24 | Bank rules | Saved categorisation rules. Matching is built and suggests per transaction; rules would make the suggestions persistent. |
| 28 | Cash flow statement | The other three statements are done. |
| 28 | Operational reports | Sales by customer/product/service, purchase and expense summaries, inventory valuation, COGS, gross margin. |
| 28 | Drill-down from reports | "Every report must drill into underlying transactions" — the journal has drill-down, the statements do not yet. |
| 29 | Dimensions | `gst.journal_lines` already carries `party_id`, `item_id`, `location`, `project_ref`; nothing configures or reports on them. |
| 39 | AI finance assistant | Deliberately not built — see below. |
| 41 | Backfill | Scan and post existing history when Finance is activated. Idempotency is already solved (every posting is keyed), so this is the scan, the preview and the exception routing. |
| 42 | Activation wizard | The ten-step first-run flow. Every step exists as its own screen; nothing sequences them. |
| 52 | Seed data | The deterministic Finance fixture set (30 invoices, 20 bills, locked period, failed e-invoice, duplicate scenarios…). |

### Partly built

- **§40 Explainable accounting** — every automatic entry records the rule and version that
  produced it and explains itself in plain language on the entry page. What is missing is
  the reverse direction: from a source document to the entries it caused.
- **§53 Edge cases** — most are covered as unit tests (duplicate event, partial payment,
  overpayment, refund, credit note after payment, closed period, invalid journal, duplicate
  bank transaction, purchase/sales return). Not covered end-to-end: licence cancellation
  and reactivation, historical backfill and duplicate backfill, negative inventory.

### Deliberately not built

**§39, the AI finance assistant.** Finance is deterministic arithmetic, and CLAUDE.md
principle 4 is explicit about not using an LLM for that. The spec's own AI touchpoints are
narrower than the section title suggests — categorisation suggestions (§20) and "do not
auto-post high-risk AI suggestions without configured approval" — and the genuinely fuzzy
case is categorising an unmatched bank line, which is a real candidate whenever it is
wanted. Recorded as a decision rather than an oversight.

## Migrations

Applied to the dev project (`jazdtomcgqjxjueedmck`) as each story landed:

| Migration | What |
|---|---|
| `20260917200000_gst_accounting_foundation` | F1: accounts, periods, journal entries/lines, mappings, balances view, 3 permissions |
| `20260917210000_gst_account_balances_include_reversed` | The reversal bug above |
| `20260917220000_core_has_module_write_service_role` | The drain has no session; its own gate would let a posting through during ADR-9's read-only grace period |
| `20260917230000_gst_account_period_totals` | Statement totals aggregated in SQL, not in the page |
| `20260917240000_gst_banking` | F3: bank accounts, transactions, reconciliations, `gst.banking.manage` |
| `20260918100000_gst_recurring_entries` | F10: recurring journal templates, reusing `gst.journal.create` |
| `20260918110000_gst_budgets` | F10: per-account, per-month budget lines, reusing `gst.accounts.write` |
| `20260918120000_core_supplier_bill_doc_type` | `supplier_bill` + `supplier_credit` on `core.documents`, unblocking Payables |
| `20260919100000_gst_finance_exceptions` | FIN-1: `gst.finance_exceptions`, `gst.exceptions.manage` permission |
| `20260919110000_gst_finance_exceptions_unposted_payment` | FIN-2: widened `exception_type` to add `unposted_payment` |
