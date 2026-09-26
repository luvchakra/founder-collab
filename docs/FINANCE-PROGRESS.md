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
| FIN-2 | Done | `9b0e055` | Backfill: scans documents + payment allocations, posts the eligible ones, routes the rest to FIN-1 |
| FIN-3 | Done | `pending` | Activation wizard: an 8-step checklist plus the accounting-method/fiscal-year settings and the activation record §42 was actually missing -- see below, this turned out bigger than "every step already exists as its own screen" |
| FIN-4 | Done | `pending` | Invoice view: every issued invoice from `core.documents` with accounting, payment, GST and e-invoice status as four independent columns |
| FIN-5 | Done | `pending` | Cash flow statement (direct method, straight off the ledger) — and the balance sheet now reads as at the period's end, see the bug below |
| FIN-6 | Done | `pending` | Operational reports: sales by customer/product/service, purchases and expenses, inventory valuation (via Inventory's contract), COGS and gross margin |
| FIN-7 | Done | `pending` | Report drill-down: every statement line opens the account's transactions for the same period, totalling to the figure clicked |
| FIN-8 | Done | `pending` | Bank rules: saved "description contains X → account Y" rules, suggested on unmatched lines; one click posts the entry and matches the line |
| FIN-12 | Done | `pending` | Explainable accounting in reverse: a source document's page lists every entry it caused, why, and the net effect |
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
| **A bill or supplier credit that failed to post never showed up as unposted anywhere.** `listUnpostedDocuments`'s own `POSTABLE_DOC_TYPES` list (`invoice`/`credit_note`/`debit_note`/`sales_return`) was a second, silently drifted copy of `document-events.ts`'s `EVENT_BY_DOC_TYPE`, which had grown to include `supplier_bill`/`supplier_credit` when Payables shipped without the dashboard's own list being updated alongside it. | Scoping FIN-2's backfill to "invoices, bills, payments and expenses" and finding bills fell out of the scan entirely | `POSTABLE_DOC_TYPES` is now exported from `document-events.ts` (the one place that already had to stay correct) and imported everywhere else needs it, so there is one list, not two (`9b0e055`) |

| **A balance sheet for any period but "since the beginning" was wrong.** It was built from the same period totals as the profit and loss, so "This month" showed each account's opening balance plus only this month's movement — the bank balance silently dropped every earlier month, and the profit line was the month's rather than the year's. It still balanced (both sides dropped the same history), which is why nothing flagged it. | FIN-5's cash flow, whose closing cash has to agree with the balance sheet's cash | `gst.account_statement_totals` returns period *and* as-at totals in one read; the balance sheet uses the as-at ones and its equity line is now "Profit to date" (`20260927100000`) |

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

### Activation wizard (FIN-3) — built 2026-09-19, and re-scoped on the way

The backlog's own framing ("every step already exists as its own screen; nothing orders
them or tracks completion") held for five of the ten steps -- chart of accounts, GST
profile, account mappings (implicit in chart provisioning), bank accounts, and a review
built from what those already report. It did not hold for the other five, checked against
the live code rather than assumed: **no screen or stored setting existed anywhere** for
accounting method, and fiscal year was a literal `4` hardcoded in six different files even
though `core.business_settings.fiscal_year_start_month` already existed as a column
nothing read or wrote; opening balances has no editable-after-creation path at all; and
nothing recorded whether a business had ever been through activation. Building all five
from scratch (rather than just sequencing existing screens) is why this shipped as one
migration to `core.business_settings` plus a whole new `gst` table, not the pure-UI story
the backlog's own size estimate implied. Recorded here rather than silently absorbed, per
this repo's own workflow rule ("if the story revealed the plan was wrong, update the plan
doc in the same commit").

**One checklist page, not a ten-page click-through.** Most of the ten steps are "go do this
on a screen that already exists and come back" -- trapping a founder in a linear wizard for
that is worse UX than a status list with links, so `/finance/activate` is a single page:
eight read-only step rows (chart of accounts, GST profile, account mappings, opening
balances, bank accounts, plus the three that need no external screen -- business profile,
accounting method, fiscal year, each shown complete-by-default since they always have a
value), two small inline forms for the two genuinely new settings, and one Activate button
that is also the review step (everything above it on the page already is the review).
Deliberately not gating: every existing Finance screen keeps working whether or not this
page is ever visited (ADR-10) -- it's a guided setup summary and the one thing that runs
FIN-2's backfill, not an access checkpoint.

**Accounting method is recorded, not yet applied.** §42's own text: "Support accrual/cash
reporting configuration without rewriting source transactions." A new
`core.business_settings.accounting_method` column stores the choice; no report reads it
yet (they stay accrual, which is what the ledger already produces). Teaching the reports to
re-derive a cash-basis view from an accrual ledger without rewriting the ledger itself is
real, separate work -- building it speculatively ahead of a report that needs it would be
exactly what CLAUDE.md principle 7 says not to do.

**Fiscal year start month, actually wired through.** Six pages calling
`fiscalYearOf`/`monthlyPeriodsForFiscalYear` with a hardcoded `4` (`periods`,
`filing-readiness`, `budget`, `reports`, `gst-ledger` pages, plus
`lib/exceptions-queue/mutations.ts`'s own sync and `getFinanceSnapshot`) now read
`core.business_settings.fiscal_year_start_month` via one new `getActivationSettings()`
call each, and the wizard is the first screen that actually lets a business set it.

**Opening balances has no dedicated screen.** It's set once, at account-creation time, on
the Chart of Accounts form; there's no way to edit it afterwards. Building a bulk
opening-balance editor is real UI work outside a sequencing story's scope -- the wizard's
own step says so plainly and shares chart-of-accounts' completion signal rather than
inventing a fake independent one.

**`gst.finance_activation`, not two more columns on `business_settings`.** Accounting
method landed on `business_settings` (an existing, deliberately loose "any business member
may write" table, matching its `gstin`/`fiscal_year_start_month` neighbours). Activation is
different: clicking it also runs FIN-2's backfill, a real write across
`gst.journal_entries`, so it got its own gst-schema table with the same
permission-gated RLS every other consequential write in this schema already has (new
permission `gst.activation.manage`), and `activated_at` stays set once written -- re-running
the wizard reruns the (idempotent) backfill scan but never un-marks a business as activated.

### Invoice view (FIN-4) — built 2026-09-27

`/finance/invoices` (in the Accounting nav): issued invoices for a period, whichever module
raised them, read from `core.documents` — no Finance-local invoice table, so
`lint:gst-no-duplicate-masters` stays green. Four statuses, each from the place that owns
it, never merged into one:

| Status | Read from | Values |
|---|---|---|
| Accounting | `gst.journal_entries` by `source_document_id`, *excluding* payment entries (a posted receipt is not the invoice being posted) | Posted · Reversed · Not posted · No entry (no accounting consequence, per `financeEventFromDocument`) |
| Payment | `core.payment_allocations` + credit notes via `creditedInvoiceId`, through the same `documentBalance` receivables uses | Unpaid · Part paid · Paid · Overpaid · — (cancelled/voided: not owed) |
| GST | the GSTR-1 `gst.return_periods` row covering the invoice date | No GST · Not in a return · In a return (with its review stage) · Filed |
| E-invoice | `gst.einvoices`, else a `failed` `document.issued` domain event for the invoice | IRN generated · IRN cancelled · Attempt failed (error on hover) · Not generated |

**"Attempt failed" comes from the event log.** `generateEinvoice` persists nothing when a
submission fails (see `einvoice-status/determine.ts`), so the only durable trace of a
failed attempt is the `document.issued` event the drain marked `failed` with its
`last_error`. Reading that is honest; a "Not generated" for an invoice somebody tried and
failed to e-invoice would read as nobody having tried. The full per-document
mandate/deadline evaluation (`getEinvoiceStatus`) is not run per row — it is several
queries per invoice — so this column reports what happened, not what was required.

Four tiles count what needs attention on each dimension and filter the list
(`?status=accounting:not_posted` etc.); each invoice opens its FIN-12 ledger page.

### Cash flow statement (FIN-5) — built 2026-09-27

The fourth tab on `/finance/reports`, following the other three: same period, same URL
parameters, same export (a "Cash Flow" sheet in the statements workbook).

**Direct method, read straight off the ledger.** `gst.cash_flow_totals` takes every entry in
the period that touches a cash account and attributes the cash to each of its *non-cash*
lines (credit − debit on that line). For a balanced entry those amounts always add up to
exactly the entry's net cash movement, whatever its shape — a sale paid on the spot, a bill
part-paid, an expense with input GST, a transfer between two bank accounts (which has no
non-cash line and contributes nothing) — so the statement reconciles by construction, not
with a plug figure. The indirect method would have needed working-capital classification
of every balance-sheet account up front; this needs it only for the lines cash actually
touched.

**Cash is derived, not flagged.** A cash account is whatever the business maps to the
`bank`/`cash` posting roles plus any ledger account a bank account links to — the two
places the rest of Finance already reads. A stored "is cash" flag would drift from them.

**Operating/investing/financing is decided in code** (`reports.ts#cashFlowActivity`), where
it is tested: equity and borrowing (the default chart's 24xx Loans block, or a sub-type
saying loan/borrowing/long-term) are financing; long-lived assets (15xx Fixed Assets, or a
sub-type saying fixed/non-current/investment) are investing; everything else is
operating. An account in the wrong section is fixed by giving it a sub-type, not by
editing the report.

**It proves itself.** Opening and closing cash come from the cash accounts' own balances,
independently of the flows, and the page shows the same out-of-balance notice the other
statements use if opening + net change ≠ closing.

### Operational reports (FIN-6) — built 2026-09-27

`/finance/operational-reports` (Accounting nav), five tabs sharing the reports' period
presets. Each figure is read from whoever owns it, and nothing is copied:

| Report | Source |
|---|---|
| Sales by customer | `gst.sales_by_party` over `core.documents` — invoices and debit notes less credit notes and sales returns, drafts/cancelled excluded |
| Sales by product / by service | `gst.sales_by_item` over `core.document_lines` × `core.items.kind` (good/part → product, service/labour → service), at each line's own price snapshot |
| Purchases | `gst.purchases_by_party`, supplier bills (`source_ref.kind` bill) less supplier credits |
| Expenses | by category from the ledger's expense accounts (the P&L's own numbers, each drilling into its account), and by payee from `gst.purchases_by_party` (kind expense) |
| Inventory valuation | `module-inventory`'s new contract function `getStockValuation` (quantity × current cost price, the basis Inventory's own dashboard uses) |
| COGS & gross margin | the ledger's COGS accounts and `profitAndLoss` — revenue, COGS, gross profit, margin % |

**The core-table aggregates carry their own licence check.** RLS on `core.documents` is
tenant-only (every module reads it), so each function adds
`core.licensed_business_ids('gst')` itself: a lapsed Finance licence returns nothing, the
same as the gst-schema tables, even though the underlying documents stay readable to
Inventory and Service.

**Header-only invoices are reported, not dropped.** A hand-entered invoice with no lines
has nothing to attribute to an item; `sales_by_item` returns it once as a "not itemised"
row and the page says so, along with the fact that document-level discount and shipping
aren't spread across lines — which is exactly why the by-item total can differ from the
by-customer total.

**Inventory degrades, the rest doesn't (ADR-10).** `getStockValuation` returns
`MODULE_NOT_LICENSED` for a Finance-only business and `FORBIDDEN` for a role without
`inventory.view_cost` (the permission Inventory's own screens mask cost behind); both
render as a sentence on that tab only.

**Negative stock is flagged, never netted.** An item with more sold than received is left
out of the valuation total and reported beside it ("3 items show negative stock, ₹X at
cost") — netting it against real stock would quietly understate what is on the shelves.

### Report drill-down (FIN-7) — built 2026-09-27

Every account line on all four statements links to `/finance/accounts/[accountId]` for the
report's own period: brought forward, each posting with its running balance, carried
forward, ending on the figure that was clicked (labelled "On the balance sheet" or "On the
profit and loss"). The totals come from the same `gst.account_statement_totals` read the
statement made — not from summing the listed lines — so the drill-down cannot disagree with
the statement even when the list is capped (500 entries; the page says when it is). Rows
open their journal entry, and their source document where there is one (FIN-12). Journal
entry lines now link to their account's drill-down instead of the chart of accounts.

### Bank rules (FIN-8) — built 2026-09-27

`gst.bank_rules` (`/finance/banking/rules`, linked from Banking): a rule is "a line whose
description contains X, money in/out/either, optionally within an amount range → account Y,
optionally for party Z", tried in priority order (ties by name, never by insertion order).

**Rules suggest; a person applies.** The same principle as matching: an unmatched line on
a bank account's page shows the rule that fits ("Rule 'Cloud hosting' says this belongs in
6500 Software") with a *Post and match* button. Applying it posts a two-line entry dated
the day the bank reported the line — bank vs the rule's account, the rule's party on the
counter line (so FIN-9's party dimension picks it up) — and matches the line to it. The
server re-derives the rule from the stored line rather than trusting the request, and
keys the entry `bank_txn:<id>` on the existing unique idempotency index, so a double-click
cannot post twice. The entry records `bank.rule` v1 and its source line, and
`gst.bank_transactions.rule_id` records which rule categorised the line — deleting the rule
later clears only that reference; the entry and the match stand.

**"Contains", not regex.** A founder writes "AWS" or "RENT"; a pattern language is one more
thing to get silently wrong. Capitals and repeated spaces are ignored.

**Permission:** `gst.bank_rules.manage` (owner, admin, accountant) to manage rules; applying
one needs `gst.banking.manage` (it matches a line) and `gst.journal.create` (it posts).

### Explainable accounting in reverse (FIN-12) — built 2026-09-27

`/finance/documents/[documentId]`: the document's own facts, then every entry it caused in
order — its posting, the separate cost-of-sale entry for goods, each payment allocated
against it, and any reversal of those — each with its rule, version and plain-language
reason, then the **net effect per account** once they are all added up (a paid invoice
leaves nothing in receivables; a reversed one nets to nothing, and says so).

Reversals are found through `reversal_of_entry_id`, not `source_document_id`: a reversal
does not carry the document id, so a query on that column alone would have shown a
reversed invoice as still in the ledger. When nothing has posted, the page says why using
`financeEventFromDocument` — the same function the posting path uses — so the reason
("still a draft", "a purchase order is a commitment, not a transaction", "should be in the
ledger: run the backfill") cannot disagree with what the ledger would actually do. Every
journal entry with a source document links here, and so does the invoices list (FIN-4).

### Not built

| § | Item | Note |
|---|---|---|
| 29 | Dimensions | `gst.journal_lines` already carries `party_id`, `item_id`, `location`, `project_ref`; nothing configures or reports on them. |
| 39 | AI finance assistant | Deliberately not built — see below. |
| 41 | Backfill | Scan and post existing history when Finance is activated. Idempotency is already solved (every posting is keyed), so this is the scan, the preview and the exception routing. |
| 42 | Activation wizard | The ten-step first-run flow. Every step exists as its own screen; nothing sequences them. |
| 52 | Seed data | The deterministic Finance fixture set (30 invoices, 20 bills, locked period, failed e-invoice, duplicate scenarios…). |

### Partly built

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
| `20260919120000_core_business_settings_accounting_method` | FIN-3: `core.business_settings.accounting_method` (accrual/cash) |
| `20260919130000_gst_finance_activation` | FIN-3: `gst.finance_activation`, `gst.activation.manage` permission |
| `20260927100000_gst_statement_totals_cash_flow` | FIN-5: `gst.account_statement_totals` (period + as-at totals, cash accounts flagged) and `gst.cash_flow_totals`; fixes the period-only balance sheet |
| `20260927110000_gst_operational_report_totals` | FIN-6: `gst.sales_by_party`, `gst.sales_by_item`, `gst.purchases_by_party` (licence-gated aggregates over `core.documents`) |
| `20260927120000_gst_bank_rules` | FIN-8: `gst.bank_rules`, `gst.bank_transactions.rule_id`, `gst.bank_rules.manage` permission (owner/admin/accountant) |
