# Finance: Accounting, Banking & Tax

Finance is your books: a real double-entry ledger that the rest of the
platform posts into automatically, plus bank reconciliation, financial
statements, and tax registration and filing preparation.

It started life as an India-GST-only module, which is why its URL prefix and
internal key are still `gst` in a few places, and why the tax screens carry
GST-flavoured labels. The accounting half applies to every business
regardless of country; the tax half supports **India GST, US Sales Tax (plus
1099 information returns), Canada GST/HST, Singapore GST, and EU VAT
(Germany, France, Belgium, Poland, Italy)** today, with more countries
visible in the picker as "(Planned)" but not yet selectable.

## Navigation

**Overview**: Dashboard
**Accounting**: Chart of Accounts, Journal, Banking, Receivables, Payables,
Bills, Expenses, Financial Reports, Budget, Recurring Entries, Accounting
Periods
**Tax & GST**: GST Profile, GST Registrations, GST Ledger, Filing Readiness,
GST Filing, GSTR-2B Reconciliation, e-Invoicing, e-Way Bill
**Records**: Evidence, Audit Log

## First run: set up your chart of accounts

Nothing else in Finance works until there is somewhere for money to land.
Open **Chart of Accounts** and use **Set up standard accounts** — this
provisions a conventional chart (assets, liabilities, equity, income,
expenses) including the handful of *system accounts* the platform posts into
by itself: Accounts Receivable, Accounts Payable, Bank, Sales, Output GST,
Input GST, Inventory Asset, and Cost of Goods Sold.

You can add your own accounts alongside them, rename anything, and group
accounts under parents to whatever depth you like. What you cannot do is
delete or deactivate a system account, because an automatic posting that
suddenly has nowhere to go would fail silently at exactly the moment nobody
is looking.

## Accounting periods

Periods are how a set of books gets closed. Open **Accounting Periods**,
generate the months (or quarters) for your financial year, and each one
moves through **open → closed → locked**:

- **Open** — entries can be added, edited and reversed freely.
- **Closed** — the normal end-of-month state. No new entries.
- **Locked** — the period is filed. It is never reopened.

Correction is always by **reversal, never by edit**. Reversing an entry
leaves both halves in the account's history, which is what an audit asks
for; quietly editing yesterday's number does not.

## The journal and automatic posting

Most of what lands in your ledger you never type. When another module issues
a document — a Service invoice, an Inventory sales invoice, a supplier bill,
a credit note — or a payment is allocated against one, Finance posts the
matching journal entry by itself, using the account each role maps to.

**Journal** shows every entry, automatic and manual, with its lines,
its source document, and a **Reverse** action. To record something the
platform cannot know about (a director's loan, a depreciation charge, an
opening balance), use **New entry** and enter the lines yourself. Debits
must equal credits before it will save.

### When a document doesn't post

Two things are not retryable failures, so they are not treated as errors:
a document with no accounting consequence, and a chart of accounts that
isn't set up yet. Both surface as **unposted documents** on the Finance
dashboard instead, with the reason. Automatic posting that silently does
nothing would be worse than none at all.

## Banking

**Banking** holds your bank and cash accounts, imported statements, and
reconciliations.

- **A bank account is not a ledger account.** One is where money physically
  sits, the other is where it is recorded. Each bank account points at a
  ledger account, so three current accounts can share one "Bank" line on the
  balance sheet, or each have their own.
- **Import a statement** from CSV. The importer reads the header row to find
  your date, description and amount columns (including separate debit/credit
  columns), and it never drops a row silently — anything it cannot read is
  reported rather than skipped.
- **Matching suggests, it never decides.** Candidate matches come back ranked
  with the reason for each, and the amount is a gate: a wrong amount or the
  wrong sign scores nothing at all. Finance only claims "one clear match"
  when the best candidate is both confident *and* unrivalled. You confirm
  every match.
- **Reconcile** a statement period against the ledger. A reconciliation with
  a known, explained difference still records — a gap someone has accepted is
  a normal outcome, and refusing to save it just pushes the reconciliation
  into a spreadsheet nobody can see. "Reconciled" needs agreement *and*
  nothing left hanging.

## Money in: Receivables

**Receivables** ages what customers owe you, by customer and by invoice, in
the usual buckets (current, 1–30, 31–60, 61–90, 90+). It reads the same
invoices and payment allocations the rest of the platform already holds, so
there is nothing to keep in sync.

## Money out: Payables, Bills, Expenses

- **Bills** — enter a supplier bill by hand: supplier, bill date, due date,
  line items, tax. Bills raised here are ordinary platform documents, so
  payments, parties and allocations work on them exactly as they do on a
  sales invoice. (A purchase order is deliberately *not* a payable — it
  creates no liability and is routinely for a different amount than what
  eventually gets billed.)
- **Expenses** — a faster path for the small stuff: pick the expense
  account, enter the amount, and optionally mark it paid on the spot, which
  records the payment in the same step.
- **Payables** — ages what you owe, by supplier and by bill, and is where you
  **record a payment** covering several of one supplier's bills at once.

## Financial Reports

**Financial Reports** produces, for any period you choose:

- **Profit & Loss** — income and expenses, with the period's result.
- **Balance Sheet** — assets, liabilities and equity. The period's profit
  appears as its own equity line: until the year is closed, nothing has moved
  trading results into retained earnings, and leaving that line out puts the
  sheet out by exactly the profit. That is the classic "my balance sheet
  doesn't balance", and it is a missing line rather than a broken ledger.
- **Trial Balance** — every account's debit and credit totals, which should
  agree.

## Budget and Recurring Entries

- **Budget** — set a figure per account per period, then compare budget
  against actual with the variance.
- **Recurring Entries** — a journal template plus a schedule (monthly,
  quarterly, and so on). Entries are generated on their due date; each one is
  a normal journal entry you can review and reverse.

Neither uses AI. Finance is deterministic arithmetic, and the platform's own
engineering rules say not to put a language model where arithmetic belongs.

## Tax: set your country and regime

A **country/regime bar** appears above every Finance tax page. Until you
explicitly set one, your business defaults to **India / GST** — this is a
default, not a real setting, and shows a "(default)" tag until you save an
explicit choice.

To change it (requires edit permission): pick your country from the
dropdown; if that country has more than one regime (e.g. the US has both
Sales Tax and 1099 Information Returns), a second dropdown appears. The
selection saves and applies immediately across every tax page.

## Tax: add your registration(s)

Go to **GST Registrations** — its title adapts to your regime (e.g. "VAT
registrations," "Sales Tax registrations," "GST/HST registrations"). Click
to add a registration:

- **India + GST**: enter your **GSTIN** (15 characters, uppercase, validated
  against the standard format) and select a state jurisdiction.
- **US or Canada**: enter your registration number (EIN/permit number, or
  Canadian business number) and select a state/province jurisdiction.
- **EU VAT countries**: enter your VAT number — there's no jurisdiction
  field, since VAT registration is national, not regional.

Check **"Set as primary"** (checked by default) — the primary registration
is the one every other document (invoices, e-way bills, tax splitting) uses.
A registration's number and jurisdiction can't be edited after creation; to
fix a mistake, cancel it and add a new one. From the registrations list you
can also Suspend, Reactivate, or Cancel a registration, and — for India/GST
only — edit additional profile details (registration type, return
frequency, e-invoice eligibility).

## Tax: day-to-day workflows

- **GST Ledger** — your tax accounts in ledger form, reconciled against what
  the return says. If the two disagree, that difference is the thing to look
  at before filing.
- **Filing Readiness** — one pre-flight check before you file, drawing on the
  ledger, the sales and purchase registers, GSTR-2B, your bank
  reconciliation and the period lock. It tells you what is not ready, not
  just whether it is.
- **GST Filing** — builds a purchase register and sales register for a chosen
  month. This produces return-preparation output; it does **not** submit
  anything to a tax authority on your behalf.
- **GSTR-2B Reconciliation** — match your records against GSTR-2B/IMS-style
  exceptions for a chosen month. **Sync exceptions** pulls the latest, then
  **Resolve** or **Dismiss** each one. The input-tax-credit view shows what
  is claimable and what is at risk.
- **e-Invoicing** and **e-Way Bill** — see GSP credentials below; each has its
  own screen to issue and cancel documents.
- **Evidence** and **Audit Log** — supporting records and a change history for
  accountability.

A GST return covers the supplies of the **business**, not of whichever module
raised the paperwork — Service invoices, Inventory invoices and bills entered
by hand all count towards the same return.

## e-Invoicing / e-Way Bill: connecting your GSP (India only)

If you file under India GST and need e-invoicing or e-way bills, you'll need
credentials from a **GST Suvidha Provider (GSP)** — the government-mandated
intermediary these documents must be submitted through. Enter these once on
the **e-Invoicing** and **e-Way Bill** settings forms:

- GSP provider name
- Auth URL, Generate URL, Cancel URL (and optionally Status/Fetch URLs)
- GSP username and password
- Client ID and client secret

Your GSP issues all of these when you sign up with them — WonderArk doesn't
provide a GSP relationship itself. Your password and client secret are
encrypted at rest and only briefly decrypted at the moment WonderArk makes
the one outbound call to your GSP that needs them.

## Working without the other modules

Finance never hard-depends on Inventory or Service. If neither is licensed,
you enter bills and expenses by hand and the ledger works exactly the same;
if they are, their documents post into it automatically. Turning one off
later stops new automatic postings — it does not remove what was already
recorded.

## Legacy links

URLs under the old `/gst/...` and `/compliance/...` paths (e.g.
`/your-business/gst/profile`) still work — they redirect automatically to the
equivalent `/finance/...` URL. Update any bookmarks when convenient, but
nothing breaks if you don't.

## A note on regulatory content

Finance ships with real, dated regulatory content for each supported
country/regime, but tax rules change. Treat the built-in rates and rules as
a strong starting point, and verify against current regulations (or your
accountant) before relying on this for an actual filing in production.
