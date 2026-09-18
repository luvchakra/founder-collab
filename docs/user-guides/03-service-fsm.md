# Service: Field Service Management

Service (module key `fsm`, so you may still see "FSM" in a few older places)
runs your field-service business: turning a lead into a scheduled job, a
completed visit, and an invoice — with crew dispatch and inventory
parts-tracking built in.

## Setup before you start

All under **Service → Settings**:

- **Service Types** — the categories your jobs and opportunities are tagged
  with (e.g. "Repair," "Installation"). Only active ones show up when
  creating a job or opportunity.
- **Job Charge Types** — categories used for invoice and estimate line
  items.
- **Service Settings** — a single settings form covering:
  - Reminder lead time and arrival-window length (for scheduling
    communications)
  - Whether to **auto-generate an invoice** the moment a job is marked
    complete
  - Default terms and estimate expiry (in days)
  - Whether the **customer self-service portal** and **contact form** are
    enabled
- **Numbering** — a read-only view of your job/invoice number sequences.

**Crew and technicians** are set up from the **Schedule** page, not
Settings: toggle which business members are technicians there. A user who
isn't set up as a technician sees a friendly message on **My Day** telling
them an owner/admin needs to add them first. There's no separate
service-area/zone concept in this module today.

## The opportunity → job → invoice lifecycle

1. **Opportunity** — capture a lead (new or existing customer), assign a
   service type, and write up the scope of work.
2. **Estimate** — build a quote with charge lines and send it to the
   customer (they get a link to approve or decline it themselves, or your
   staff can record the decision internally).
3. **Job** — approving an estimate creates the job automatically, with a
   generated job number. Re-approving an already-approved estimate won't
   create a duplicate job.
4. **Invoice** — generate an invoice from a completed job (or let it
   auto-generate, if you turned that setting on). Send it, record payments,
   mark paid/void, and reorder line items. If Finance is licensed, an
   e-invoice/e-way-bill panel appears here too.

### Working a job

The job detail page is the busiest screen in the module. From here you can:
mark it scheduled, start it, put it on hold and resume, complete it, cancel
it, reopen it, duplicate it, or convert it back to an opportunity (only
before it's invoiced). You can also clock time in and out, log expenses and
notes, attach files, capture a customer signature, message the customer
in-app, and grant "customer center" self-service access.

**Completing a job** asks for an outcome from a fixed list: completed
successfully, completed with a recommendation, additional work required,
parts required later, customer declined additional work, **warranty revisit
required**, or unresolved. Choosing "warranty revisit required" automatically
creates a follow-up job linked back to the original — both jobs show a link
to each other.

### Scheduling and dispatch

- **Schedule** — a day/week dispatch calendar per technician. Create,
  reschedule, reassign, cancel, or delete events, and print work orders. If
  Inventory is licensed, a **low-stock banner** appears here so dispatchers
  see supply problems before they send a crew out.
- **My Day** — the technician's own mobile agenda for today: mark "on the
  way," "arrived," or "done" on each event, and clock in/out.

## Parts reservation (if Inventory is licensed)

This runs automatically and is entirely optional — if Inventory isn't
licensed, jobs just work as plain charges with no material tracking:

- Scheduling a job **reserves** the parts it needs from your first active
  warehouse. Anything that can't be reserved shows up as a shortfall you can
  resolve (wait for restock, substitute an item, reschedule, or source it
  manually) and retry later.
- Completing a job **consumes** the reserved parts — unless a technician has
  already filed an explicit actual-usage report (actual used / returned /
  wasted), in which case that report is what moves stock, correctly
  accounting for any prior partial reports.
- Cancelling a job **releases** any reservation back to available stock.

## How this connects to other modules

- **CRM**: a Service opportunity can originate from a CRM opportunity, and
  the resulting job links back to it — useful for seeing the full lifecycle
  from first contact to a completed on-site visit.
- **Inventory**: parts reservation/consumption, described above.
- **Finance**: invoices show e-invoice/e-way-bill status when relevant, and
  every issued invoice posts to the ledger automatically.

Service is meant to sit downstream of CRM and alongside Inventory and
Finance, but every one of those integrations is optional — the module
works completely standalone if you only license Service.
