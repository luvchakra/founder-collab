import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getInvoice, listInvoiceLines } from "@cofounderai/module-fsm/lib/invoices/queries";
import { listChargeableItemOptions } from "@cofounderai/module-fsm/lib/estimates/queries";
import { listActiveJobChargeTypeOptions } from "@cofounderai/module-fsm/lib/job-charge-types/queries";
import { getDocumentBalance, listPaymentsForDocument } from "@cofounderai/core/payments/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { InvoiceEditor } from "@cofounderai/module-fsm/components/invoices/invoice-editor";
import {
  addInvoiceChargeLineAction,
  deleteInvoiceChargeLineAction,
  markInvoicePaidAction,
  markInvoiceUnpaidAction,
  recordInvoicePaymentAction,
  reorderInvoiceChargeLinesAction,
  sendInvoiceAction,
  updateInvoiceChargeLineAction,
  voidInvoiceAction,
} from "./actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ businessId: string; invoiceId: string }> }) {
  const { businessId, invoiceId } = await params;
  const [business, invoice] = await Promise.all([getBusiness(businessId), getInvoice(businessId, invoiceId)]);
  if (!business || !invoice) notFound();

  const [lines, items, jobChargeTypes, balance, payments, canEdit, canVoid] = await Promise.all([
    listInvoiceLines(businessId, invoiceId),
    listChargeableItemOptions(businessId),
    listActiveJobChargeTypeOptions(businessId),
    getDocumentBalance(invoiceId),
    listPaymentsForDocument(invoiceId),
    hasPermission(businessId, "invoices.edit"),
    hasPermission(businessId, "invoices.cancel"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}</p>
      </div>

      <InvoiceEditor
        invoice={invoice}
        lines={lines}
        items={items}
        jobChargeTypes={jobChargeTypes}
        payments={payments}
        balanceAmount={balance?.balance_amount ?? invoice.total_amount}
        paidAmount={balance?.paid_amount ?? 0}
        canEdit={canEdit}
        canRecordPayment={canEdit}
        canVoid={canVoid}
        addLineAction={addInvoiceChargeLineAction.bind(null, businessId, invoiceId)}
        updateLineAction={updateInvoiceChargeLineAction.bind(null, businessId, invoiceId)}
        deleteLineAction={deleteInvoiceChargeLineAction.bind(null, businessId, invoiceId)}
        reorderAction={reorderInvoiceChargeLinesAction.bind(null, businessId, invoiceId)}
        sendAction={sendInvoiceAction.bind(null, businessId, invoiceId)}
        recordPaymentAction={recordInvoicePaymentAction.bind(null, businessId, invoiceId)}
        markPaidAction={markInvoicePaidAction.bind(null, businessId, invoiceId)}
        markUnpaidAction={markInvoiceUnpaidAction.bind(null, businessId, invoiceId)}
        voidAction={voidInvoiceAction.bind(null, businessId, invoiceId)}
      />
    </div>
  );
}
