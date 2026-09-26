import Link from "next/link";
import { FileText } from "lucide-react";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import {
  ACCOUNTING_STATUS_LABEL,
  EINVOICE_STATUS_LABEL,
  GST_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  STATUS_TONE_KEY,
  type FinanceInvoice,
} from "../../lib/invoices/derive";
import { ledgerAmount } from "../accounting/labels";

/** The four statuses, each its own badge — never merged into one. */
function statusCells(invoice: FinanceInvoice) {
  return {
    accounting: <StatusBadge status={STATUS_TONE_KEY.accounting[invoice.accounting]} label={ACCOUNTING_STATUS_LABEL[invoice.accounting]} />,
    payment: (
      <span className="flex flex-col items-start gap-0.5">
        <StatusBadge status={STATUS_TONE_KEY.payment[invoice.payment.status]} label={PAYMENT_STATUS_LABEL[invoice.payment.status]} />
        {invoice.payment.outstanding > 0 && invoice.payment.status !== "unpaid" ? (
          <span className="text-xs text-muted-foreground tabular-nums">{ledgerAmount.format(invoice.payment.outstanding)} due</span>
        ) : null}
      </span>
    ),
    gst: (
      <StatusBadge
        status={STATUS_TONE_KEY.gst[invoice.gst.status]}
        label={
          invoice.gst.status === "in_return" && invoice.gst.returnStatus
            ? `GSTR-1 ${invoice.gst.returnStatus.replace(/_/g, " ")}`
            : GST_STATUS_LABEL[invoice.gst.status]
        }
      />
    ),
    einvoice: (
      <span title={invoice.einvoice.error ?? invoice.einvoice.irn ?? undefined}>
        <StatusBadge status={STATUS_TONE_KEY.einvoice[invoice.einvoice.status]} label={EINVOICE_STATUS_LABEL[invoice.einvoice.status]} />
      </span>
    ),
  };
}

/**
 * FIN-4: invoices with their accounting, payment, GST and e-invoice status side by side.
 *
 * Four columns rather than one "status" because they answer four different questions and
 * move independently — the combinations (paid but unposted, filed but never e-invoiced)
 * are exactly what someone opens this screen to find. The invoice number opens the
 * document's own ledger page (FIN-12).
 */
export function FinanceInvoicesView({
  invoices,
  documentPath,
}: {
  invoices: FinanceInvoice[];
  documentPath: string;
}) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
        <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">
          No invoices match. Invoices raised in Service, Inventory or through the API show up here on their own.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {invoices.map((invoice) => {
          const cells = statusCells(invoice);
          return (
            <li key={invoice.id} className="flex flex-col gap-2 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`${documentPath}/${invoice.id}`} className="font-medium text-primary hover:underline">
                    {invoice.number ?? "Invoice"}
                  </Link>
                  <p className="break-words text-muted-foreground">{invoice.partyName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(invoice.docDate)}</p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{ledgerAmount.format(invoice.total)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Accounting</dt><dd>{cells.accounting}</dd></div>
                <div className="flex flex-col gap-1"><dt className="text-muted-foreground">Payment</dt><dd>{cells.payment}</dd></div>
                <div className="flex flex-col gap-1"><dt className="text-muted-foreground">GST</dt><dd>{cells.gst}</dd></div>
                <div className="flex flex-col gap-1"><dt className="text-muted-foreground">E-invoice</dt><dd>{cells.einvoice}</dd></div>
              </dl>
            </li>
          );
        })}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Invoice</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="w-28">Date</TableHead>
            <TableHead className="w-32 text-right">Total</TableHead>
            <TableHead className="w-28">Accounting</TableHead>
            <TableHead className="w-32">Payment</TableHead>
            <TableHead className="w-36">GST</TableHead>
            <TableHead className="w-32">E-invoice</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const cells = statusCells(invoice);
            return (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link href={`${documentPath}/${invoice.id}`} className="font-medium text-primary hover:underline">
                    {invoice.number ?? "Invoice"}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56 truncate">{invoice.partyName}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(invoice.docDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(invoice.total)}</TableCell>
                <TableCell>{cells.accounting}</TableCell>
                <TableCell>{cells.payment}</TableCell>
                <TableCell>{cells.gst}</TableCell>
                <TableCell>{cells.einvoice}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
