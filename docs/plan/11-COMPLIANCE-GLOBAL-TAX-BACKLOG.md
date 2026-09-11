# WonderArc Compliance Module — P0/P1 Global Tax & Compliance Backlog

## Product decision

The current technical `module-gst` should evolve into a user-facing **Compliance** module. Keep the technical package name if required by the locked monorepo/licensing architecture, but make the product country-aware.

The module should not try to become a full general-ledger accounting product. It should sit above existing WonderArc transaction data and provide:

**registration → tax determination → compliant documents → e-invoicing/reporting → returns → reconciliation → filing → payment → evidence → risk/alerts**

The most important design decision is:

> **Use one generic Compliance domain plus country/regime packs with versioned rules and government adapters. Never hard-code country-specific rules into the UI.**

The initial P0 market is **India GST**. P1 adds the US, Canada, Singapore, EU/selected EU countries, UAE, Saudi Arabia, Australia/New Zealand, and selected Asian markets.

---

# 1. Competitive research summary

The market baseline is substantially broader than tax-rate calculation.

### Zoho Books

India: GST settings, multiple GSTIN support, HSN/SAC, e-invoicing, e-way bills, GSTR-1, GSTR-3B, GSTR-9, GSTR-2B reconciliation, IMS, filing approval and government connections. Zoho also has country editions for Canada, Singapore and UAE. [1][2][3][4]

### TallyPrime

India: GSTR-1 preparation/direct filing, GST reconciliation, HSN/SAC validation, connected IMS, e-invoicing and e-way bill workflows, plus exception handling. [5][6]

### QuickBooks Online

US: a central Sales Tax Center, automated sales-tax calculations, liability reporting and filing/payment workflows where supported. QuickBooks also supports tax tracking in Singapore. [7][8]

### Xero

Strong country-specific tax/reporting capabilities. Canada supports localized GST/HST/PST/QST calculations and return reports; Singapore supports InvoiceNow/Peppol. UK supports MTD VAT workflows. [9][10][11]

### Avalara

Global tax engine/compliance platform. It emphasizes jurisdiction-aware sales/use tax, economic nexus, exemption certificates, returns, VAT/GST, e-invoicing and notice/audit support. It cites 12,000+ US sales-tax jurisdictions and 190+ countries/territories. [12][13]

### Conclusion

WonderArc should **not compete on the size of a proprietary tax database**. The differentiator should be:

> **A simple compliance control center that understands the business, identifies what is due, explains exceptions, uses existing transaction data, and guides the owner to a compliant outcome.**

---

# 2. Country/regime research

## India

India is the P0 market.

Important capabilities include:

- GST registration/GSTIN
- multiple registrations
- regular/composition context
- HSN/SAC
- place of supply
- CGST/SGST/UTGST/IGST and applicable cess
- reverse charge
- exports/SEZ
- tax invoice
- e-invoice
- e-way bill
- GSTR-1
- GSTR-3B
- GSTR-9
- GSTR-2B
- ITC reconciliation
- IMS accept/reject/pending
- filing approvals
- payment tracking
- audit/evidence

GSTN provides portal workflows and APIs for third-party applications. GSTR-1 can be prepared through software, and IMS provides accept/reject/pending workflows for inward supplies. [14][15]

E-invoicing is mandated for the applicable taxpayer class at ₹5 crore+ aggregate turnover; for taxpayers with AATO ₹10 crore or more, invoices, credit notes and debit notes must be reported within 30 days from invoice date from 1 April 2025. [16][17]

**Implication:** India needs a complete P0 compliance flow, not a simple GST calculator.

---

## European Union

Do not model "Europe" as one tax jurisdiction.

EU VAT has a common framework, but member states control many rates and detailed processes. VAT returns are filed in the member state where registered, with country-dependent frequencies and special schemes such as OSS/IOSS. [18][19]

The EU ViDA package was adopted in 2025 and is being rolled out progressively through 2035, including digital reporting/e-invoicing changes. [20]

Current examples demonstrate the need for country packs:

- France: all VAT-liable businesses must be able to receive e-invoices from 1 September 2026; large/mid-sized businesses must issue electronically from that date and smaller businesses from September 2027. [21]
- Germany: domestic B2B structured e-invoice rules started 1 January 2025 with transition periods. [22]
- Belgium: structured B2B e-invoicing became compulsory from 1 January 2026 for nearly all Belgian VAT-liable business transactions. [23]
- Poland: KSeF 2.0 rolls out in stages in 2026/2027. [24]

**Implication:** `EU` should be a region containing member-state country packs.

---

## United States

The US is not a GST/VAT model.

The primary indirect-tax problem for many businesses is:

> **Sales-tax nexus by state/local jurisdiction.**

Important concepts:

- physical nexus
- economic nexus
- registration
- product/service taxability
- exemption certificates
- sales/use tax
- filing/remittance
- notices/audit
- federal information returns such as 1099

Avalara highlights physical/economic nexus and exemption certificates; QuickBooks provides a centralized Sales Tax Center and filing/payment workflows in supported states. [12][13][7]

IRS information returns generally require e-filing when the filer has 10 or more information returns during the year, using the aggregate threshold. [25][26]

**Implication:** the US country pack needs a jurisdiction engine rather than one tax rate.

---

## Canada

Canada combines federal GST/HST with provincial systems.

The small-supplier threshold for most businesses is CAD 30,000 under the detailed CRA tests. [27]

Place of supply matters. Current examples include 5% GST in non-HST provinces, 13% HST in Ontario and 14% HST in Nova Scotia; several provinces have 15% HST, while Quebec and some provinces also have separate provincial taxes. [28][29]

CRA requires electronic filing for most GST/HST registrants with reporting periods beginning in 2024 or later, and supports certified third-party software. [30][31]

**Implication:** Canada needs federal + provincial tax layers and place-of-supply logic.

---

## Singapore

Singapore GST is especially relevant because compliance is increasingly linked to structured e-invoicing.

GST registration is generally compulsory when taxable turnover exceeds S$1 million under the applicable retrospective/prospective tests. [32]

GST returns are filed electronically through myTax Portal and businesses must keep GST/accounting records for at least five years. [33][34]

The GST InvoiceNow requirement is phased from 2025/2026 and eventually extends to all GST-registered businesses by 2031. InvoiceNow is built on Peppol. [35][36]

**Implication:** Singapore needs GST + InvoiceNow/Peppol as one compliance workflow.

---

## UAE

VAT registration is mandatory above AED 375,000 of taxable supplies/imports under the applicable rules; voluntary registration is available above AED 187,500. [37]

Zoho Books demonstrates an integrated workflow around VAT returns, EmaraTax connection, mismatch review, locking and filing. [38]

**Implication:** UAE is a useful P1 country pack for direct filing/portal integration.

---

## Saudi Arabia

ZATCA operates a two-phase e-invoicing model:

- Phase 1 — Generation
- Phase 2 — Integration with Fatoora

Phase 2 is rolled out in waves and requires structured invoices and integration with ZATCA systems. [39][40]

**Implication:** Saudi requires a dedicated clearance/reporting adapter and strong submission audit trail.

---

## Australia / New Zealand

Australia: GST registration is generally required from A$75,000 GST turnover; GST is 10% on most supplies. Australia uses the Peppol framework for e-invoicing, with the ATO as Peppol Authority. [41][42]

New Zealand: GST registration threshold is NZ$60,000, with monthly/two-monthly/six-monthly filing choices depending on circumstances and turnover. [43][44]

**Implication:** ANZ needs configurable GST periods plus Peppol support.

---

## Malaysia

Malaysia should **not** be modeled as GST.

Its current indirect tax system is Sales Tax + Service Tax (SST), with the framework expanded from July 2025 and ongoing policy updates in 2026. [45][46]

---

## Japan

Japan uses Consumption Tax and a Qualified Invoice System. A qualified invoice communicates the applicable tax rate, consumption tax amount and registration number. [47]

---

# 3. Target information architecture

```text
Compliance
├── Overview
├── Registrations
├── Taxes
├── Invoices
├── E-Invoicing
├── Returns
├── Reconciliation
├── Compliance Calendar
├── Issues / Risk
├── Documents / Evidence
└── Settings
```

Global context:

```text
Business ▼
Country / Region ▼
Tax Regime ▼
Registration ▼
Period ▼
```

The active country/regime must always be visible.

---

# 4. Generic data model

Core Compliance entities:

```text
ComplianceProfile
TaxRegistration
TaxRegime
TaxJurisdiction
TaxRule
TaxRate
TaxTreatment
TaxDetermination
ComplianceDocument
EInvoice
ReturnDefinition
ReturnPeriod
ReturnSubmission
Reconciliation
ComplianceIssue
ComplianceDeadline
ComplianceEvidence
GovernmentConnection
```

All country rules must contain:

```text
country
jurisdiction
regime
effective_from
effective_to
version
source
```

Historical transactions must retain a **tax determination snapshot**.

---

# 5. Data ownership

### Core

Owns:

- party identity
- tenancy
- RBAC
- documents
- payments
- audit
- domain events

### Inventory

Owns:

- items/SKUs
- stock
- product master

### FSM

Owns:

- service jobs
- service billing transaction context

### CRM

Owns:

- customer relationship
- conversations
- opportunities

### Compliance

Owns:

- tax interpretation
- registrations
- tax rules
- compliance documents
- returns
- filings
- reconciliations
- compliance issues
- deadlines
- evidence

**Never duplicate transaction masters unnecessarily.**

---

# 6. P0 EPICS & STORIES

## COMPLY-P0-01 — Compliance Shell & Country Switch

### COMPLY-P0-01.1 — Rename GST UI to Compliance
User-facing label becomes **Compliance** while preserving module/package compatibility.

### COMPLY-P0-01.2 — Country Selector
Support country/region selection.

### COMPLY-P0-01.3 — Tax Regime Selector
Country can expose one or more regimes, e.g. India → GST, US → Sales Tax, Malaysia → SST.

### COMPLY-P0-01.4 — Context Persistence
Persist active business/country/regime/registration.

### COMPLY-P0-01.5 — Unsupported-Country UX
Clearly show supported vs planned capability.

---

## COMPLY-P0-02 — Generic Tax Framework

### COMPLY-P0-02.1 — Tax Registration
Generic registration entity.

### COMPLY-P0-02.2 — Tax Jurisdiction
Country/state/province/local jurisdiction support.

### COMPLY-P0-02.3 — Versioned Tax Rules
Rules have effective dates and source references.

### COMPLY-P0-02.4 — Tax Treatments
Standard/reduced/zero/exempt/out-of-scope/reverse-charge/export/import etc.

### COMPLY-P0-02.5 — Tax Determination Snapshot
Persist the result used for a transaction.

---

## COMPLY-P0-03 — Existing-Data Integration

### COMPLY-P0-03.1 — Core Transaction Contract
Read invoice/payment/document context from Core.

### COMPLY-P0-03.2 — Inventory Tax Context
Read product/service classification from Inventory.

### COMPLY-P0-03.3 — FSM Tax Context
Read service-billing context from FSM.

### COMPLY-P0-03.4 — Party Tax Context
Use Core party address/tax-registration data.

### COMPLY-P0-03.5 — No Duplicate Masters
Prevent a second customer/product/transaction master inside Compliance.

---

## COMPLY-P0-04 — India GST

### COMPLY-P0-04.1 — GSTIN Management
Multiple GST registrations.

### COMPLY-P0-04.2 — GST Profile
Regular/composition, registration date, state, return frequency and e-invoice eligibility.

### COMPLY-P0-04.3 — HSN/SAC
Classification and validation.

### COMPLY-P0-04.4 — Place of Supply
Determine intra/inter-state/export/special treatment.

### COMPLY-P0-04.5 — GST Tax Determination
CGST/SGST/UTGST/IGST/cess where applicable, reverse charge, exempt/zero-rated/export/SEZ treatment.

### COMPLY-P0-04.6 — GST Invoice Validation
Validate mandatory transaction/invoice fields before downstream submission.

### COMPLY-P0-04.7 — GST Rule Versioning
Rates/treatments never hard-coded permanently.

---

## COMPLY-P0-05 — India E-Invoice

### COMPLY-P0-05.1 — E-Invoice Eligibility
Determine obligation using active rules.

### COMPLY-P0-05.2 — Schema Validation
Validate mandatory fields.

### COMPLY-P0-05.3 — IRP Adapter
Provider interface:

```text
submit
status
cancel
fetch
```

### COMPLY-P0-05.4 — IRN/QR Response
Persist government response and identifiers.

### COMPLY-P0-05.5 — Reporting Deadline Control
Apply active reporting window rules, including the current 30-day restriction for applicable ₹10 crore+ AATO taxpayers.

### COMPLY-P0-05.6 — E-Invoice Status
Ready/Submitted/Accepted/Rejected/Cancelled/Failed/Deadline Breached.

---

## COMPLY-P0-06 — India E-Way Bill

### COMPLY-P0-06.1 — Eligibility Engine
Determine whether e-way bill applies.

### COMPLY-P0-06.2 — Movement Data
Consignor/consignee/transport/vehicle/distance/supply details.

### COMPLY-P0-06.3 — E-Way Adapter
Generate/update/extend/cancel/status.

### COMPLY-P0-06.4 — Document Link
Link e-way bill to source transaction.

---

## COMPLY-P0-07 — India Returns

### COMPLY-P0-07.1 — GSTR-1 Preparation

### COMPLY-P0-07.2 — GSTR-3B Preparation

### COMPLY-P0-07.3 — GSTR-9 Preparation

### COMPLY-P0-07.4 — Return Drill-Down
Every return amount is traceable to source transactions.

### COMPLY-P0-07.5 — Return Review Workflow
Draft → Validate → Review → Approve → File.

### COMPLY-P0-07.6 — Return Lock
Approved/filed periods are protected from silent alteration.

### COMPLY-P0-07.7 — Filing/Payment Status

---

## COMPLY-P0-08 — India Reconciliation & IMS

### COMPLY-P0-08.1 — GSTR-2B Fetch/Import

### COMPLY-P0-08.2 — Purchase-to-2B Matching

### COMPLY-P0-08.3 — Match Explanation

### COMPLY-P0-08.4 — IMS Accept/Reject/Pending

### COMPLY-P0-08.5 — ITC Availability View

### COMPLY-P0-08.6 — Exception Queue

---

## COMPLY-P0-09 — Compliance Calendar & Risk

### COMPLY-P0-09.1 — Filing Calendar

### COMPLY-P0-09.2 — Payment Calendar

### COMPLY-P0-09.3 — Reminder Engine

### COMPLY-P0-09.4 — Overdue Detection

### COMPLY-P0-09.5 — Risk Dashboard

Examples:

```text
Return not approved
E-invoice deadline approaching
Unmatched ITC
Missing tax registration
Invalid classification
Failed submission
```

---

## COMPLY-P0-10 — Evidence & Audit

### COMPLY-P0-10.1 — Evidence Repository

### COMPLY-P0-10.2 — Government Response Store

### COMPLY-P0-10.3 — Audit Trail

### COMPLY-P0-10.4 — Source Traceability

### COMPLY-P0-10.5 — Retention Rules

Retention must be country/regime-specific.

---

## COMPLY-P0-11 — Compliance UI

### COMPLY-P0-11.1 — Overview Dashboard

### COMPLY-P0-11.2 — Desktop Table Presentation

Use tables/proto-tables when comparing returns, invoices, exceptions or registrations.

### COMPLY-P0-11.3 — Responsive Mobile Cards

### COMPLY-P0-11.4 — Row-Level Actions

Examples:

```text
[Review] [Edit] [•••]
```

### COMPLY-P0-11.5 — Clear Status Hierarchy

Never rely on color alone.

---

# 7. P1 EPICS & STORIES

## COMPLY-P1-01 — EU VAT Framework

### COMPLY-P1-01.1 — EU VAT Core

### COMPLY-P1-01.2 — Member State Country Packs

Initial focus:

```text
Germany
France
Belgium
Poland
Italy
```

### COMPLY-P1-01.3 — Intra-EU VAT

### COMPLY-P1-01.4 — OSS/IOSS

### COMPLY-P1-01.5 — VAT ID Validation / VIES Where Supported

### COMPLY-P1-01.6 — Country-Specific E-Invoicing

Country adapters must be independent.

---

## COMPLY-P1-02 — United States

### COMPLY-P1-02.1 — State/Local Jurisdictions

### COMPLY-P1-02.2 — Economic Nexus Tracker

### COMPLY-P1-02.3 — Physical Nexus Inputs

### COMPLY-P1-02.4 — Sales Tax Registration Obligations

### COMPLY-P1-02.5 — Product/Service Taxability

### COMPLY-P1-02.6 — Exemption Certificates

### COMPLY-P1-02.7 — Sales Tax Returns/Remittance

### COMPLY-P1-02.8 — 1099 Information Returns

---

## COMPLY-P1-03 — Canada

### COMPLY-P1-03.1 — GST/HST

### COMPLY-P1-03.2 — Provincial PST/QST/RST

### COMPLY-P1-03.3 — Place of Supply

### COMPLY-P1-03.4 — Filing Periods

### COMPLY-P1-03.5 — CRA Filing Adapter

---

## COMPLY-P1-04 — Singapore

### COMPLY-P1-04.1 — GST Registration

### COMPLY-P1-04.2 — GST F5

### COMPLY-P1-04.3 — InvoiceNow Eligibility

### COMPLY-P1-04.4 — Peppol Identifier

### COMPLY-P1-04.5 — InvoiceNow Adapter

### COMPLY-P1-04.6 — Transmission Status

### COMPLY-P1-04.7 — Five-Year Record Retention

---

## COMPLY-P1-05 — UAE

### COMPLY-P1-05.1 — VAT Registration

### COMPLY-P1-05.2 — VAT Return

### COMPLY-P1-05.3 — EmaraTax Adapter

### COMPLY-P1-05.4 — VAT Mismatch Review

### COMPLY-P1-05.5 — Voluntary Disclosure

### COMPLY-P1-05.6 — UAE E-Invoicing Readiness

---

## COMPLY-P1-06 — Saudi Arabia

### COMPLY-P1-06.1 — ZATCA Registration Context

### COMPLY-P1-06.2 — Fatoora Adapter

### COMPLY-P1-06.3 — Structured Invoice Validation

### COMPLY-P1-06.4 — Clearance/Reporting

### COMPLY-P1-06.5 — QR/Security Evidence

### COMPLY-P1-06.6 — Integration-Wave Tracking

---

## COMPLY-P1-07 — Australia / New Zealand

### COMPLY-P1-07.1 — Australia GST

### COMPLY-P1-07.2 — BAS

### COMPLY-P1-07.3 — Peppol eInvoicing

### COMPLY-P1-07.4 — New Zealand GST

### COMPLY-P1-07.5 — NZ Filing Frequency

---

## COMPLY-P1-08 — Asia

### COMPLY-P1-08.1 — Malaysia SST

### COMPLY-P1-08.2 — Thailand VAT

### COMPLY-P1-08.3 — Indonesia VAT/e-Faktur

### COMPLY-P1-08.4 — Japan Consumption Tax/Qualified Invoice

### COMPLY-P1-08.5 — South Korea VAT/e-Tax Invoice

---

## COMPLY-P1-09 — Government Integration Framework

### COMPLY-P1-09.1 — Common Adapter Contract

```text
authenticate
validate
submit
status
fetch
cancel
```

### COMPLY-P1-09.2 — Secure Credential Store

### COMPLY-P1-09.3 — Submission Idempotency

### COMPLY-P1-09.4 — Retry Handling

### COMPLY-P1-09.5 — Integration Health

---

## COMPLY-P1-10 — AI Compliance Assistant

### COMPLY-P1-10.1 — "What do I need to file?"

### COMPLY-P1-10.2 — Explain My Tax

### COMPLY-P1-10.3 — Explain a Mismatch

### COMPLY-P1-10.4 — Filing Readiness Summary

### COMPLY-P1-10.5 — Anomaly Detection

### COMPLY-P1-10.6 — Compliance Research Assistant

AI must answer from versioned rules/evidence and clearly distinguish facts from explanation.

---

## COMPLY-P1-11 — Compliance Risk Center

### COMPLY-P1-11.1 — Risk Register

### COMPLY-P1-11.2 — Risk Severity

### COMPLY-P1-11.3 — Risk Owner

### COMPLY-P1-11.4 — Remediation Workflow

---

## COMPLY-P1-12 — Cross-Module Compliance Intelligence

### COMPLY-P1-12.1 — Inventory Tax Readiness

### COMPLY-P1-12.2 — FSM Tax Readiness

### COMPLY-P1-12.3 — CRM Customer Tax Context

### COMPLY-P1-12.4 — Payment-to-Tax Reconciliation

### COMPLY-P1-12.5 — Core Domain Events

---

# 8. Recommended delivery order

## P0 Release 1

```text
COMPLY-P0-01
COMPLY-P0-02
COMPLY-P0-03
COMPLY-P0-04
```

Goal: generic Compliance foundation + India GST.

## P0 Release 2

```text
COMPLY-P0-05
COMPLY-P0-06
COMPLY-P0-07
COMPLY-P0-08
```

Goal: complete Indian operational compliance.

## P0 Release 3

```text
COMPLY-P0-09
COMPLY-P0-10
COMPLY-P0-11
```

Goal: control center, auditability and production-quality UI.

## P1 Release 1

```text
COMPLY-P1-01 EU
COMPLY-P1-02 US
COMPLY-P1-03 Canada
COMPLY-P1-04 Singapore
```

## P1 Release 2

```text
COMPLY-P1-05 UAE
COMPLY-P1-06 Saudi Arabia
COMPLY-P1-07 Australia/NZ
COMPLY-P1-08 Asia
```

## P1 Release 3

```text
COMPLY-P1-09 Government adapters
COMPLY-P1-10 AI assistant
COMPLY-P1-11 Risk center
COMPLY-P1-12 Cross-module intelligence
```

---

# 9. Universal Claude Code implementation rules

1. Inspect the existing `module-gst` implementation before creating anything.
2. Reuse Core/Inventory/FSM/CRM data through approved contracts.
3. Do not duplicate transaction/customer/product masters.
4. One story at a time.
5. Do not implement future stories implicitly.
6. Country rules must be versioned and source-referenced.
7. Government integrations must be adapter-based.
8. Never hard-code tax rates into UI components.
9. Preserve RLS/RBAC/licensing.
10. Filing/submission is a consequential external action: require explicit user authorization and review.
11. Never claim "compliant" simply because a calculation succeeded.
12. Distinguish regulatory fact, software rule, calculated result and AI explanation.
13. Preserve historical filing/evidence state.
14. Add tests for edge cases, effective dates and jurisdiction logic.
15. For every UI story, plan the layout before coding.
16. On desktop, use tables/proto-tables when comparing multiple records.
17. On mobile, use responsive cards/progressive disclosure.
18. Use subtle borders/dividers where they improve grouping.
19. Keep buttons/actions aligned with the object they operate on.
20. Add editable row actions where applicable.
21. Test responsive widths and fix overflow/overlap/wrapping.
22. "Technically works" is not the UI definition of done; it must look professional and intentional.

---

# 10. Important product positioning

WonderArc should not say:

> "GST software for many countries."

It should say:

> **"One compliance workspace that adapts to where your business operates."**

The ideal experience is:

```text
Choose Country
   ↓
Add/verify registrations
   ↓
WonderArc identifies obligations
   ↓
Connect existing business data
   ↓
Validate transactions
   ↓
Prepare documents and returns
   ↓
Resolve exceptions
   ↓
Review
   ↓
File
   ↓
Track payment
   ↓
Preserve evidence
```

The key architecture is:

**Country Pack + Versioned Rules + Government Adapter + Shared Transaction Facts**

---

# 11. Research Sources

[1] Zoho Books India GST filing: https://www.zoho.com/in/books/help/gst/
[2] Zoho Books India e-invoicing: https://www.zoho.com/in/books/help/e-invoicing/
[3] Zoho Books India IMS / reconciliation: https://www.zoho.com/in/books/help/gst/ims.html
[4] Zoho Books Canada/Singapore/UAE tax features: https://www.zoho.com/ca/books/help/canada-tax/gst-hst-return.html ; https://www.zoho.com/en-sg/books/e-invoicing/ ; https://www.zoho.com/ae/books/help/vat-uae/vat-return-filing.html
[5] TallyPrime GSTR-1/direct filing: https://help.tallysolutions.com/tally-prime/gstr-1/india-gst-filing-gstr1-tally/
[6] TallyPrime taxation/IMS/e-way bill: https://tallysolutions.com/features/taxation/
[7] QuickBooks US Sales Tax: https://quickbooks.intuit.com/learn-support/en-us/help-article/sales-taxes/sales-tax-quickbooks-online/L6oZbeziN_US_en_US
[8] QuickBooks Singapore GST: https://quickbooks.intuit.com/sg/gst-tracking/
[9] Xero Canada sales tax: https://www.xero.com/ca/accounting-software/calculate-sales-tax/
[10] Xero Singapore InvoiceNow: https://www.xero.com/sg/initiative/e-invoicing/
[11] Xero UK MTD: https://www.xero.com/uk/accounting-software/submit-vat-online/mtd-software/
[12] Avalara global tax compliance: https://www.avalara.com/us/en/index.html
[13] Avalara sales tax/nexus: https://www.avalara.com/us/en/products/sales-and-use-tax.html
[14] GSTN GSTR-1: https://tutorial.gst.gov.in/userguide/returns/GSTR_1.htm
[15] GSTN IMS FAQ: https://tutorial.gst.gov.in/downloads/news/final_faqs_on_ims_22_09_2024.pdf
[16] GST/IRP e-invoicing: https://einvoice6.gst.gov.in/content/revised-time-limit-for-e-invoice-reporting-for-businesses-with-aato-of-%E2%82%B910-crores-above/
[17] Zoho India e-invoicing applicability: https://www.zoho.com/in/books/help/e-invoicing/
[18] European Commission VAT returns: https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-returns_en
[19] European Commission VAT rates: https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en
[20] European Commission ViDA: https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en
[21] France e-invoicing 2026/27: https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises
[22] Germany e-invoice rules: https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html
[23] Belgium e-invoicing: https://einvoice.belgium.be/en/FAQ/general-questions-b2b
[24] Poland KSeF: https://ksef.podatki.gov.pl/etapy-wdrozenia-ksef/
[25] IRS information-return e-filing: https://www.irs.gov/taxtopics/tc801
[26] IRS 1099 instructions: https://www.irs.gov/publications/p1099
[27] CRA GST/HST registration: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
[28] CRA GST/HST rates/place of supply: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-place-supply.html
[29] CRA GST/HST rates: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html
[30] CRA mandatory electronic filing: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return/how-file.html
[31] CRA certified third-party software: https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/gst-hst-internet-file-transfer/gst-hst-internet-file-transfer-eligibility.html
[32] IRAS GST registration: https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/gst-registration-deregistration/do-i-need-to-register-for-gst
[33] IRAS GST filing: https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/filing-gst/overview-of-gst-e-filing-process
[34] IRAS GST record keeping: https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/basics-of-gst/invoicing-price-display-and-record-keeping/keeping-records
[35] IRAS GST InvoiceNow: https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/gst-invoicenow-requirement
[36] Xero InvoiceNow: https://www.xero.com/sg/initiative/e-invoicing/
[37] UAE FTA VAT registration: https://www.tax.gov.ae/en/taxes/Vat/vat.topics/registration.for.vat.aspx
[38] Zoho UAE VAT filing: https://www.zoho.com/ae/books/help/vat-uae/vat-return-filing.html
[39] ZATCA e-invoicing phases: https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx
[40] ZATCA Wave 25, 2026: https://zatca.gov.sa/en/MediaCenter/News/Pages/Wave25-E-invoicing.aspx
[41] Australian GST: https://business.gov.au/registrations/register-for-taxes/register-for-goods-and-services-tax-gst
[42] Australian Peppol/eInvoicing: https://softwaredevelopers.ato.gov.au/eInvoicing
[43] New Zealand GST registration: https://www.ird.govt.nz/registering-for-gst
[44] New Zealand filing frequency: https://www.ird.govt.nz/gst/registering-for-gst/which-gst-accounting-basis-and-filing-frequency-should-i-use
[45] Malaysia SST: https://mysst.customs.gov.my/
[46] Malaysia SST framework: https://mysst.customs.gov.my/understanding-sst/
[47] Japan Qualified Invoice System: https://www.nta.go.jp/english/taxes/consumption_tax/pdf/2022/simplified_00.pdf

> **Disclaimer:** This is a software product/research specification, not tax or legal advice. Country rules must be reviewed against the current authoritative tax authority guidance before production filing or tax determination.
