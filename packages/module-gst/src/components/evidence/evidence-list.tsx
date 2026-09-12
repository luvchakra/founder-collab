import { FileText, FolderOpen } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ComplianceEvidenceWithAttachment, EvidenceType } from "../../lib/evidence/types";

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  return_acknowledgment: "Return acknowledgment",
  payment_challan: "Payment challan",
  government_notice: "Government notice",
  audit_response: "Audit response",
  other: "Other",
};

/**
 * COMPLY-P0-10.1/COMPLY-P0-11 (Evidence Repository UI). `downloadUrls` is a plain
 * `Map<attachmentId, signedUrl>` resolved server-side (COMPLY-P0-10.1's own
 * `getAttachmentSignedUrl`, one-hour expiry) and passed down -- a signed URL is real
 * evidence of authorization at the moment it was minted, not something a client
 * component should ever compute itself.
 */
export function EvidenceList({ evidence, downloadUrls }: { evidence: ComplianceEvidenceWithAttachment[]; downloadUrls: Map<string, string> }) {
  if (evidence.length === 0) {
    return <EmptyState icon={FolderOpen} message="No evidence recorded yet -- upload a return acknowledgment, notice, or payment challan above." />;
  }

  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {evidence.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{row.attachment?.file_name ?? "(file unavailable)"}</span>
              <Badge variant="outline">{EVIDENCE_TYPE_LABEL[row.evidenceType]}</Badge>
            </div>
            {row.description ? <p className="text-xs text-muted-foreground">{row.description}</p> : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{new Date(row.createdAt).toLocaleDateString()}</span>
              {row.retentionUntil ? <span>Retain until {row.retentionUntil}</span> : null}
            </div>
            <div className="flex justify-end">
              {downloadUrls.has(row.attachmentId) ? (
                <Button asChild variant="outline" size="sm">
                  <a href={downloadUrls.get(row.attachmentId)} target="_blank" rel="noreferrer">
                    <FileText className="size-4" aria-hidden="true" />
                    Download
                  </a>
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Retain until</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {evidence.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="max-w-48 truncate font-medium">{row.attachment?.file_name ?? "(file unavailable)"}</TableCell>
              <TableCell>
                <Badge variant="outline">{EVIDENCE_TYPE_LABEL[row.evidenceType]}</Badge>
              </TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground">{row.description ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(row.createdAt).toLocaleDateString()}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{row.retentionUntil ?? "—"}</TableCell>
              <TableCell className="text-right">
                {downloadUrls.has(row.attachmentId) ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={downloadUrls.get(row.attachmentId)} target="_blank" rel="noreferrer">
                      <FileText className="size-4" aria-hidden="true" />
                      Download
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
