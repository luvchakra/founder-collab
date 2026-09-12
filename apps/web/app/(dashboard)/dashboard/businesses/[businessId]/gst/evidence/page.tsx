import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { listComplianceEvidence } from "@cofounderai/module-gst/lib/evidence/queries";
import { getAttachmentSignedUrl } from "@cofounderai/core/attachments/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { EvidenceUploadForm } from "@cofounderai/module-gst/components/evidence/evidence-upload-form";
import { EvidenceList } from "@cofounderai/module-gst/components/evidence/evidence-list";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { recordComplianceEvidenceAction } from "./actions";

export default async function ComplianceEvidencePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const [business, evidence, canManage] = await Promise.all([
    getBusiness(businessId),
    listComplianceEvidence(businessId),
    hasPermission(businessId, "gst.manage_evidence"),
  ]);
  if (!business) notFound();

  const downloadUrls = new Map<string, string>();
  await Promise.all(
    evidence.map(async (row) => {
      if (!row.attachment) return;
      downloadUrls.set(row.attachmentId, await getAttachmentSignedUrl(row.attachment));
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Evidence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Return acknowledgments, government notices, and payment challans kept on file for {business.name}.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upload evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <EvidenceUploadForm action={recordComplianceEvidenceAction.bind(null, businessId)} />
          </CardContent>
        </Card>
      ) : null}

      <EvidenceList evidence={evidence} downloadUrls={downloadUrls} />
    </div>
  );
}
