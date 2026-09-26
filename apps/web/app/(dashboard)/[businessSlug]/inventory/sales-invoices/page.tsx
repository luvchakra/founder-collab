import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listSalesInvoices, listEligibleSalesOrders } from "@cofounderai/module-inventory/lib/sales-invoices/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { InvoicesList } from "@cofounderai/module-inventory/components/sales-invoices/invoices-list";
import {
  generateSalesInvoiceAction,
  updateInvoicePaymentStatusAction,
  createCreditNoteAction,
  fetchSalesInvoiceItemsAction,
  fetchCreditNotesAction,
} from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function SalesInvoicesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [invoices, eligibleSalesOrders, canCreate, canEdit, canCancel] = await Promise.all([
    listSalesInvoices(businessId),
    listEligibleSalesOrders(businessId),
    hasPermission(businessId, "invoices.create"),
    hasPermission(businessId, "invoices.edit"),
    hasPermission(businessId, "invoices.cancel"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sales Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate GST-compliant invoices from sales orders and manage credit notes for {business.name}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="inventory.sales-invoices" businessSlug={businessSlug} />
        </div>
      </div>

      <InvoicesList
        invoices={invoices}
        eligibleSalesOrders={eligibleSalesOrders}
        canCreate={canCreate}
        canEdit={canEdit}
        canCancel={canCancel}
        generateAction={generateSalesInvoiceAction.bind(null, businessId)}
        updatePaymentStatusAction={updateInvoicePaymentStatusAction.bind(null, businessId)}
        createCreditNoteAction={createCreditNoteAction.bind(null, businessId)}
        fetchItems={fetchSalesInvoiceItemsAction}
        fetchCreditNotes={fetchCreditNotesAction}
      />
    </div>
  );
}
