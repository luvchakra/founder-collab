import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { inr } from "@cofounderai/core/lib/format";
import type { PublicInvoiceView as PublicInvoiceViewData } from "../../lib/invoices/types";

const STATUS_LABEL: Record<string, string> = {
  issued: "Awaiting payment",
  sent: "Awaiting payment",
  viewed: "Awaiting payment",
  partially_paid: "Partially paid",
  paid: "Paid",
  voided: "Voided",
};

/** The `/p/i/[token]` page's content -- no auth, tokenised, read-only (PRD §1.4: online
 * payment is explicitly a SHOULD/LATER item, so there's no action here at all, unlike
 * `PublicEstimateView`'s approve/decline buttons). */
export function PublicInvoiceView({ view }: { view: PublicInvoiceViewData }) {
  const { invoice, lines, partyName, businessName, businessWebsite, balanceAmount } = view;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{businessName}</h1>
          {businessWebsite ? <p className="text-sm text-muted-foreground">{businessWebsite}</p> : null}
        </div>
        <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "voided" ? "destructive" : "outline"}>
          {STATUS_LABEL[invoice.status] ?? invoice.status}
        </Badge>
      </div>

      <div className="rounded-2xl border border-border p-6">
        <p className="text-sm text-muted-foreground">Invoice for</p>
        <p className="text-lg font-medium">{partyName}</p>
        {invoice.number ? <p className="mt-1 text-xs text-muted-foreground">#{invoice.number}</p> : null}
        {invoice.due_date ? <p className="mt-1 text-xs text-muted-foreground">Due {invoice.due_date}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.item_name}</TableCell>
                <TableCell className="text-right">{line.quantity}</TableCell>
                <TableCell className="text-right">{inr.format(line.unit_price)}</TableCell>
                <TableCell className="text-right font-medium">
                  {inr.format(line.quantity * line.unit_price + line.cgst_amount + line.sgst_amount + line.igst_amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <p>Subtotal: {inr.format(invoice.subtotal)}</p>
        {invoice.cgst_amount > 0 ? <p>CGST: {inr.format(invoice.cgst_amount)}</p> : null}
        {invoice.sgst_amount > 0 ? <p>SGST: {inr.format(invoice.sgst_amount)}</p> : null}
        {invoice.igst_amount > 0 ? <p>IGST: {inr.format(invoice.igst_amount)}</p> : null}
        <p className="text-base font-semibold">Total: {inr.format(invoice.total_amount)}</p>
        <p className={balanceAmount > 0 ? "font-semibold" : "text-muted-foreground"}>
          {balanceAmount > 0 ? `Balance due: ${inr.format(balanceAmount)}` : "Paid in full"}
        </p>
      </div>
    </div>
  );
}
