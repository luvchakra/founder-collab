// EXP-MKT-06 -- Marketing assets export (/discovery/marketing/assets).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { ASSET_TYPE_LABEL } from "../../lib/marketing/types";
import { listAssetsForExport, listNamesForExport, type AssetExportRow } from "./queries";

/**
 * The asset library as metadata only (data-exports.md rule 5): what each file is, what it
 * is linked to, its type and size. The page mints short-lived signed links to preview
 * files; an export never does -- the export query does not even read the storage path,
 * so neither a link nor a path can end up in the file.
 */
export const marketingAssetsExport: ExportAdapter<Record<string, never>> = {
  id: "marketing.assets",
  module: "discovery",
  permissions: ["marketing.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [assets, campaigns, offerings] = await Promise.all([
      listAssetsForExport(context.businessId),
      listNamesForExport(context.businessId, "marketing_campaigns"),
      listNamesForExport(context.businessId, "products"),
    ]);
    const columns: ExportColumn<AssetExportRow>[] = [
      { key: "asset", header: "Asset", getValue: (a) => a.name },
      { key: "type", header: "Type", getValue: (a) => ASSET_TYPE_LABEL[a.assetType] ?? a.assetType },
      { key: "campaign", header: "Campaign", getValue: (a) => (a.campaignId ? (campaigns.get(a.campaignId) ?? null) : null) },
      { key: "offering", header: "Offering", getValue: (a) => (a.offeringId ? (offerings.get(a.offeringId) ?? null) : null) },
      { key: "file", header: "File name", getValue: (a) => a.fileName },
      { key: "size", header: "File size (bytes)", type: "integer", getValue: (a) => a.sizeBytes },
      { key: "mime", header: "MIME type", getValue: (a) => a.contentType },
      { key: "alt", header: "Alt text", getValue: (a) => a.altText },
      { key: "description", header: "Description", getValue: (a) => a.description },
      { key: "created", header: "Created", type: "datetime", getValue: (a) => a.createdAt },
      { key: "status", header: "Status", getValue: (a) => (a.status === "active" ? "Active" : a.status) },
    ];
    return {
      module: "discovery",
      resource: "marketing-assets",
      title: "Marketing assets",
      sheets: [{ sheetName: "Assets", columns, rows: assets }],
    };
  },
};
