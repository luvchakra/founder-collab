# WonderArk — CSV / Excel Export Implementation Specification

## 1. Document purpose

This document is an implementation-ready specification for adding a **consistent CSV and Excel export capability across WonderArk**.

It was prepared against the latest `main` branch of:

`https://github.com/luvchakra/founder-collab/tree/main`

Repository snapshot inspected:

- Branch: `main`
- HEAD: `52529d0914e8556eecb6a57e1f8080bd279c3960`
- HEAD date: 25-Sep-2026
- Latest commit at inspection: `feat(site): public Terms, Privacy and Pricing pages...`
- Repository tree: approximately 2,439 files
- Application route inventory: approximately 168 `page.tsx` routes
- Existing CSV parsing exists for Discovery prospect import and Inventory product import.
- `exceljs` is already present in `module-discovery` for Excel import/parsing, but there is currently no platform-wide export framework.

The purpose of this specification is **not** to redesign existing modules. It adds a reusable export capability to the existing screens while preserving all current workflows and UI patterns.

---

# 2. Executive requirement

WonderArk should have **one export interaction pattern everywhere**.

Users should never encounter a different CSV/Excel export implementation in different modules.

The platform should support:

1. Export current filtered dataset to CSV.
2. Export current filtered dataset to Excel `.xlsx`.
3. Export the complete dataset behind the current view, not merely the currently rendered rows.
4. Preserve current filters and meaningful report parameters.
5. Export the same columns the user sees, plus clearly documented useful fields where appropriate.
6. Use consistent file naming.
7. Use consistent encoding, date, number, currency and boolean formatting.
8. Respect authentication, business/workspace tenancy, module licensing and RBAC.
9. Never export secrets, credentials, API keys, tokens or sensitive control-plane data.
10. Record export activity in the existing audit system.
11. Prevent CSV/Excel formula injection.
12. Work correctly on desktop and mobile.
13. Provide clear loading/success/failure states.
14. Support large datasets through the existing background-job pattern rather than timing out.
15. Reuse the same export component, serializers and server-side security checks throughout the application.

---

# 3. Important architectural constraint

## Existing Discovery is protected

The existing Discovery implementation is a protected subsystem.

Do not:

- rename existing Discovery routes;
- move existing Discovery menus;
- migrate Discovery tables;
- rename existing Discovery entities;
- refactor existing Discovery workflows merely to add export;
- replace existing query implementations;
- change existing AI prompts;
- move Products/ICP/Prospects/etc.;
- restructure Marketing/Funding.

Exports are an additive capability.

If an export needs data from an existing Discovery query, create a small export adapter around the existing query rather than changing the existing subsystem.

---

# 4. Existing architecture to preserve

The repository's current architecture requires:

- Next.js 16 App Router.
- `apps/web` as the thin host.
- `packages/core` for shared platform capabilities.
- Module packages for Discovery, Inventory, FSM, CRM and Finance/GST.
- Supabase/Postgres.
- Server-side authentication and tenant resolution.
- RLS.
- Module license enforcement.
- `core.audit_log`.
- `core.background_jobs` / existing DB-backed job pattern where applicable.
- Existing UI components from `@cofounderai/core/ui`.
- Existing responsive rule: desktop tables, compact cards below `md`.
- Existing design rules in `docs/design/claude-ui-design-rules.md`.

Do not introduce a new service, Redis, Kafka, S3-compatible export system or another queue solely for this feature.

---

# 5. Export UX standard

## 5.1 Page-header placement

Every exportable page should use the same placement:

```text
[Page title / description]                         [Export ▼] [Primary action]
```

For pages with multiple primary actions:

```text
[Page title]                  [Export ▼] [Secondary] [Primary]
```

The export control should use the platform's existing button styling.

Recommended appearance:

- variant: `outline`
- size: `sm`
- icon: `Download`
- label: `Export`
- chevron: `ChevronDown`

Do not create a unique export icon or custom visual treatment per module.

---

# 6. Export menu

Clicking `Export` opens the same menu everywhere:

```text
Export
────────────────────
CSV
Excel (.xlsx)
────────────────────
Export current view
Export all matching records
```

The exact options should be context-aware.

For normal list pages:

```text
CSV
Excel (.xlsx)

Current filtered view
All matching records
```

For report pages:

```text
CSV
Excel (.xlsx)

Current report
Full report workbook
```

For dashboards:

```text
Excel (.xlsx)
CSV

Dashboard data
Detailed report
```

Do not export a screenshot of a dashboard.

Export the underlying structured data.

---

# 7. Selection semantics

## 7.1 Current filtered view

"Current view" means:

- current filters;
- current date range;
- current selected business/workspace;
- current selected offering/product/round/warehouse;
- current report tab;
- current status filter;
- current channel filter;
- current owner filter;
- current search filter where it represents a server-supported dataset filter.

Sorting should be reflected where meaningful.

## 7.2 All matching records

"All matching records" means:

- same filters;
- same tenant;
- same report scope;
- no UI pagination limit.

It must not mean "all records in the entire tenant" if filters are active.

Example:

If CRM Opportunities is filtered to:

```text
Owner = Kunal
Stage = Qualified
```

the export must contain all Qualified opportunities owned by Kunal, not merely the 25 currently rendered rows.

---

# 8. Common export component

Create a reusable platform component:

```text
packages/core/src/components/exports/
```

Suggested files:

```text
export-button.tsx
export-menu.tsx
export-dialog.tsx
export-format.ts
export-types.ts
export-status.tsx
```

Suggested public package export:

```text
@cofounderai/core/exports/*
```

Do not duplicate export buttons inside individual modules.

---

# 9. Common export contract

Define a framework-neutral export contract.

Suggested conceptual type:

```ts
type ExportColumn<T> = {
  key: string;
  header: string;
  getValue: (row: T) => unknown;
  type?: "text" | "number" | "currency" | "date" | "datetime" | "boolean";
  width?: number;
};

type ExportDefinition<T> = {
  filename: string;
  sheetName: string;
  title?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  metadata?: Record<string, string>;
};
```

For multi-sheet exports:

```ts
type ExportWorkbookDefinition = {
  filename: string;
  sheets: ExportDefinition<unknown>[];
};
```

The contract must not depend on React.

---

# 10. CSV serializer

Create:

```text
packages/core/src/exports/csv.ts
```

Requirements:

- UTF-8.
- Include UTF-8 BOM for Excel compatibility.
- Quote fields containing commas.
- Quote fields containing newlines.
- Escape double quotes using `""`.
- Preserve empty/null as blank.
- Dates formatted consistently.
- Numbers use raw numeric representation where possible.
- Currency fields should contain numeric values, not decorative currency symbols, unless the export is explicitly a presentation report.
- Boolean values should be `Yes` / `No`.
- Arrays should be joined predictably.
- Objects must never become `[object Object]`.
- Null values must never become `"undefined"`.

---

# 11. CSV formula injection protection

Any text cell beginning with:

- `=`
- `+`
- `@`

must be neutralized before CSV output.

Example:

```text
=HYPERLINK(...)
```

must not become an executable Excel formula.

Use a deterministic sanitizer.

Do not blindly prefix every negative number with an apostrophe.

---

# 12. Excel serializer

Create:

```text
packages/core/src/exports/xlsx.ts
```

Use `exceljs`.

Add `exceljs` as an explicit dependency of `@cofounderai/core` rather than relying on another module's transitive dependency.

Excel workbook requirements:

- one worksheet per report/data category;
- worksheet names <= 31 characters;
- bold header row;
- frozen header row;
- autofilter;
- sensible column widths;
- typed dates;
- typed numeric values;
- currency number formatting;
- percentage number formatting;
- consistent title/metadata block only when appropriate;
- no merged cells for normal tabular exports;
- no hidden formulas;
- no external links;
- no macros.

Recommended default worksheet name:

`Data`

For reports:

`Summary`, `Details`, etc.

---

# 13. File naming standard

Use:

```text
wonderark_<module>_<resource>_<yyyy-mm-dd>.<ext>
```

Examples:

```text
wonderark_crm_leads_2026-09-26.csv
wonderark_inventory_products_2026-09-26.xlsx
wonderark_finance_profit-and-loss_2026-09-26.xlsx
wonderark_discovery_investors_2026-09-26.csv
```

For filtered exports, do not put arbitrary user-entered filter text into filenames.

---

# 14. Export metadata

Every export should include, where appropriate:

```text
Business
Report / resource
Generated at
Period
Filters
Generated by
```

For CSV, metadata can be represented in a first metadata section only for reports where it does not interfere with machine ingestion.

For normal entity lists, keep the CSV strictly tabular.

For Excel, metadata can be placed in a small `Summary` sheet.

---

# 15. Server-side security contract

All export requests must be resolved server-side.

Never accept:

```text
businessId
workspaceId
tenantId
module entitlement
permission
```

as trusted client authorization input.

The server must derive the current tenant/business/workspace from authenticated session context and the route.

Required checks:

1. authenticated user;
2. correct business/workspace;
3. module licensed;
4. required permission;
5. row-level access;
6. export-specific permission where required.

RLS remains authoritative.

---

# 16. Export audit

Every successful and failed export attempt should be recorded through the existing audit infrastructure.

Recommended event:

```text
export.generated
```

Payload:

```json
{
  "module": "crm",
  "resource": "opportunities",
  "format": "xlsx",
  "scope": "filtered",
  "row_count": 124,
  "filters": {
    "stage": "qualified"
  }
}
```

Do not record:

- full customer documents;
- API keys;
- access tokens;
- investor private credentials;
- signed URLs;
- secrets.

Record only metadata required for auditability.

---

# 17. Large-export behavior

Initial synchronous export threshold:

```text
<= 25,000 rows
```

For larger exports:

1. create an export job using the existing background-job pattern;
2. show `Preparing export...`;
3. notify the user when ready;
4. provide a secure download;
5. expire generated files according to existing retention policy;
6. audit the job.

Do not add a new queue system.

The exact threshold may be configurable later.

---

# 18. Permission model

Normal exports inherit the page's existing read permission.

Additional restrictions:

### Finance

Exports containing financial data require the same finance/report read permission as the underlying page.

### Inventory cost data

If the user cannot view cost, exports must not contain:

- cost price;
- margin;
- landed cost;
- supplier cost.

### Funding Data Room

Do not export document contents from the data-room index.

Only export metadata unless the user explicitly downloads a document using the existing secure document download flow.

### Platform administration

Never export:

- secrets;
- credentials;
- API keys;
- tokens;
- encryption material.

---

# 19. Export UI states

Every export control must support:

### Idle

`Export`

### Preparing

`Preparing…`

### Success

Browser downloads the file.

### Failure

Show:

```text
Export failed
We could not generate this export. No data was changed.
```

Do not claim that a file was generated when generation failed.

### Large export

```text
Export queued
Your export is being prepared. We'll notify you when it is ready.
```

---

# 20. Mobile behavior

On mobile:

- export button remains available;
- it may collapse to icon-only when space is constrained;
- accessible label must remain `Export`;
- menu opens as a sheet/popover consistent with existing responsive primitives;
- never create a horizontally overflowing toolbar;
- export actions remain reachable without opening desktop-only controls.

---

# 21. Story inventory

The following stories cover the useful CSV/Excel export points identified from the current application route and feature inventory.

The story IDs below should be cited in code, tests or implementation comments so the progress tracker can identify the work.

---

# 21a. Story index

Every story in sections 22–30, in one table -- the progress tracker
(`scripts/build-progress-tracker.mjs`) reads story ids from this table, and code cites
them (e.g. `EXP-CRM-02`) as evidence of implementation.

| ID | Story |
|---|---|
| `EXP-PLAT-01` | Shared Export Contract |
| `EXP-PLAT-02` | CSV Export Engine |
| `EXP-PLAT-03` | Excel Export Engine |
| `EXP-PLAT-04` | Shared Export UI |
| `EXP-PLAT-05` | Secure Export Route / Server Action |
| `EXP-PLAT-06` | Large Export Job |
| `EXP-DISC-01` | Business / Business Offerings Export |
| `EXP-DISC-02` | Discovery Dashboard Export |
| `EXP-DISC-03` | Offering Prospects Export |
| `EXP-DISC-04` | Prospect Detail / Buyer Intelligence Export |
| `EXP-DISC-05` | Opportunity Export |
| `EXP-DISC-06` | ICP Export |
| `EXP-DISC-07` | Research / Signals Export |
| `EXP-DISC-08` | Outreach Export |
| `EXP-DISC-09` | Opportunity / Pipeline Export |
| `EXP-DISC-10` | Conversion Export |
| `EXP-DISC-11` | Offering Performance Export |
| `EXP-DISC-12` | Discovery History / Usage / Watchlist Export |
| `EXP-MKT-01` | Marketing Dashboard Export |
| `EXP-MKT-02` | Marketing Strategy Export |
| `EXP-MKT-03` | Campaign List Export |
| `EXP-MKT-04` | Campaign Detail / Performance Export |
| `EXP-MKT-05` | Content Export |
| `EXP-MKT-06` | Assets / Website SEO Export |
| `EXP-MKT-07` | Marketing Analytics Export |
| `EXP-FND-01` | Funding Dashboard Export |
| `EXP-FND-02` | Funding Profile Export |
| `EXP-FND-03` | Investor Readiness Export |
| `EXP-FND-04` | Fundraising Rounds Export |
| `EXP-FND-05` | Investors List Export |
| `EXP-FND-06` | Investor Detail Export |
| `EXP-FND-07` | Investor Pipeline Export |
| `EXP-FND-08` | Investor Outreach Export |
| `EXP-FND-09` | Data Room Metadata Export |
| `EXP-FND-10` | Due Diligence and Funding Analytics Export |
| `EXP-CRM-01` | CRM Dashboard Export |
| `EXP-CRM-02` | Leads Export |
| `EXP-CRM-03` | Opportunities Export |
| `EXP-CRM-04` | CRM Analytics Export |
| `EXP-CRM-05` | Lost Business Export |
| `EXP-CRM-06` | Reactivation Export |
| `EXP-CRM-07` | Follow-up Queue Export |
| `EXP-CRM-08` | Reviews Export |
| `EXP-CRM-09` | Conversations / WhatsApp Export |
| `EXP-CRM-10` | Customer 360 / Exceptions Export |
| `EXP-INV-01` | Inventory Dashboard Export |
| `EXP-INV-02` | Products Export |
| `EXP-INV-03` | Customers Export |
| `EXP-INV-04` | Suppliers Export |
| `EXP-INV-05` | Warehouses Export |
| `EXP-INV-06` | Stock Export |
| `EXP-INV-07` | Purchase Orders Export |
| `EXP-INV-08` | Sales Orders Export |
| `EXP-INV-09` | Sales Invoices and Returns Export |
| `EXP-INV-10` | Stock Transfers Export |
| `EXP-INV-11` | Alerts Export |
| `EXP-INV-12` | Inventory Audit Log Export |
| `EXP-FSM-01` | FSM Dashboard Export |
| `EXP-FSM-02` | Customers Export |
| `EXP-FSM-03` | Jobs Export |
| `EXP-FSM-04` | Opportunities Export |
| `EXP-FSM-05` | Invoices Export |
| `EXP-FSM-06` | Schedule Export |
| `EXP-FSM-07` | My Day Export |
| `EXP-FSM-08` | FSM Reports Export |
| `EXP-FSM-09` | Assessment Export |
| `EXP-FIN-01` | Finance Dashboard Export |
| `EXP-FIN-02` | Chart of Accounts Export |
| `EXP-FIN-03` | Bills and Expenses Export |
| `EXP-FIN-04` | Payables Export |
| `EXP-FIN-05` | Receivables Export |
| `EXP-FIN-06` | Journal Export |
| `EXP-FIN-07` | GST Ledger Export |
| `EXP-FIN-08` | Bank / Reconciliation Export |
| `EXP-FIN-09` | Recurring Entries Export |
| `EXP-FIN-10` | Budget vs Actual Export |
| `EXP-FIN-11` | Financial Statements Export |
| `EXP-FIN-12` | Filing Export |
| `EXP-FIN-13` | Filing Readiness Export |
| `EXP-FIN-14` | E-invoice / E-way Bill Export |
| `EXP-FIN-15` | Finance Exceptions Export |
| `EXP-FIN-16` | Finance Evidence Export |
| `EXP-FIN-17` | Audit / Backfill / Activation Export |
| `EXP-ADMIN-01` | Platform Audit Export |
| `EXP-ADMIN-02` | AI Usage Export |
| `EXP-ADMIN-03` | Integrations Export |
| `EXP-ADMIN-04` | Plans / Entitlements Export |
| `EXP-ADMIN-05` | Compliance Registry Export |
| `EXP-ADMIN-06` | Config History Export |
| `EXP-ADMIN-07` | Announcements / Feature Flags / Notification Policies Export |

---

# 22. Platform export foundation stories

## EXP-PLAT-01 — Shared Export Contract

### Goal

Create the common export types and provider-neutral API.

### Requirements

Implement:

- `ExportColumn`;
- `ExportDefinition`;
- `ExportWorkbookDefinition`;
- `ExportFormat`;
- `ExportScope`;
- export result/status types.

### Acceptance criteria

- no React dependency;
- usable by all modules;
- typed columns;
- supports multiple worksheets;
- supports metadata;
- supports custom value formatting.

---

## EXP-PLAT-02 — CSV Export Engine

Implement the shared CSV serializer.

Acceptance:

- UTF-8 BOM;
- quoting;
- escaped quotes;
- multiline cells;
- null handling;
- date handling;
- formula injection protection;
- deterministic output;
- unit tests for all edge cases.

---

## EXP-PLAT-03 — Excel Export Engine

Implement shared Excel generation using ExcelJS.

Acceptance:

- typed values;
- frozen headers;
- autofilter;
- widths;
- dates;
- currency;
- percentages;
- multiple sheets;
- no secrets;
- deterministic tests.

---

## EXP-PLAT-04 — Shared Export UI

Create the common Export button/menu/dialog.

Acceptance:

- same visual treatment across modules;
- CSV;
- Excel;
- current filtered view;
- all matching records;
- loading state;
- failure state;
- mobile support;
- keyboard accessibility.

---

## EXP-PLAT-05 — Secure Export Route / Server Action

Create the common server-side export execution mechanism.

Requirements:

- authenticated request;
- tenant resolution;
- license check;
- permission check;
- module adapter invocation;
- response headers;
- filename;
- audit.

---

## EXP-PLAT-06 — Large Export Job

Use the existing background-job mechanism for large exports.

Acceptance:

- threshold handling;
- persisted job status;
- secure download;
- expiration;
- audit;
- no duplicate jobs on double click.

---

# 23. Discovery — existing customer-acquisition exports

Existing Discovery is protected. These are additive adapters only.

## EXP-DISC-01 — Business / Business Offerings Export

Route:

```text
/[businessSlug]/business
```

Export:

- business name;
- website;
- industry;
- location;
- offering/product name;
- offering description;
- offering URL;
- offering status;
- prospect counts;
- created/updated timestamps.

Excel workbook:

- `Business`
- `Offerings`

Do not modify the existing Business/Offering query.

---

## EXP-DISC-02 — Discovery Dashboard Export

Route:

```text
/[businessSlug]/discovery/dashboard
```

Export underlying dashboard data.

Excel sheets:

- `Overview`
- `Offerings`
- `Prospect Funnel`
- `Cross Offering Accounts`
- `Usage`

Do not export visual chart screenshots.

---

## EXP-DISC-03 — Offering Prospects Export

Route:

```text
/[businessSlug]/discovery/offerings/[productId]/prospects
```

Export all matching prospects using current filters.

Fields:

- company;
- website;
- industry;
- company size;
- location;
- status;
- stage;
- score;
- source;
- created date;
- last researched date;
- outcome.

Acceptance:

- export respects all filters;
- no UI pagination limitation;
- same tenant/workspace.

---

## EXP-DISC-04 — Prospect Detail / Buyer Intelligence Export

Route:

```text
.../prospects/[prospectId]
```

Export only structured prospect intelligence.

Excel sheets:

- `Prospect`
- `Contacts`
- `Research`
- `Buyer Intelligence`
- `Signals`
- `Scores`
- `Outreach History`

Do not export raw secrets or provider credentials.

---

## EXP-DISC-05 — Opportunity Export

Route:

```text
.../opportunities
```

Fields:

- opportunity;
- prospect;
- status;
- recommended action;
- opportunity score;
- signal;
- estimated value where available;
- research date;
- created date;
- CRM handoff status.

---

## EXP-DISC-06 — ICP Export

Route:

```text
.../icp
```

Excel sheets:

- `ICP Profile`
- `Personas`
- `Evidence`
- `Version History`

The version history sheet should include:

- version;
- created date;
- source;
- changed fields summary.

Do not flatten evidence into unreadable JSON.

---

## EXP-DISC-07 — Research / Signals Export

Where research and signal datasets are rendered as structured rows, add exports.

Research fields:

- prospect;
- source;
- evidence type;
- observed date;
- finding;
- URL;
- confidence/provenance.

Signals:

- prospect;
- signal type;
- signal date;
- severity;
- source;
- evidence;
- status.

---

## EXP-DISC-08 — Outreach Export

Export structured outreach records.

Fields:

- prospect;
- contact;
- channel;
- strategy;
- status;
- created;
- sent;
- response;
- next action.

Never export credentials or provider configuration.

---

## EXP-DISC-09 — Opportunity / Pipeline Export

Export:

- stage;
- prospect;
- opportunity;
- score;
- value;
- status;
- age;
- recommended action;
- CRM handoff.

If the current page supports stage filters, preserve them.

---

## EXP-DISC-10 — Conversion Export

Route:

```text
.../conversions
```

Excel:

- `Funnel`
- `Prospects`
- `Outcomes`
- `Handoffs`

The funnel sheet must expose the underlying counts used to render the visual funnel.

---

## EXP-DISC-11 — Offering Performance Export

Route:

```text
.../performance
```

Export all raw and derived performance data used by the analysis.

Clearly distinguish:

- actual;
- reported;
- calculated;
- AI-derived.

Do not export an AI conclusion without the evidence rows behind it.

---

## EXP-DISC-12 — Discovery History / Usage / Watchlist Export

### History

Export pipeline runs:

- run ID;
- start;
- end;
- status;
- stage;
- duration;
- result summary.

### Usage

Export:

- operation;
- run count;
- credits/cost;
- period;
- limits.

### Watchlist

Export:

- prospect;
- watchlist status;
- reason;
- last signal;
- last checked;
- alert state.

---

# 24. Marketing export stories

Marketing is the additive Discovery capability already present in the repository.

## EXP-MKT-01 — Marketing Dashboard Export

Route:

```text
/discovery/marketing
```

Excel sheets:

- `Summary`
- `Campaigns`
- `Funnel`
- `Attention`

All metrics must retain the existing rule:

> reported data is exported; missing data remains blank / unreported rather than fabricated as zero.

---

## EXP-MKT-02 — Marketing Strategy Export

Route:

```text
/discovery/marketing/strategy
```

Export:

- strategy;
- positioning;
- target problem;
- target markets;
- buyer segments;
- channels;
- proof points;
- objections;
- goals;
- goal status.

Version/history data should be exported if available.

---

## EXP-MKT-03 — Campaign List Export

Route:

```text
/discovery/marketing/campaigns
```

Fields:

- campaign;
- status;
- objective;
- offering;
- channel;
- audience;
- budget;
- spend;
- start;
- end;
- leads;
- qualified;
- opportunities;
- customers;
- revenue.

Respect current filters.

---

## EXP-MKT-04 — Campaign Detail / Performance Export

Route:

```text
/discovery/marketing/campaigns/[campaignId]
```

Excel sheets:

- `Campaign`
- `Daily Metrics`
- `Content`
- `Assets`
- `Attributions`
- `Activity`

The Daily Metrics sheet should export the exact table currently rendered:

- date;
- source;
- sessions;
- leads;
- qualified leads;
- opportunities;
- customers;
- spend;
- revenue;
- currency.

---

## EXP-MKT-05 — Content Export

Route:

```text
/discovery/marketing/content
```

Export:

- content title;
- type;
- status;
- campaign;
- offering;
- owner;
- scheduled date;
- published date;
- updated date.

Do not put full rich content into CSV unless explicitly selected.

For Excel, a `Content` sheet may include full text in a controlled text column.

---

## EXP-MKT-06 — Assets / Website SEO Export

### Assets

Export:

- asset;
- type;
- campaign;
- offering;
- file size;
- MIME type;
- created date;
- status.

Do not expose signed URLs.

### Website & SEO

Export:

- page;
- category;
- issue;
- severity;
- status;
- recommendation;
- source;
- observed date.

Also export crawl page inventory separately.

---

## EXP-MKT-07 — Marketing Analytics Export

Route:

```text
/discovery/marketing/analytics
```

Export the active report.

For campaign report:

- campaign;
- spend;
- impressions;
- clicks;
- leads;
- qualified;
- opportunities;
- customers;
- revenue;
- CPL;
- cost per qualified;
- cost per opportunity.

For channel report:

- channel;
- campaign count;
- metrics.

For offering report:

- offering;
- campaign count;
- metrics.

Include the active period and filters in workbook metadata.

---

# 25. Funding export stories

## EXP-FND-01 — Funding Dashboard Export

Route:

```text
/discovery/funding
```

Workbook:

- `Summary`
- `Round`
- `Investor Funnel`
- `Readiness`
- `Diligence`
- `Attention`

Finance-derived metrics must retain their source state.

---

## EXP-FND-02 — Funding Profile Export

Export:

- company;
- market;
- product;
- traction;
- team;
- objective;
- target amount;
- instrument;
- preferred geography;
- use of funds;
- provenance.

Clearly label:

- user-entered;
- finance-derived;
- AI-suggested;
- externally sourced.

---

## EXP-FND-03 — Investor Readiness Export

Export:

- category;
- requirement;
- status;
- owner;
- evidence;
- missing information;
- recommendation;
- last updated.

Do not convert AI recommendations into factual readiness claims.

---

## EXP-FND-04 — Fundraising Rounds Export

Export:

- round;
- type;
- status;
- target;
- committed;
- raised;
- remaining;
- currency;
- instrument;
- valuation;
- target close;
- actual close;
- use of funds.

---

## EXP-FND-05 — Investors List Export

Export current investor list.

Fields:

- investor;
- type;
- geography;
- stage preference;
- sector preference;
- cheque range;
- source;
- status;
- website;
- contact;
- active round;
- pipeline stage.

---

## EXP-FND-06 — Investor Detail Export

Route:

```text
/discovery/funding/investors/[investorId]
```

Workbook:

- `Investor`
- `Contacts`
- `Research`
- `Pipeline`
- `Interactions`
- `Outreach`
- `Rounds`

Research source URLs may be exported.

---

## EXP-FND-07 — Investor Pipeline Export

Export:

- investor;
- round;
- stage;
- stage entered;
- stage age;
- source;
- committed amount;
- owner;
- next action.

---

## EXP-FND-08 — Investor Outreach Export

Export:

- investor;
- contact;
- round;
- outreach type;
- status;
- created;
- sent;
- response;
- meeting;
- next action.

Never export provider secrets.

---

## EXP-FND-09 — Data Room Metadata Export

Export metadata only:

- document name;
- category;
- status;
- sensitivity;
- round;
- uploaded;
- updated;
- version;
- superseded;
- share count;
- expiry;
- revoked state.

Do not export document bytes as part of CSV/Excel.

Do not export signed URLs.

---

## EXP-FND-10 — Due Diligence and Funding Analytics Export

### Due diligence

Export:

- request;
- investor;
- requester;
- owner;
- due date;
- status;
- evidence count;
- last update;
- round.

### Funding analytics

Workbook:

- `Funnel`
- `Source`
- `Pipeline Trend`
- `Round Progress`
- `Meetings`
- `Outreach`
- `Readiness`
- `Diligence`

Respect selected round and period.

---

# 26. CRM export stories

CRM is business-scoped and contains operational customer information.

## EXP-CRM-01 — CRM Dashboard Export

Export underlying dashboard KPIs and supporting report datasets.

Workbook:

- `KPIs`
- `Pipeline`
- `Lost Business`
- `Response`
- `Exceptions`

---

## EXP-CRM-02 — Leads Export

Route:

```text
/crm/leads
```

Fields:

- contact;
- source;
- created;
- owner;
- status;
- company;
- email where permitted;
- phone where permitted.

Respect existing CRM permissions.

---

## EXP-CRM-03 — Opportunities Export

Route:

```text
/crm/opportunities
```

Export both list and Kanban dataset.

Fields:

- contact/customer;
- stage;
- value;
- close date;
- owner;
- created;
- source;
- status.

---

## EXP-CRM-04 — CRM Analytics Export

Export the current analytics dataset.

Workbook:

- `Response Performance`
- `Discovery Funnel`
- `FSM Funnel`
- `Channel Performance`

---

## EXP-CRM-05 — Lost Business Export

Route:

```text
/crm/lost-business
```

Fields:

- age;
- contact;
- channel;
- message intent;
- opportunity value;
- owner;
- SLA;
- current resolution state.

Raw message content should be excluded by default from CSV unless explicitly configured by the page's existing permission model.

---

## EXP-CRM-06 — Reactivation Export

Export:

- customer;
- reactivation reason;
- last activity;
- opportunity indicator;
- recommended action;
- owner;
- status.

---

## EXP-CRM-07 — Follow-up Queue Export

Export current filtered queue:

- contact;
- source;
- channel;
- priority;
- due;
- owner;
- status;
- completion date.

---

## EXP-CRM-08 — Reviews Export

Export:

- source;
- reviewer;
- rating;
- review date;
- response state;
- response date;
- sentiment if already stored.

Do not invent sentiment during export.

---

## EXP-CRM-09 — Conversations / WhatsApp Export

Provide a controlled conversation export.

Workbook:

- `Conversation`
- `Messages`

Fields:

- timestamp;
- direction;
- channel;
- sender;
- recipient;
- message type;
- delivery status;
- message text where permitted.

Security:

- explicit permission;
- tenant check;
- no provider access tokens;
- no media signed URLs;
- redact secrets detected in message content if the existing policy requires it.

---

## EXP-CRM-10 — Customer 360 / Exceptions Export

### Customer 360

Export:

- customer;
- contacts;
- opportunities;
- follow-ups;
- products of interest;
- recent orders;
- recent jobs;
- payment aging;
- interactions;
- buying intent score.

Use multiple sheets.

### Exceptions

Export:

- exception;
- module;
- customer/job;
- severity;
- created;
- status;
- resolution;
- owner.

---

# 27. Inventory export stories

## EXP-INV-01 — Inventory Dashboard Export

Workbook:

- `Summary`
- `Stock`
- `Low Stock`
- `Sales`
- `Purchasing`

Respect selected warehouse and cost visibility.

---

## EXP-INV-02 — Products Export

Route:

```text
/inventory/products
```

Fields:

- SKU;
- name;
- brand;
- category;
- supplier;
- unit;
- HSN;
- tax rate;
- barcode;
- selling price;
- cost price only if permitted;
- reorder point;
- reorder quantity;
- active status.

---

## EXP-INV-03 — Customers Export

Export:

- customer;
- contact;
- GSTIN;
- location;
- active;
- outstanding where available and permitted.

---

## EXP-INV-04 — Suppliers Export

Export:

- supplier;
- contact;
- GSTIN;
- location;
- active;
- outstanding where available.

---

## EXP-INV-05 — Warehouses Export

Export:

- warehouse;
- address;
- contact;
- active;
- capacity if stored.

---

## EXP-INV-06 — Stock Export

Route:

```text
/inventory/stock
```

Fields:

- warehouse;
- SKU;
- product;
- quantity;
- reserved;
- available;
- reorder point;
- reorder status;
- last movement.

---

## EXP-INV-07 — Purchase Orders Export

Export:

- PO number;
- supplier;
- warehouse;
- status;
- order date;
- expected date;
- total;
- received;
- outstanding.

Optional second sheet:

`Purchase Order Lines`

---

## EXP-INV-08 — Sales Orders Export

Export:

- order number;
- customer;
- warehouse;
- status;
- order date;
- fulfilment status;
- total;
- payment status.

Optional line sheet.

---

## EXP-INV-09 — Sales Invoices and Returns Export

### Sales invoices

- invoice number;
- customer;
- date;
- due date;
- taxable amount;
- GST;
- total;
- payment status;
- source.

### Returns

- return number;
- sales order;
- customer;
- date;
- reason;
- status;
- total.

---

## EXP-INV-10 — Stock Transfers Export

Export:

- transfer number;
- source warehouse;
- destination warehouse;
- status;
- requested;
- shipped;
- received;
- dates.

---

## EXP-INV-11 — Alerts Export

Export:

- alert type;
- product;
- warehouse;
- severity;
- created;
- status;
- resolved;
- resolution.

---

## EXP-INV-12 — Inventory Audit Log Export

Respect current filters:

- entity type;
- actor;
- date from;
- date to.

Export:

- timestamp;
- actor;
- entity;
- action;
- entity ID;
- summary.

Never export secrets contained in arbitrary audit metadata.

---

# 28. Service / FSM export stories

## EXP-FSM-01 — FSM Dashboard Export

Workbook:

- `Summary`
- `Jobs`
- `Revenue`
- `Technician`
- `Schedule`

---

## EXP-FSM-02 — Customers Export

Export:

- customer;
- contacts;
- address;
- service history count;
- open jobs;
- outstanding balance where permitted.

---

## EXP-FSM-03 — Jobs Export

Fields:

- job number;
- customer;
- service type;
- status;
- technician;
- scheduled date;
- completion date;
- value;
- source;
- priority.

---

## EXP-FSM-04 — Opportunities Export

Fields:

- opportunity;
- customer;
- service type;
- status;
- value;
- source;
- owner;
- created;
- expected close.

---

## EXP-FSM-05 — Invoices Export

Fields:

- invoice number;
- customer;
- job;
- invoice date;
- due date;
- subtotal;
- tax;
- total;
- payment status.

---

## EXP-FSM-06 — Schedule Export

Export the currently selected date/range.

Fields:

- event;
- job;
- customer;
- technician;
- start;
- end;
- status;
- location.

Excel is preferred for schedule exports.

---

## EXP-FSM-07 — My Day Export

Export the technician's current day:

- job;
- customer;
- location;
- scheduled time;
- arrival;
- completion;
- status;
- time entry.

Do not export unrelated technicians' data.

---

## EXP-FSM-08 — FSM Reports Export

This is a high-value multi-sheet export.

Current reports include:

- jobs completed;
- revenue by service;
- revenue by tag;
- revenue by charge type;
- revenue by marketing source;
- customer balances;
- account aging;
- payments;
- timecards;
- productivity.

Create one workbook with:

```text
Summary
Jobs Completed
Revenue by Service
Revenue by Tag
Revenue by Charge Type
Revenue by Marketing Source
Customer Balances
Account Aging
Payments
Timecards
Productivity
```

Date range must match the report selector.

---

## EXP-FSM-09 — Assessment Export

For assessment detail/list data where structured rows are present, export:

- assessment;
- customer;
- technician;
- date;
- outcome;
- notes;
- follow-up state.

Do not export binary attachments as part of the workbook.

---

# 29. Finance export stories

Finance is the most audit-sensitive area. All exports must use Finance permissions and existing accounting queries.

## EXP-FIN-01 — Finance Dashboard Export

Workbook:

- `Summary`
- `Receivables`
- `Payables`
- `Cash`
- `GST`
- `Exceptions`

---

## EXP-FIN-02 — Chart of Accounts Export

Export:

- account code;
- account name;
- type;
- role;
- parent;
- active;
- opening balance where available.

---

## EXP-FIN-03 — Bills and Expenses Export

### Bills

- document number;
- supplier;
- date;
- due date;
- taxable;
- GST;
- total;
- payment state;
- posting state.

### Expenses

Same where applicable.

---

## EXP-FIN-04 — Payables Export

Export:

- supplier;
- document;
- due date;
- outstanding;
- aging bucket;
- status.

---

## EXP-FIN-05 — Receivables Export

Export:

- customer;
- invoice/document;
- due date;
- outstanding;
- aging;
- status.

---

## EXP-FIN-06 — Journal Export

Export:

- journal number;
- date;
- period;
- source;
- reference;
- account;
- debit;
- credit;
- description;
- posting status.

Excel should include a line-level sheet.

---

## EXP-FIN-07 — GST Ledger Export

Workbook:

- `GST Summary`
- `Sales Register`
- `Purchase Register`
- `ITC`
- `Reconciliation`

Respect selected period.

---

## EXP-FIN-08 — Bank / Reconciliation Export

Export:

- bank account;
- transaction date;
- value date;
- description;
- reference;
- debit;
- credit;
- balance;
- reconciliation state;
- matched document.

Do not export bank credentials.

---

## EXP-FIN-09 — Recurring Entries Export

Export:

- recurring entry;
- frequency;
- next run;
- account;
- amount;
- active;
- last run;
- source.

---

## EXP-FIN-10 — Budget vs Actual Export

Workbook:

- `Summary`
- `Budget`
- `Actual`
- `Variance`

Respect fiscal year and selected period.

---

## EXP-FIN-11 — Financial Statements Export

Route:

```text
/finance/reports
```

Current report:

- Profit & Loss;
- Balance Sheet;
- Trial Balance.

Each should support CSV.

Excel should support a workbook containing:

```text
Profit & Loss
Balance Sheet
Trial Balance
```

with the selected `from` and `to` period.

---

## EXP-FIN-12 — Filing Export

Export structured filing data:

- sales register;
- purchase register;
- filing summary;
- period;
- GSTIN;
- tax components.

Do not expose authentication credentials.

---

## EXP-FIN-13 — Filing Readiness Export

Export:

- readiness category;
- check;
- status;
- amount;
- exception;
- missing evidence;
- related document;
- period.

---

## EXP-FIN-14 — E-invoice / E-way Bill Export

Where actual transaction lists exist, export:

- document number;
- date;
- status;
- IRN/reference;
- error state;
- response date.

Never export credentials.

---

## EXP-FIN-15 — Finance Exceptions Export

Export:

- exception;
- category;
- severity;
- source;
- document;
- period;
- status;
- resolution;
- created;
- updated.

---

## EXP-FIN-16 — Finance Evidence Export

Export metadata only:

- evidence;
- category;
- period;
- related document;
- uploaded;
- status;
- owner.

Do not expose signed attachment URLs.

---

## EXP-FIN-17 — Audit / Backfill / Activation Export

For operational/audit pages:

### Audit

Export filtered audit records.

### Backfill

Export:

- run;
- period;
- records examined;
- records changed;
- status;
- errors.

### Activation

Export activation/readiness state and checklist metadata.

Never export credentials or secrets.

---

# 30. Platform administration export opportunities

These exports are useful for platform operators but require stricter controls.

## EXP-ADMIN-01 — Platform Audit Export

Route:

```text
/platform/audit
```

Export filtered audit records.

Fields:

- timestamp;
- actor;
- action;
- target;
- result;
- risk level.

Never export secret values.

---

## EXP-ADMIN-02 — AI Usage Export

Route:

```text
/platform/ai-usage
```

Export:

- provider;
- model;
- operation;
- tenant/business where permitted;
- request count;
- token usage;
- cost;
- status;
- period.

Do not export prompts containing tenant data.

---

## EXP-ADMIN-03 — Integrations Export

Export integration registry metadata:

- integration;
- category;
- status;
- enabled;
- last health check;
- failure state.

Never export credentials.

---

## EXP-ADMIN-04 — Plans / Entitlements Export

Export:

- plan;
- active;
- visible;
- module;
- entitlement;
- limits;
- version.

No payment-provider secrets.

---

## EXP-ADMIN-05 — Compliance Registry Export

Export:

- country;
- compliance pack;
- version;
- availability;
- feature flags;
- effective date.

---

## EXP-ADMIN-06 — Config History Export

Export:

- configuration;
- version;
- status;
- created;
- published;
- published by;
- rollback state.

Exclude secret values.

---

## EXP-ADMIN-07 — Announcements / Feature Flags / Notification Policies Export

Export configuration metadata.

Do not export:

- credentials;
- webhook secrets;
- encrypted provider configuration;
- API keys.

---

# 31. Areas intentionally excluded

Do not add CSV/Excel export to pages where it has little practical value or creates unnecessary risk.

Examples:

- login;
- signup;
- forgot password;
- reset password;
- MFA;
- branding preview;
- individual API-key value pages;
- credential configuration forms;
- e-invoice credential forms;
- e-way bill credential forms;
- static Terms;
- Privacy;
- Pricing;
- Help pages;
- single document binary download controls.

A page may still receive an export later if its underlying data becomes a structured report.

---

# 32. Detail-page export rule

Do not put an `Export` button on every detail page by default.

A detail page should get export only when it represents a meaningful structured bundle.

Good examples:

- Customer 360;
- Investor detail;
- Prospect detail;
- Campaign detail;
- Financial report;
- Funding dashboard.

Bad examples:

- simple settings form;
- individual invoice detail where the existing invoice/PDF document is the canonical output;
- individual API credential page.

---

# 33. Multi-sheet workbook standard

Whenever a page contains multiple logically independent datasets, Excel should use multiple sheets.

Example:

```text
Funding Dashboard.xlsx

Summary
Round
Investor Funnel
Readiness
Diligence
Attention
```

CSV remains a single table.

The UI should therefore offer:

```text
CSV — current table
Excel — full workbook
```

when a workbook is materially richer than a single table.

---

# 34. Export adapters

Each module should implement small export adapters.

Suggested locations:

```text
packages/module-discovery/src/exports/
packages/module-crm/src/exports/
packages/module-inventory/src/exports/
packages/module-fsm/src/exports/
packages/module-gst/src/exports/
```

Do not place module-specific database queries inside `packages/core`.

Core owns:

- serialization;
- UI;
- security helpers;
- audit helper;
- file response;
- large-export infrastructure.

Modules own:

- dataset retrieval;
- column definitions;
- business-specific formatting;
- permission requirements;
- filter translation.

---

# 35. Example adapter shape

```ts
export async function exportCrmLeads(
  context: ExportContext,
  filters: LeadFilters,
): Promise<ExportDefinition<LeadExportRow>> {
  const businessId = await requireBusinessFromContext(context);

  await requireModule("crm");
  await requirePermission(businessId, "crm.leads.read");

  const rows = await listLeadsForExport(businessId, filters);

  return {
    filename: `wonderark_crm_leads_${today()}`,
    sheetName: "Leads",
    columns: [...],
    rows,
  };
}
```

The client must never supply the final authorization decision.

---

# 36. Query design

Do not fetch a UI page and scrape rendered rows.

Each export should use a server-side query designed for export.

However, avoid duplicating business logic.

Preferred pattern:

```text
existing query
      ↓
shared query/filter logic
      ↓
UI projection
      ↓
export projection
```

If the existing query already returns the correct complete dataset, reuse it.

If it is UI-limited, create:

```text
listXForExport()
```

using the same underlying predicates.

---

# 37. Pagination

UI pagination must not constrain "All matching records".

For large datasets:

```text
query in deterministic chunks
→ serialize incrementally
→ produce file
```

Use stable ordering:

```text
created_at ASC/DESC
id ASC
```

to avoid duplicates or missing rows during chunking.

---

# 38. Filtering

Every export story must explicitly test:

- no filters;
- one filter;
- multiple filters;
- empty result;
- date range;
- status;
- owner;
- module-specific selector;
- business/tenant boundary.

---

# 39. Empty exports

If zero rows match:

Allow the export and generate a valid file containing:

- headers;
- optional metadata.

Do not generate a fake row.

Filename remains valid.

---

# 40. Date handling

Use ISO-like values in CSV where machine ingestion matters:

```text
2026-09-26
2026-09-26T10:30:00+05:30
```

Excel should use actual date/datetime cell types.

Use the business/user timezone already used by the relevant module.

Do not silently convert local business dates to UTC dates that change the displayed calendar day.

---

# 41. Currency handling

For CSV:

Prefer:

```text
amount = 125000
currency = INR
```

rather than:

```text
₹1,25,000
```

For Excel:

Use numeric amount plus currency-aware formatting where the report has a single currency.

If mixed currencies are possible, include an explicit `currency` column.

---

# 42. Percentage handling

Excel should use numeric percentage values with percentage formatting.

Example:

```text
0.25
```

displayed as:

```text
25.00%
```

CSV should contain:

```text
0.25
```

or a clearly documented `25%` representation according to the existing report semantics.

Use one convention consistently.

---

# 43. Exported labels

Where the UI shows a human-readable label from an enum, export the human-readable label.

Example:

```text
qualified
```

becomes:

```text
Qualified
```

If machine consumers need stable enum values, add a second column only where useful:

```text
Status
Status Code
```

Do not make every export unnecessarily verbose.

---

# 44. AI-derived values

Exports must preserve provenance.

For example:

```text
Investor Fit = 82
Fit Provenance = AI inferred
```

rather than silently presenting an AI score as a factual measurement.

Similarly:

```text
Recommendation
Recommendation Source
```

where useful.

---

# 45. Cross-module data

If an export includes data from another module:

- read it through an approved contract or core shared entity;
- respect that module's licensing/degraded mode;
- never bypass licensing;
- clearly label unavailable data.

Example:

Funding may include Finance-derived revenue.

If Finance is not licensed:

```text
Revenue = —
Revenue Source = Finance unavailable
```

Do not silently use stale or guessed numbers.

---

# 46. Existing Discovery Marketing metrics

Marketing currently follows a strong data-integrity rule:

> reported values remain reported; missing values are not invented as zero.

Exports must preserve this.

For example:

```text
Spend = blank
```

must remain blank if spend was not reported.

Do not convert blank to zero merely because Excel prefers numbers.

---

# 47. Existing Funding provenance

Funding has multiple provenance types.

Export the provenance alongside sensitive derived values:

- user-entered;
- Finance-derived;
- AI-inferred;
- researched;
- imported.

Do not collapse these into one "verified" state.

---

# 48. Audit requirements

Test that export itself is audited.

Examples:

```text
CRM leads CSV generated
Finance P&L XLSX generated
Funding investor export failed
Inventory products export generated
```

Audit failures should not contain the full generated file or raw data.

---

# 49. Tenant-isolation tests

For every module export adapter:

1. create tenant A data;
2. create tenant B data;
3. export from A;
4. assert no B records exist;
5. export from B;
6. assert no A records exist.

For Discovery:

test workspace isolation according to its existing Discovery tenancy model.

---

# 50. License tests

For each licensed module:

- licensed user can export;
- unlicensed user cannot export;
- cancelled/grace-period behavior follows existing license rules;
- `MODULE_NOT_LICENSED` remains a normal degraded result where applicable.

---

# 51. RBAC tests

At minimum test:

- read permission allows export;
- missing read permission denies export;
- cost-restricted Inventory user cannot export cost fields;
- Finance restricted user cannot export restricted financial datasets;
- platform non-admin cannot access platform exports.

---

# 52. Formula-injection tests

Test:

```text
=SUM(A1:A2)
+cmd
@malicious
```

and ordinary negative numbers:

```text
-100
```

The sanitizer must not corrupt legitimate numeric values.

---

# 53. Export E2E tests

Create one reusable E2E helper:

```text
exportData(page, format, scope)
```

Test representative flows:

### Discovery

- Offering prospects CSV;
- Marketing campaign Excel;
- Funding investors CSV.

### CRM

- Leads CSV;
- Opportunities Excel.

### Inventory

- Products Excel;
- Stock CSV.

### FSM

- Jobs CSV;
- Reports Excel.

### Finance

- P&L Excel;
- Journal CSV.

---

# 54. File-content assertions

Do not only assert that a download occurred.

Validate:

- filename;
- extension;
- MIME type;
- header names;
- row count;
- representative values;
- filters;
- absence of other tenant records.

For XLSX, open the workbook with ExcelJS in the test and inspect worksheet names/cells.

---

# 55. Regression tests

Existing import functionality must remain unaffected.

Specifically:

- Discovery prospect CSV import;
- Inventory product CSV import;
- Marketing CSV metric import;
- Funding data-room file upload;
- existing PDF generation;
- existing secure attachment downloads.

Export implementation must not modify their parsers.

---

# 56. Performance tests

Test:

- 100 rows;
- 1,000 rows;
- 10,000 rows;
- threshold behavior.

Measure:

- query time;
- serialization time;
- memory;
- download response.

Large exports should move to background jobs before request timeouts become likely.

---

# 57. Accessibility

The export control must:

- have accessible name;
- work with keyboard;
- expose menu state;
- expose loading state;
- not rely on hover;
- maintain focus;
- work with screen readers.

---

# 58. Design rules

The export feature must follow:

```text
docs/design/claude-ui-design-rules.md
```

Do not create:

- custom gradient export buttons;
- module-specific colors;
- oversized controls;
- different export iconography;
- different menu layouts.

Export should visually feel like a native WonderArk platform feature.

---

# 59. Suggested implementation sequence

## Phase 1 — Infrastructure

1. EXP-PLAT-01
2. EXP-PLAT-02
3. EXP-PLAT-03
4. EXP-PLAT-04
5. EXP-PLAT-05
6. EXP-PLAT-06

## Phase 2 — Discovery

1. EXP-DISC-01
2. EXP-DISC-03
3. EXP-DISC-05
4. EXP-DISC-06
5. EXP-DISC-07
6. EXP-DISC-08
7. EXP-DISC-09
8. EXP-DISC-10
9. EXP-DISC-11
10. EXP-DISC-12
11. EXP-DISC-02

## Phase 3 — Marketing

1. EXP-MKT-03
2. EXP-MKT-04
3. EXP-MKT-05
4. EXP-MKT-06
5. EXP-MKT-07
6. EXP-MKT-01
7. EXP-MKT-02

## Phase 4 — Funding

1. EXP-FND-05
2. EXP-FND-06
3. EXP-FND-07
4. EXP-FND-08
5. EXP-FND-03
6. EXP-FND-04
7. EXP-FND-09
8. EXP-FND-10
9. EXP-FND-02
10. EXP-FND-01

## Phase 5 — CRM

Implement list exports first, then analytics/detail bundles.

## Phase 6 — Inventory

Implement master data and transaction exports first, then dashboard/audit exports.

## Phase 7 — FSM

Implement operational lists, then Reports workbook.

## Phase 8 — Finance

Implement accounting lists and statements, followed by compliance exports.

## Phase 9 — Platform administration

Implement only after customer-module exports are stable.

---

# 60. Claude Code execution instructions

Claude Code must implement this specification directly.

Before every story:

1. fetch latest `main`;
2. inspect the current files;
3. verify route and query names;
4. inspect current RLS;
5. inspect existing permission checks;
6. inspect existing UI patterns;
7. reuse existing query logic;
8. do not refactor unrelated code.

For every story:

1. cite the story ID in implementation code/tests;
2. implement server-side authorization;
3. add focused tests;
4. add tenant-isolation tests;
5. add license-gating tests where applicable;
6. add export-content tests;
7. add E2E coverage where the story is user-facing;
8. run typecheck;
9. run lint;
10. run boundary lint;
11. run migration checks if migrations are added;
12. run relevant module tests;
13. run the full test suite;
14. regenerate progress tracker;
15. commit the story;
16. push/merge according to the repository's existing workflow.

Do not ask for routine clarification.

---

# 61. Implementation anti-patterns

Do not:

### A. Build export separately in every page

Bad:

```text
page A → custom CSV code
page B → custom XLSX code
page C → custom download code
```

Use shared infrastructure.

### B. Export rendered DOM

Never scrape HTML tables.

### C. Trust client filters for authorization

Filters are selection criteria, not authorization.

### D. Export only visible pagination

"Export all" must query all matching records.

### E. Put secrets in files

Never.

### F. Use service-role credentials in the browser

Never.

### G. Duplicate module master data

Use canonical entities.

### H. Change existing Discovery architecture

Export is additive.

---

# 62. Definition of done

The export feature is complete only when:

- every selected exportable area has an Export control;
- CSV and Excel work where specified;
- current filters are preserved;
- all matching records are available;
- large datasets do not timeout;
- tenant isolation is proven;
- RBAC is proven;
- license gating is proven;
- sensitive fields are excluded;
- formula injection is prevented;
- exports are audited;
- filenames are consistent;
- dates/numbers/currency are correct;
- mobile UI works;
- existing workflows are unchanged;
- all tests pass;
- no existing import/download functionality regresses.

---

# 63. Final implementation principle

The product should feel as though CSV/Excel export was designed into WonderArk from the beginning.

The user should learn one interaction:

```text
Export ▼
  CSV
  Excel (.xlsx)
```

and that interaction should behave consistently in Discovery, Marketing, Funding, CRM, Inventory, Service and Finance.

The implementation should therefore optimize for:

**one UX → one export contract → one serializer layer → module-specific adapters → server-side authorization → auditable output.**

That is the architecture to implement.
