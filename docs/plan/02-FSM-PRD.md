# PRD — Field Service Management module (`fsm`)

> **Revision 1.1 — read `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` first.** The StockPilot audit is complete and the programme is now greenfield (new repo + new Supabase project); Part C of that document lists the corrections to this file.

**Reference product:** Kickserv (researched from its public Knowledge Center, Sept 2026).
**Build:** from scratch, on top of `@cofounderai/core`.
**Tenant:** `business_id`. **License key:** `fsm`.

---

## 1. What Kickserv actually is (as documented, not as guessed)

The workflow Kickserv teaches its own users, in order:

1. **Opportunity** — the entry point. Kickserv's docs call opportunities "your prospects or leads": a potential customer plus a service, an internal description, a customer-facing scope of work, and a contact. Created from a global "Add New" button or from the Jobs → Opportunities page. Lands in a **New** tab.
2. **Estimate** — an opportunity that has been *scheduled* or *sent*. Two divergent paths, neither preferred: (a) **schedule an estimate event**, where a technician goes out and quotes live (task type `Estimate`, assigned to a tech, dated, described) → moves to **Estimate Scheduled**; or (b) **build and send an estimate** by adding charge items (each with description, price, quantity, taxable flag, and a *Job Charge Type* for reporting), reorderable by drag handle, then sending it. Estimates render in **Detailed** view (line items, quantities, prices) or **Summary** view (total only). Sent/viewed state is tracked by icons. An opportunity only reaches **Lost** if a human marks it lost.
3. **Job** — when the customer approves the estimate, the opportunity *becomes* an unscheduled job. Jobs can also be created directly. The Jobs board runs left-to-right: **Unscheduled → Scheduled → In Progress → (On Hold) → Completed**, where On Hold is optional and skippable. Scheduling a job creates a **work event** (date/time, description for the tech, task type, assigned tech or left unassigned). Jobs carry an internal *job description* and a customer-facing *scope of work* — an explicit distinction the docs stress twice. Standard plans up can attach custom fields to jobs, per service type. "More options" on a job: change job number, delete, duplicate, cancel, **convert back to an opportunity**.
4. **Invoice** — generated on job completion (a prompt appears) or on demand from the job header. Editable document view, charge adjustments, payments, notes and terms, signature request. Preview shows the exact customer-facing web page. Send by email/SMS with options: document view, recipient + CC, subject, copy sender, require signature, attach PDF. Sent/viewed tracked by icons. Mark paid / mark unpaid. Void by adjusting charges. Automatic recurring reminders for outstanding balances. Manual (non-card) payments must be logged as a payment on the job *before* marking paid, or the balance won't zero out.
5. **Reminders** — two distinct kinds. *Internal*: a reminder event on an opportunity or job, dated, described, assigned to one or more employees, delivered by email (plus SMS if the employee enabled mobile notifications), firing at the employee's notification lead time. *Customer*: automatic, 48 hours before a scheduled job or opportunity, email **and** SMS, with optional arrival window, reply-to address and custom message. Manually triggered reminders appear in job history; automatic ones do not.
6. **Customers and contacts** — a contact is a *person or a company*. Fields: name, phone, email, SMS-opt-in, service address, billing address, extra contact info, plus custom fields. Import from CSV or Gmail. **Service locations** are the important structural idea: multiple service addresses under one parent customer, each with a unique company name, geocoded (a map pin must appear, or GPS routing breaks), each choosing whether to bill the parent, the service address, or a new address.
7. **Scheduling / Planner** — a schedule view per employee per day; bulk "Print Work Orders" for a day or for selected employees (admin-only by default, grantable).
8. **Technician mobile experience** — log in with a six-digit account ID + credentials; home screen is today's schedule; icons distinguish work event / estimate event / reminder; swipe to **Notify** the customer "on the way" (SMS + email); tap the map for GPS routing; **Clock In** to track time (keeps running when the app is closed); add charges, expenses, time entries, notes and attachments in the field; capture photos, videos and PDFs; collect signature and payment; complete the job; send the invoice.
9. **Messaging** — a customer reply to any reminder, estimate or invoice email posts into the **Messages** section of that job. All admins see it; staff/techs need the messaging permission. Job *participants* (creator, sender of the estimate/invoice, assigned worker) get notified by email.
10. **Tags** — two scopes: **work tags** (opportunities and jobs) and **contact tags** (customers). Used for filtering and for revenue-by-tag reporting. Notably, tags cannot be applied at record-creation time.
11. **Custom fields** — on jobs (globally or *per service type*), on customers, and optionally exposed on the public contact form. Typed, ordered, editable, deletable.
12. **Permissions** — either full admin mode or a per-user custom set across Contacts, Additional Contacts, Jobs, Job charges, Expenses, Payments, Time entries, Notes, Messaging, etc., each with view / create-modify / delete granularity. Crucially, *view* on contacts, additional contacts, jobs, job charges, time entries and notes cannot be switched off for any user.
13. **Settings** — company info (name, address, phone, email, industry, timezone, locale), account & billing + data export, manage users (+ permissions + employee time-off), notifications (daily schedule report, customer-activity emails/SMS destinations), company logo (shown on estimates, invoices, customer center), **Customer Center** (self-serve portal where customers see their estimates, invoices and upcoming work) and an embeddable **contact form** that creates work requests, integrations, services, items, tags, taxes, vendors, customer sources, report settings, document settings, messaging templates, forms & fields.
14. **Reports** — 20+ prebuilt, in three families. *Sales & marketing*: marketing sources summary/detail, customers, customer marketing, revenue by service summary/detail, revenue by tag summary/detail, revenue by charge type summary/detail, sales activity per technician. *Work*: delivery rate & per-call average, agenda, jobs completed, expenses, expenses by tech, expenses by vendor, productivity per employee and summary. *Finance*: account aging (1-30/31-60/61-90/90+), customer balances by customer and job, payments by date, sales tax by city, sales tax by tax code, timecards by pay period.
15. **Integrations & API** — two-way QuickBooks sync (which auto-imports customers), and a REST API authenticated per-employee by API token.

**Design lessons I'm carrying over deliberately:**
- The *same record* flows Opportunity → Job, reversibly. Not two records with a copy step.
- **Events are one table with a type** (`work` / `estimate` / `reminder`), which is why one calendar shows everything. Copy this exactly.
- Internal vs customer-facing text is a first-class distinction on every record (`description` vs `scope_of_work`).
- Charge items carry a *reporting classification* (job charge type) separate from the item itself.
- Nothing auto-advances to Lost. Human intent is required for negative outcomes.

**Deliberate divergences for CoFounderAI:**
- Kickserv's customer/service-location hierarchy is modelled as `core.parties` + `core.addresses(kind='service', parent)`, not as parent/child customer records — cleaner, and it's what inventory and GST already need.
- Kickserv's Items, StockPilot's products and FSM charge items are one `core.items` table.
- Taxes are GST-first (CGST/SGST/IGST, HSN/SAC, place-of-supply), not US sales-tax-by-city. The "Sales tax by city/tax code" reports become GST reports owned by the `gst` module.
- Opportunities can be *born from discovery* via `prospect.won`, which Kickserv has no equivalent of. This is the platform's differentiator.

---

## 2. Scope for this build

`MUST` = P3 scope. `SHOULD` = P3 if cheap, else P4. `LATER` = explicitly out.

| Area | MUST | SHOULD | LATER |
|---|---|---|---|
| Opportunities | create (manual + from `prospect.won`), pipeline board (New / Estimate Scheduled / Estimate Sent / Won / Lost), convert to job, mark lost with reason | duplicate, bulk actions | AI-suggested scope of work |
| Estimates | charge lines from `core.items`, ad-hoc lines, reorder, taxable flag, job charge type, detailed/summary view, public estimate page, send by email, sent/viewed tracking, approve/decline by customer, approve internally | SMS send, required signature on approval, expiry date, multiple estimate options (good/better/best) | template library |
| Jobs | board Unscheduled→Scheduled→In Progress→On Hold→Completed, internal description vs scope of work, service type, custom fields per service type, job number, start/stop, complete, cancel, duplicate, convert back to opportunity, history/activity log | recurring jobs, checklists | multi-day / multi-visit projects |
| Scheduling | calendar (day/week, by technician), create work/estimate/reminder events, assign or leave unassigned, drag to reschedule, unassigned queue, print work orders (bulk, by day/employee) | technician time-off blocking, capacity warnings, route ordering | map-based drag dispatch, route optimisation |
| Field execution | clock in/out time entries, add charges, expenses, notes, attachments (photo/video/PDF), signature capture, "on my way" notify (SMS+email), mobile-first responsive UI | offline queue, GPS breadcrumbs | native apps |
| Invoicing | generate from job or standalone, edit lines, GST computation, public invoice page, send, mark paid/unpaid, record manual payment (cash/cheque/UPI/bank/card-offline), partial payments, void by credit note, balance & aging | automatic outstanding-balance reminder schedule, online payment link | full AR ledger, dunning workflows |
| Customer Center | public tokenised portal: my estimates, my invoices, upcoming work, approve estimate, pay/see balance | request service, reschedule request | login-based portal accounts |
| Contact form | embeddable/public form → creates an inbound work request → opportunity | spam protection, custom fields on form | multi-step forms |
| Messaging | inbound replies to estimate/invoice/reminder land on the job's Messages tab (reading `core.messages`), participant notification | templated quick replies | full CRM inbox (that's the `crm` module) |
| Reminders | internal reminder events; automatic customer reminder N hours before events (default 48), email + SMS, arrival window | per-service-type templates | |
| Settings | service types, job charge types, message templates, document settings (logo, terms, footer), customer sources, reminder config, numbering | employee time-off | |
| Reports | jobs completed, revenue by service, revenue by tag, revenue by charge type, customer balances, account aging, payments, timecards, productivity per employee, marketing sources (joined to discovery when licensed) | custom report builder | scheduled report emails |
| Permissions | per-user module permissions using `core.permissions` with the Kickserv matrix (view / create-modify / delete per area), non-disableable views honoured | field-level | |

---

## 3. Data model (`fsm` schema; everything shared lives in `core`)

```sql
-- Configuration
fsm.service_types        (id, business_id, name, description, is_active, sort_order)
fsm.job_charge_types     (id, business_id, name, is_active)   -- reporting classification
fsm.settings             (business_id pk, reminder_lead_hours default 48,
                          arrival_window_minutes, auto_invoice_on_complete bool,
                          default_terms text, estimate_expiry_days,
                          customer_center_enabled bool, contact_form_enabled bool)

-- Pipeline
fsm.opportunities        (id, business_id, number, party_id → core.parties,
                          primary_contact_id → core.party_contacts,
                          service_address_id → core.addresses,
                          service_type_id, description /*internal*/, scope_of_work /*customer*/,
                          source: manual|contact_form|discovery|import|api,
                          source_prospect_id  /* nullable, public.prospects.id */,
                          status: new|estimate_scheduled|estimate_sent|won|lost,
                          lost_reason, marketing_source_id, converted_job_id,
                          created_by, created_at, updated_at)

fsm.jobs                 (id, business_id, number, opportunity_id NULL, party_id,
                          primary_contact_id, service_address_id, service_type_id,
                          description, scope_of_work,
                          status: unscheduled|scheduled|in_progress|on_hold|completed|cancelled,
                          started_at, completed_at, on_hold_reason,
                          recurring_template_id NULL, created_by, created_at, updated_at)

-- One calendar table, three event types (Kickserv's model)
fsm.events               (id, business_id, kind: work|estimate|reminder,
                          job_id NULL, opportunity_id NULL,
                          starts_at, ends_at, all_day, description,
                          status: scheduled|en_route|arrived|done|cancelled,
                          arrival_window_start, arrival_window_end,
                          created_by, created_at, updated_at,
                          check (job_id is not null or opportunity_id is not null))
fsm.event_assignees      (event_id, employee_id → core.employees, notified_at)

-- Execution
fsm.time_entries         (id, business_id, job_id, employee_id, started_at, ended_at,
                          duration_minutes generated, is_billable, hourly_rate, notes)
fsm.expenses             (id, business_id, job_id, vendor_party_id NULL, item_id NULL,
                          description, amount, incurred_on, employee_id, attachment_id)
fsm.notes                (id, business_id, job_id NULL, opportunity_id NULL,
                          body, visibility: internal|customer, author_id, created_at)
fsm.signatures           (id, business_id, document_id → core.documents NULL, job_id NULL,
                          signer_name, signed_at, image_attachment_id, ip, user_agent)
fsm.recurring_templates  (id, business_id, party_id, service_type_id, rrule,
                          scope_of_work, next_run_on, is_active)

-- Customer-facing
fsm.portal_tokens        (id, business_id, party_id, token_hash, scope: estimate|invoice|center,
                          document_id NULL, expires_at, last_used_at)
fsm.work_requests        (id, business_id, raw jsonb, name, email, phone, address_text,
                          message, custom_values jsonb, status: new|converted|spam,
                          opportunity_id NULL, created_at)
```

**Owned by `core`, used by FSM — do not recreate:**
`core.parties` (customer), `core.party_contacts`, `core.addresses` (service location), `core.items` (charge items / services / parts), `core.documents` (`doc_type in ('estimate','invoice','credit_note')`, `source_module='fsm'`, `job_id`/`opportunity_id` in `source_ref`), `core.document_lines` (with `job_charge_type_id`, `taxable`, `sort_order`), `core.payments`, `core.number_sequences` (job, opportunity, estimate, invoice numbers), `core.tags` (scope `work` / `contact`), `core.custom_field_defs` (entity `job`, scoped by `service_type_id`), `core.attachments`, `core.messages` + `core.threads`, `core.message_templates`, `core.employees`, `core.permissions`, `core.audit_log`.

---

## 4. State machines (implement as explicit transition functions, not free-form updates)

**Opportunity:** `new → estimate_scheduled` (schedule estimate event) · `new|estimate_scheduled → estimate_sent` (send estimate) · `estimate_sent → won` (approved → creates job, `converted_job_id` set) · `any → lost` (human action + reason only) · `won → new` (undo, only if the job has no events/charges).

**Job:** `unscheduled → scheduled` (first work event) · `scheduled → in_progress` (start or first clock-in) · `in_progress ⇄ on_hold` · `in_progress|on_hold → completed` (prompts invoice generation per `auto_invoice_on_complete`) · `any → cancelled` · `completed → in_progress` (reopen, admin only) · job → opportunity (Kickserv's "change the Job to an Opportunity"; only if no invoice exists).

**Invoice (`core.documents`):** `draft → issued → sent → (viewed) → partially_paid → paid`; `issued|sent → voided` (via credit note, never by deletion — GST requires the audit trail).

Every transition writes `core.audit_log` and publishes the matching domain event from §6 of the master plan.

---

## 5. Screens (routes under `apps/web/app/(dashboard)/[businessSlug]/fsm/`)

| Route | Purpose |
|---|---|
| `/fsm` | Dispatcher dashboard: today's schedule, unassigned queue, jobs in progress, overdue invoices, estimates awaiting response |
| `/fsm/opportunities` | Kanban by status + table view, tag/service/source filters |
| `/fsm/opportunities/[id]` | Detail: general info, scope, contact, schedule estimate, add charges, view/send estimate, messages, notes, history |
| `/fsm/jobs` | Board Unscheduled → Completed + table, filters (tech, service, tag, date, status) |
| `/fsm/jobs/[id]` | Detail tabs: Job details (schedule, charges, expenses, time, notes, attachments, custom fields), Messages, History, Invoice |
| `/fsm/schedule` | Calendar day/week by technician; unassigned lane; drag to reschedule; print work orders |
| `/fsm/invoices` | Unpaid / paid tabs, aging, sent & viewed indicators |
| `/fsm/invoices/[id]` | Editor + preview + send + payments |
| `/fsm/customers` | Parties with `customer` role (shared list with inventory when both licensed — same data, module-appropriate columns) |
| `/fsm/reports` | The report families in §2 |
| `/fsm/settings` | Service types, charge types, templates, reminders, document settings, numbering |
| `/p/e/[token]`, `/p/i/[token]`, `/p/center/[token]` | Public: estimate, invoice, customer center (no auth, tokenised, rate-limited) |
| `/p/request/[businessSlug]` | Public contact form → `fsm.work_requests` |

Mobile: the technician view is the same Next.js app, responsive-first, with a dedicated `/fsm/my-day` route optimised for phones (schedule, clock in/out, charges, photos, signature, notify). No native app in P3.

---

## 6. Discovery → FSM handoff (the integration that justifies the platform)

Trigger: `public.prospects.outcome` transitions to `won` (that column already exists, added in `20260906090000_message_subject_and_prospect_outcome.sql`).

1. Discovery publishes `prospect.won { workspace_id, prospect_id, party_id, contact_ids[], conversation_id }`.
2. The event processor resolves the workspace's parent `business_id`.
3. If `fsm` is licensed for that business: ensure the `core.parties` row has role `customer` (add role, don't copy the record), then create `fsm.opportunities` with `source='discovery'`, `source_prospect_id`, the prospect's contact as primary, and `scope_of_work` seeded from the conversation's agreed summary. Publish `opportunity.created`.
4. If `fsm` is not licensed: the event stays unprocessed with `status='no_consumer'` and is replayed when an `fsm` license is activated.
5. Backlink both ways: the opportunity shows "from prospect X", the prospect page shows "opportunity #123 / job #456 / invoice status" when FSM is licensed.
6. Discovery reporting gains true closed-loop attribution: `marketing_source → prospect → opportunity → job → invoice → payment`, which is exactly Kickserv's "Marketing Sources: Detail" report except it now spans acquisition *and* delivery.

Reverse direction (P4): `estimate.declined` / `job.completed` feed back to discovery as outcome signals for ICP scoring.

---

## 7. Acceptance criteria for P3 (definition of "FSM is done")

1. A won prospect in discovery produces an FSM opportunity automatically, with no duplicate party or contact rows created (assert on `core.parties` count).
2. An opportunity can be quoted, sent, viewed by a customer on a public page, approved, and become a job — with the estimate document living in `core.documents`.
3. A job can be scheduled to a technician, appear on the calendar and on `/fsm/my-day`, be started, have parts and labour added, photos and a signature captured, and be completed.
4. If `inventory` is licensed, completing that job decrements `inventory.stock_levels` through the inventory contract and writes a `stock_movement`; if it is not licensed, the same job completes cleanly with the parts as plain charges.
5. Completing the job generates an invoice with correct CGST/SGST/IGST based on place of supply, sendable and payable, and `payment.recorded` zeroes the balance.
6. If `gst` is licensed, `document.issued` produces an e-invoice request; if not, the invoice is still valid and complete.
7. Tenant isolation tests: a user in business A cannot read or write any `fsm.*` row of business B — asserted per table, per operation (the existing repo's tenant-isolation test pattern is mandatory here).
8. License tests: with `fsm` cancelled and inside grace, reads succeed and writes fail; after grace, both fail; on reactivation, all prior data is intact and the parked `prospect.won` events replay.
