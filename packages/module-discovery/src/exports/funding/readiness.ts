// EXP-FND-03 -- Investor readiness export (/discovery/funding/readiness).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listReadinessItems } from "../../lib/funding/queries";
import { READINESS_CATEGORY_LABEL, READINESS_STATUS_LABEL, type ReadinessItem } from "../../lib/funding/types";

/**
 * The readiness checklist, item by item. Two provenance columns keep the record honest
 * (§44, EXP-FND-03 "do not convert AI recommendations into factual readiness claims"):
 * the status is only ever what a person marked -- the platform never declares an item
 * Ready -- and the recommended action is text a person entered on the item, labelled as
 * such rather than presented as a finding. Evidence is exported as the notes and links
 * recorded on the item; no document content.
 */
export const fundingReadinessExport: ExportAdapter<Record<string, never>> = {
  id: "funding.readiness",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: () => ({}),
  async load(context) {
    const items = await listReadinessItems(context.businessId);
    const today = new Date().toISOString().slice(0, 10);
    const columns: ExportColumn<ReadinessItem>[] = [
      { key: "category", header: "Category", getValue: (i) => READINESS_CATEGORY_LABEL[i.category] ?? i.category },
      { key: "requirement", header: "Requirement", getValue: (i) => i.title },
      { key: "description", header: "Description", getValue: (i) => i.description },
      { key: "status", header: "Status", getValue: (i) => READINESS_STATUS_LABEL[i.status] ?? i.status },
      { key: "statusSource", header: "Status set by", getValue: () => "A person (never set automatically)" },
      {
        key: "evidence",
        header: "Evidence",
        getValue: (i) => i.evidence.map((e) => [e.note, e.url].filter(Boolean).join(" — ")).filter(Boolean),
      },
      { key: "evidenceCount", header: "Evidence items", type: "integer", getValue: (i) => i.evidence.length },
      { key: "missing", header: "Missing information", getValue: (i) => i.missingInformation },
      { key: "recommendation", header: "Recommended action", getValue: (i) => i.recommendedAction },
      { key: "recommendationSource", header: "Recommendation source", getValue: (i) => (i.recommendedAction ? "User-entered" : null) },
      { key: "due", header: "Due", type: "date", getValue: (i) => i.dueAt },
      {
        key: "overdue",
        header: "Overdue",
        type: "boolean",
        getValue: (i) => i.status !== "ready" && i.status !== "not_applicable" && i.dueAt !== null && i.dueAt < today,
      },
      { key: "reviewed", header: "Last reviewed", type: "datetime", getValue: (i) => i.lastReviewedAt },
      { key: "updated", header: "Last updated", type: "datetime", getValue: (i) => i.updatedAt },
    ];
    return {
      module: "discovery",
      resource: "funding-readiness",
      title: "Investor readiness",
      sheets: [{ sheetName: "Readiness", columns, rows: items }],
    };
  },
};
