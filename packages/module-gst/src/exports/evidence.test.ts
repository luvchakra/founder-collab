import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-16 -- Finance Evidence export: metadata only.

const q = vi.hoisted(() => ({ listComplianceEvidence: vi.fn(), listAuditActors: vi.fn(), getAttachmentSignedUrl: vi.fn() }));
vi.mock("../lib/evidence/queries", () => ({ listComplianceEvidence: q.listComplianceEvidence }));
vi.mock("@cofounderai/core/audit/queries", () => ({ listAuditActors: q.listAuditActors }));
vi.mock("@cofounderai/core/attachments/queries", () => ({ getAttachmentSignedUrl: q.getAttachmentSignedUrl }));

import { financeEvidenceExport } from "./evidence";
import { TENANT, csvLines, everyValue, headers, rowValues, runAdapter } from "./test-support";

beforeEach(() => {
  q.listComplianceEvidence.mockReset().mockResolvedValue([
    {
      id: "ev-1",
      businessId: TENANT,
      attachmentId: "att-1",
      evidenceType: "return_acknowledgment",
      relatedEntityType: "return_period",
      relatedEntityId: "rp-1",
      description: "GSTR-3B August ARN",
      uploadedBy: "user-1",
      createdAt: "2026-09-12T06:00:00Z",
      retentionUntil: "2034-03-31",
      attachment: {
        id: "att-1",
        business_id: TENANT,
        entity_type: "compliance_evidence",
        entity_id: "ev-1",
        storage_bucket: "attachments",
        storage_path: `${TENANT}/att-1/arn.pdf`,
        file_name: "arn.pdf",
        content_type: "application/pdf",
        size_bytes: 20480,
        uploaded_by: "user-1",
        created_at: "2026-09-12T06:00:00Z",
      },
    },
    {
      id: "ev-2",
      businessId: TENANT,
      attachmentId: "att-2",
      evidenceType: "other",
      relatedEntityType: null,
      relatedEntityId: null,
      description: null,
      uploadedBy: "user-9",
      createdAt: "2026-09-13T06:00:00Z",
      retentionUntil: null,
      attachment: null,
    },
  ]);
  q.listAuditActors.mockReset().mockResolvedValue([{ id: "user-1", name: "Asha Rao" }]);
});

describe("EXP-FIN-16 finance.evidence", () => {
  it("is Finance-licensed with the page's (empty) read permission and reads only the context tenant", async () => {
    expect(financeEvidenceExport.id).toBe("finance.evidence");
    expect(financeEvidenceExport.module).toBe("gst");
    expect(financeEvidenceExport.permissions).toEqual([]);
    await runAdapter(financeEvidenceExport);
    expect(q.listComplianceEvidence).toHaveBeenCalledWith(TENANT);
  });

  it("writes evidence, category, related record, uploaded, owner and retention -- blank stays blank", async () => {
    const { workbook } = await runAdapter(financeEvidenceExport);
    expect(headers(workbook, "Evidence")).toEqual([
      "Evidence", "Category", "Description", "Related to", "Related record", "File type", "Size (bytes)",
      "Uploaded", "Uploaded by", "Retain until", "File status",
    ]);
    expect(rowValues(workbook, "Evidence", 0)).toMatchObject({
      Evidence: "arn.pdf",
      Category: "Return acknowledgment",
      "Related to": "Return period",
      "Uploaded by": "Asha Rao",
      "File status": "On file",
    });
    expect(rowValues(workbook, "Evidence", 1)).toMatchObject({ "Related to": null, "Retain until": null, "File status": "File unavailable" });
    expect((await csvLines(workbook))[1]).toBe(
      "arn.pdf,Return acknowledgment,GSTR-3B August ARN,Return period,rp-1,application/pdf,20480,2026-09-12T11:30:00+05:30,Asha Rao,2034-03-31,On file",
    );
  });

  it("never signs a URL, and never writes storage locations", async () => {
    const { workbook } = await runAdapter(financeEvidenceExport);
    expect(q.getAttachmentSignedUrl).not.toHaveBeenCalled();
    const all = everyValue(workbook);
    expect(all).not.toContain("storage");
    expect(all).not.toContain(`${TENANT}/att-1`);
    expect(all).not.toMatch(/https?:\/\//);
  });
});
