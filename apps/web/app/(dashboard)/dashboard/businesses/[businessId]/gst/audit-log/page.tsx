import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { listAuditLogForBusiness, listAuditActors } from "@cofounderai/core/audit/queries";
import { AuditLogView } from "@cofounderai/core/audit-log/audit-log-view";

/**
 * COMPLY-P0-10.3/COMPLY-P0-11 (Audit Trail UI). Same generic `AuditLogView` every other
 * module's own audit-log page already uses (`module-inventory`'s own
 * `inventory/audit-log/page.tsx`, copied here verbatim) -- `core.write_audit_log()` is
 * platform-wide, not module-scoped (D-10), so the read side is too; this page just
 * points it at this business, same as every other module's own copy does.
 */
export default async function ComplianceAuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ entityType?: string; actorId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const { businessId } = await params;
  const { entityType = "", actorId = "", dateFrom = "", dateTo = "" } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [entries, actors] = await Promise.all([
    listAuditLogForBusiness(businessId, {
      entityType: entityType || undefined,
      actorId: actorId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    listAuditActors(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A read-only, chronological record of who changed what and when for {business.name}.
        </p>
      </div>

      <AuditLogView entries={entries} actors={actors} filters={{ entityType, actorId, dateFrom, dateTo }} />
    </div>
  );
}
