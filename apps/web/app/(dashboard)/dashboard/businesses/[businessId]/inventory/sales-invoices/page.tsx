import { notFound } from "next/navigation";
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

export default async function SalesInvoicesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
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
      <div>
        <h1 className="text-xl font-semibold">Sales Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate GST-compliant invoices from sales orders and manage credit notes for {business.name}.
        </p>
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
