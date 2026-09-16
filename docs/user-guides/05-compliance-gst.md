# Compliance: Tax Registrations & Filing

Compliance (module key `gst`, so you may still see "GST" in a few labels)
handles tax registrations, reconciliation, and filing prep. It started as an
India-GST-only module and has grown into a generic country/tax-regime
engine — **India GST, US Sales Tax (plus 1099 information returns), Canada
GST/HST, Singapore GST, and EU VAT (Germany, France, Belgium, Poland,
Italy)** are all fully supported today, with more countries visible in the
picker as "(Planned)" but not yet selectable.

## Navigation

**Overview**: Dashboard
**GST**: GST Registrations, GST Profile, e-Way Bill, e-Invoicing, GST Filing,
Reconciliation
**Records**: Evidence, Audit Log

> Some labels ("GST Registrations," "GST Filing") are leftover India-GST
> wording even though the module now supports several countries and tax
> regimes — the content on those pages adapts to your actual
> country/regime, only the menu label hasn't been renamed yet.

## Step 1: set your country and regime

A **country/regime bar** appears above every Compliance page. Until you
explicitly set one, your business defaults to **India / GST** — this is a
default, not a real setting, and shows a "(default)" tag until you save an
explicit choice.

To change it (requires edit permission): pick your country from the
dropdown; if that country has more than one regime (e.g. the US has both
Sales Tax and 1099 Information Returns), a second dropdown appears. The
selection saves and applies immediately across every Compliance page.

## Step 2: add your registration(s)

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

## Day-to-day workflows

- **Dashboard** — a month-at-a-glance snapshot, a compliance-risk card
  (high/medium/low signal counts), and your upcoming filing obligations.
- **Reconciliation** — match your records against GSTR-2B/IMS-style
  exceptions for a chosen month (pick the month from the period selector,
  which submits automatically). Click **Sync exceptions** to pull the
  latest, then **Resolve** or **Dismiss** each one.
- **GST Filing** — builds a purchase register and sales register for a
  chosen month period. This produces return-preparation output; it doesn't
  submit anything to a tax authority on your behalf.
- **e-Invoicing** and **e-Way Bill** — see credentials setup below; each has
  its own screen to issue and cancel documents.
- **Evidence** and **Audit Log** — supporting records and a change history
  for accountability.

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

## Legacy links

URLs under the old `/gst/...` path (e.g. `/your-business/gst/profile`) still
work — they redirect automatically to the equivalent `/compliance/...` URL.
Update any bookmarks when convenient, but nothing breaks if you don't.

## A note on regulatory content

Compliance ships with real, dated regulatory content for each supported
country/regime, but tax rules change. Treat the built-in rates and rules as
a strong starting point, and verify against current regulations (or your
accountant) before relying on this for an actual filing in production.
