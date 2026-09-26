# Data exports (CSV / Excel) — how to add one

The spec is `docs/plan/13-DATA-EXPORT-BACKLOG.md`. This page is the working guide: what
already exists, and the exact shape every new export follows so that every module's
Export button behaves the same.

**One UX → one contract → one serializer layer → module adapters → server-side
authorization → audited output.**

## What exists (EXP-PLAT-01..06)

| Piece | Where |
|---|---|
| Contract: `ExportColumn`, `ExportSheet`, `ExportWorkbookDefinition`, `ExportFormat`, `ExportScope` | `packages/core/src/exports/types.ts` (`@cofounderai/core/exports/types`) |
| Value rules, formula-injection guard, business-timezone dates | `packages/core/src/exports/format.ts` |
| CSV writer (BOM, RFC 4180) / Excel writer (ExcelJS, typed cells, frozen+filtered header, "Export info" sheet) | `csv.ts`, `xlsx.ts`, `render.ts` |
| Filename `wonderark_<module>_<resource>_<yyyy-mm-dd>.<ext>` | `filename.ts` |
| Paging past PostgREST's 1,000-row cap | `fetch-all.ts` → `fetchAllRows((from, to) => query.range(from, to))` |
| Secure runner: session → business (slug, RLS) → licence (read) → permissions → load → render → audit | `server.ts` → `runBusinessExport`, `ExportAdapter`, `ExportDeniedError` |
| Platform-admin runner (superadmin, audited in `platform.audit_log`) | `platform.ts` → `runPlatformExport`, `PlatformExportAdapter` |
| Large exports (> 25,000 rows) as jobs, private `exports` bucket, bell alert, 7-day expiry | `jobs.ts`, `apps/web/lib/exports/large-export.ts`, `apps/web/app/api/exports/jobs/[jobId]/download/route.ts`, `apps/web/app/api/cron/expire-exports/route.ts` |
| The Export button/menu | `packages/core/src/components/exports/export-menu.tsx` (`@cofounderai/core/export-ui/export-menu`) |
| Download endpoint | `apps/web/app/api/exports/[exportId]/route.ts` |
| Registry (id → adapter) | `apps/web/lib/exports/registry.ts`, fed by each module's `src/exports/index.ts` |

## Adding an export

### 1. The adapter — in the module that owns the data

`packages/module-<key>/src/exports/<resource>.ts` (Discovery: `src/exports/<area>/…` where
area is `customer-acquisition`, `marketing` or `funding`). Add it to that folder's
`index.ts` list. Nothing else needs registering.

```ts
// EXP-CRM-02 -- CRM leads export.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listLeads, LEAD_STATUS_LABEL } from "../lib/leads/queries";

type Filters = { status: string; owner: string };

export const crmLeadsExport: ExportAdapter<Filters> = {
  id: "crm.leads",                 // <module>.<resource> -- what the button asks for
  module: "crm",                   // licence key; null only for business-level data
  permissions: ["crm.view"],       // the page's own read permission(s)
  parseFilters: (params) => ({     // whitelist: only the filters the page itself supports
    status: params.get("status") ?? "",
    owner: params.get("owner") ?? "",
  }),
  describeFilters: (f) => ({ Status: f.status ? LEAD_STATUS_LABEL[f.status] ?? f.status : "" }),
  async load(context, filters) {
    // context.businessId is resolved server-side from the slug -- NEVER take a business,
    // workspace or tenant id from `filters` or any request parameter.
    const leads = await listLeads(context.businessId, filters);
    return {
      module: "crm",
      resource: "leads",
      title: "CRM leads",
      sheets: [{
        sheetName: "Leads",
        columns: [
          { key: "contact", header: "Contact", getValue: (l) => l.contactName },
          { key: "status", header: "Status", getValue: (l) => LEAD_STATUS_LABEL[l.status] ?? l.status },
          { key: "value", header: "Value", type: "currency", getValue: (l) => l.value },
          { key: "currency", header: "Currency", getValue: (l) => l.currency },
          { key: "created", header: "Created", type: "datetime", getValue: (l) => l.createdAt },
        ],
        rows: leads,
      }],
    };
  },
};
```

Rules — every one of these is a review blocker:

1. **Reuse the page's own query.** Call the same function the page calls, with the same
   filters. If that function is capped (a `.limit(…)`, a hard page size, or PostgREST's
   default 1,000 rows for an unbounded select that can realistically exceed it), add a
   `listXForExport()` next to it that applies **the same predicates** and pages with
   `fetchAllRows`, ordered by a stable key ending in `id`. Never scrape a rendered page.
   Existing Discovery queries are protected: wrap, don't modify.
2. **Tenant comes from `context`, never from the request.** `context.businessId`
   (and, for Discovery offering pages, a product/workspace that you re-verify belongs to
   `context.businessId`, exactly as the page does — otherwise throw
   `new ExportDeniedError("…", 404)`).
3. **Scope.** `context.scope === "view"` means exactly what the page shows — including its
   current page when the page paginates. `"all"` means the same filters, no pagination
   limit. For an unpaginated page they are the same; don't pass `paginated` to the button.
4. **Permissions.** Put the page's read permission in `permissions`. Extra restrictions
   are checked inside `load` with `hasPermission(context.businessId, key)`:
   Inventory cost columns (cost price, margin, landed/supplier cost) only with
   `inventory.view_cost` — drop the columns, don't blank them.
5. **Never export** secrets, credentials, API keys, tokens, signed URLs, encryption
   material, provider configuration, or document/file bytes. Data-room and evidence
   exports are metadata only.
6. **Labels, not codes.** Use the page's own label maps for enums (`Qualified`, not
   `qualified`). Add a `… code` column only where machines genuinely need it.
7. **Types.** Money: `type: "currency"` plus a separate `Currency` column when rows can
   differ; set `currency: "INR"` on the column only when every row is INR. Percentages
   are fractions with `type: "percent"`. Dates: `"date"` for calendar dates
   (`YYYY-MM-DD` stays that day), `"datetime"` for instants. Counts: `"integer"`.
8. **Blank is not zero.** An unreported figure stays `null` (Marketing metrics, Funding
   amounts). Never `?? 0` in a `getValue`.
9. **Provenance.** Where the product records one (AI-inferred vs source-backed vs
   user-entered vs finance-derived), export it in its own column next to the value.
   Cross-module data comes only through the other module's `contract/index.ts`; if that
   returns `MODULE_NOT_LICENSED`, write blank plus a "… source" column saying so.
10. **Workbooks.** One sheet per logically independent dataset; name the main table's
    sheet in `csvSheet` if it isn't the first. Dashboards export their underlying
    numbers, never a picture.
11. **Cite the story id** (`EXP-CRM-02`) in the adapter and its test.

### 2. The button — in the page header

```tsx
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

<PageHeader
  title="Leads"
  actions={<>
    <ExportMenu exportId="crm.leads" businessSlug={businessSlug} params={searchParams} />
    {/* the page's existing primary action stays last */}
  </>}
/>
```

- Place it left of the primary action (`[Export ▼] [Secondary] [Primary]`).
- Pass the page's own `searchParams` object as `params` — the adapter's `parseFilters`
  decides which of them matter.
- `paginated` only when the page paginates; `kind="report"` for reports (CSV = main
  table, Excel = full workbook), `kind="dashboard"` for dashboards.
- Pages with a hand-written `<h1>` header: wrap it in
  `<div className="flex flex-wrap items-start justify-between gap-3">` with the title
  block on the left and `<div className="flex shrink-0 items-center gap-2">` holding the
  Export menu and any existing actions on the right. Don't restyle anything else.

### 3. The test — next to the adapter

`<resource>.test.ts`, mocking the query module with `vi.mock`, asserting at least:

- `id`, `module` and `permissions` (licence and permission gating are enforced by
  `runBusinessExport`, tested once in `packages/core/src/exports/server.test.ts`);
- the query is called with `context.businessId` — even when the request's params carry a
  different `businessId`/`workspaceId` (tenant isolation);
- filters from `parseFilters` reach the query, and unknown params are ignored;
- headers of every sheet, one representative row (labels, not codes), blank stays blank;
- sensitive fields are absent (search the serialized rows for them);
- for cost-gated or scope-dependent exports, both branches.

Render the workbook through `renderExport` from `@cofounderai/core/exports/render` when
you want to assert on actual CSV/XLSX output.
