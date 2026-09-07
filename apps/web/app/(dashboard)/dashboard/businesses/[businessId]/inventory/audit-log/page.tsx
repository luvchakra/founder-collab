import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listAuditLogForBusiness, listAuditActors } from "@cofounderai/core/audit/queries";
import { AuditLogView } from "@cofounderai/core/audit-log/audit-log-view";

export default async function AuditLogPage({
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
