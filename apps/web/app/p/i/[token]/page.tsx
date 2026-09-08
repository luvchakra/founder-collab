import { getPublicInvoiceView } from "@cofounderai/module-fsm/lib/invoices/queries";
import { markInvoiceViewed } from "@cofounderai/module-fsm/lib/invoices/mutations";
import { PortalTokenError } from "@cofounderai/module-fsm/lib/portal-tokens/tokens";
import { PublicInvoiceView } from "@cofounderai/module-fsm/components/invoices/public-invoice-view";

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view;
  try {
    view = await getPublicInvoiceView(token);
  } catch (err) {
    const message = err instanceof PortalTokenError ? err.message : "This link is invalid or has expired.";
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Link unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  // Best-effort "sent -> viewed" flip (same pattern as the public estimate page) --
  // never blocks rendering the invoice on a failed write.
  void markInvoiceViewed(token).catch(() => {});

  return <PublicInvoiceView view={view} />;
}
