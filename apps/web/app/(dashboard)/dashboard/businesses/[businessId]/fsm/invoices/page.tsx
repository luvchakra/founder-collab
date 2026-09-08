import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listInvoices } from "@cofounderai/module-fsm/lib/invoices/queries";
import { InvoicesList } from "@cofounderai/module-fsm/components/invoices/invoices-list";

export default async function InvoicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const invoices = await listInvoices(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">Billing for {business.name}.</p>
      </div>

      <InvoicesList invoices={invoices} businessId={businessId} />
    </div>
  );
}
