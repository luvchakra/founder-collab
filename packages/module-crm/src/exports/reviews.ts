// EXP-CRM-08 -- Reviews export (/crm/reviews).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ReviewItem } from "../lib/reviews/types";
import { CHANNEL_LABEL, REVIEW_STATUS_LABEL, labelOf } from "./labels";
import { listReviewItemsForExport } from "./queries";

/**
 * Every review the page lists. `crm.review_item` stores no sentiment and no reply
 * timestamp, so the export has neither column -- a sentiment is never inferred here.
 * Unpublished AI reply drafts are internal working text and are not exported.
 */
export const crmReviewsExport: ExportAdapter<Record<string, never>> = {
  id: "crm.reviews",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: () => ({}),
  async load(context) {
    const reviews = await listReviewItemsForExport(context.businessId);
    return {
      module: "crm",
      resource: "reviews",
      title: "CRM reviews",
      sheets: [
        {
          sheetName: "Reviews",
          columns: [
            { key: "source", header: "Source", getValue: (r: ReviewItem) => labelOf(CHANNEL_LABEL, r.provider) },
            { key: "reviewer", header: "Reviewer", getValue: (r: ReviewItem) => r.reviewer_name ?? "Anonymous" },
            { key: "rating", header: "Rating", type: "integer", getValue: (r: ReviewItem) => r.rating },
            { key: "date", header: "Review date", type: "datetime", getValue: (r: ReviewItem) => r.occurred_at },
            { key: "comment", header: "Review", getValue: (r: ReviewItem) => r.comment_excerpt ?? "" },
            { key: "response_state", header: "Response state", getValue: (r: ReviewItem) => labelOf(REVIEW_STATUS_LABEL, r.status) },
          ],
          rows: reviews,
        },
      ],
    };
  },
};
