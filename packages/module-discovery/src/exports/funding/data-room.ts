// EXP-FND-09 -- Data room metadata export (/discovery/funding/data-room).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { listRounds, listShares } from "../../lib/funding/queries";
import { DATA_ROOM_CATEGORY_LABEL, DATA_ROOM_STATUS_LABEL, SENSITIVITY_LABEL, type DataRoomShare } from "../../lib/funding/types";
import { listDataRoomItemsForExport, type DataRoomExportRow } from "./queries";

type DocumentRow = DataRoomExportRow & {
  supersededBy: string | null;
  shareCount: number;
  activeShares: number;
  revokedShares: number;
  latestShareExpiry: string | null;
};

type ShareRow = DataRoomShare & { documentName: string | null; documentVersion: number | null };

function shareState(s: DataRoomShare, now: number): string {
  if (s.revokedAt) return "Revoked";
  return new Date(s.expiresAt).getTime() > now ? "Active" : "Expired";
}

/**
 * The data room index -- METADATA ONLY (§18, rule 5): every document version (current
 * and superseded) with its category, status, sensitivity, round, file facts and share
 * counts, and every share link's recipient, permission, expiry, revoked state and access
 * count. Never a document's bytes, never a signed URL, never a storage path (the export
 * query does not select one), and never a share link's token or URL (`listShares` does
 * not select them either).
 */
export const fundingDataRoomExport: ExportAdapter<Record<string, never>> = {
  id: "funding.data-room",
  module: "discovery",
  permissions: ["funding.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [items, shares, rounds] = await Promise.all([
      listDataRoomItemsForExport(context.businessId),
      listShares(context.businessId),
      listRounds(context.businessId),
    ]);
    const now = Date.now();
    const roundName = new Map(rounds.map((r) => [r.id, r.name]));
    const byId = new Map(items.map((i) => [i.id, i]));
    const supersededBy = new Map<string, string>();
    for (const i of items) if (i.supersedesId) supersededBy.set(i.supersedesId, i.id);

    const documents: DocumentRow[] = items.map((item) => {
      const own = shares.filter((s) => s.dataRoomItemId === item.id);
      const next = supersededBy.get(item.id);
      return {
        ...item,
        supersededBy: next ? `v${byId.get(next)?.version ?? "?"}` : null,
        shareCount: own.length,
        activeShares: own.filter((s) => shareState(s, now) === "Active").length,
        revokedShares: own.filter((s) => s.revokedAt).length,
        latestShareExpiry: own.map((s) => s.expiresAt).sort().at(-1) ?? null,
      };
    });
    const shareRows: ShareRow[] = shares.map((s) => ({
      ...s,
      documentName: byId.get(s.dataRoomItemId)?.name ?? null,
      documentVersion: byId.get(s.dataRoomItemId)?.version ?? null,
    }));

    const documentColumns: ExportColumn<DocumentRow>[] = [
      { key: "name", header: "Document", getValue: (d) => d.name },
      { key: "category", header: "Category", getValue: (d) => DATA_ROOM_CATEGORY_LABEL[d.category] ?? d.category },
      { key: "status", header: "Status", getValue: (d) => DATA_ROOM_STATUS_LABEL[d.status] ?? d.status },
      { key: "sensitivity", header: "Sensitivity", getValue: (d) => SENSITIVITY_LABEL[d.sensitivity] ?? d.sensitivity },
      { key: "round", header: "Round", getValue: (d) => (d.roundId ? (roundName.get(d.roundId) ?? null) : null) },
      { key: "version", header: "Version", type: "integer", getValue: (d) => d.version },
      { key: "current", header: "Current version", type: "boolean", getValue: (d) => d.isCurrent },
      { key: "superseded", header: "Superseded by", getValue: (d) => d.supersededBy },
      { key: "file", header: "File name", getValue: (d) => d.fileName },
      { key: "mime", header: "MIME type", getValue: (d) => d.contentType },
      { key: "size", header: "File size (bytes)", type: "integer", getValue: (d) => d.sizeBytes },
      { key: "uploaded", header: "Uploaded", type: "datetime", getValue: (d) => d.uploadedAt },
      { key: "updated", header: "Updated", type: "datetime", getValue: (d) => d.updatedAt },
      { key: "expires", header: "Document expiry", type: "date", getValue: (d) => d.expiresAt },
      { key: "shares", header: "Share links", type: "integer", getValue: (d) => d.shareCount },
      { key: "activeShares", header: "Active share links", type: "integer", getValue: (d) => d.activeShares },
      { key: "revokedShares", header: "Revoked share links", type: "integer", getValue: (d) => d.revokedShares },
      { key: "shareExpiry", header: "Latest share expiry", type: "datetime", getValue: (d) => d.latestShareExpiry },
      { key: "description", header: "Description", getValue: (d) => d.description },
    ];
    const shareColumns: ExportColumn<ShareRow>[] = [
      { key: "document", header: "Document", getValue: (s) => s.documentName },
      { key: "version", header: "Version", type: "integer", getValue: (s) => s.documentVersion },
      { key: "investor", header: "Investor", getValue: (s) => s.investorName },
      { key: "recipient", header: "Recipient", getValue: (s) => s.recipientEmail },
      { key: "permission", header: "Permission", getValue: (s) => (s.permission === "download" ? "View and download" : "View only") },
      { key: "shared", header: "Shared", type: "datetime", getValue: (s) => s.sharedAt },
      { key: "expires", header: "Expires", type: "datetime", getValue: (s) => s.expiresAt },
      { key: "state", header: "State", getValue: (s) => shareState(s, now) },
      { key: "revoked", header: "Revoked", type: "datetime", getValue: (s) => s.revokedAt },
      { key: "opens", header: "Times opened", type: "integer", getValue: (s) => s.accessCount },
      { key: "lastOpened", header: "Last opened", type: "datetime", getValue: (s) => s.lastAccessedAt },
    ];

    return {
      module: "discovery",
      resource: "funding-data-room",
      title: "Data room index",
      metadata: { Contents: "Metadata only. Documents themselves are downloaded one at a time from the data room." },
      sheets: [
        { sheetName: "Documents", columns: documentColumns, rows: documents },
        { sheetName: "Shares", columns: shareColumns, rows: shareRows },
      ],
    };
  },
};
