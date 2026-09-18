import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { cn } from "@cofounderai/core/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { GST_COMPONENTS, type GstReconciliation, type GstTotals } from "../../lib/accounting/gst-ledger";
import { ledgerAmount } from "./labels";

/**
 * The GST ledger, and whether it agrees with the return.
 *
 * The reconciliation leads, because it is the question someone opens this page with:
 * *can I file this?* The component breakdown sits underneath as the detail you reach for
 * once the answer is "not yet".
 */
export function GstLedgerView({
  output,
  input,
  netPayable,
  reconciliation,
  causes,
  hasAccounts,
}: {
  output: GstTotals;
  input: GstTotals;
  netPayable: number;
  reconciliation: GstReconciliation;
  causes: string[];
  hasAccounts: boolean;
}) {
  if (!hasAccounts) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        No GST accounts are set up yet, so the ledger has nothing to compare against your
        return. Set up your chart of accounts and this fills in on its own.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Output tax collected" value={ledgerAmount.format(output.total)} detail="On your sales" tone="warning" />
        <StatCard label="Input tax credit" value={ledgerAmount.format(input.total)} detail="On your purchases" tone="success" />
        <StatCard
          label={netPayable >= 0 ? "Net payable" : "Credit carried forward"}
          value={ledgerAmount.format(Math.abs(netPayable))}
          detail={netPayable >= 0 ? "Owed to the department" : "Carried into next period"}
          tone={netPayable >= 0 ? "warning" : "success"}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Books against return</h2>

        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
            reconciliation.agrees
              ? "border-success/30 bg-success/5 text-success-subtle"
              : "border-warning/30 bg-warning/5 text-warning-subtle",
          )}
        >
          {reconciliation.agrees ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {reconciliation.agrees
              ? "Your ledger and your return agree. What you file is backed by your books."
              : `Your ledger and your return differ by up to ${ledgerAmount.format(reconciliation.largestGap)}. Worth resolving before you file.`}
          </span>
        </div>

        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {reconciliation.rows.map((row) => (
              <li key={row.label} className="flex flex-col gap-1 p-3 text-sm">
                <p className="font-medium">{row.label}</p>
                <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                  <span>Books {ledgerAmount.format(row.perBooks)}</span>
                  <span>Return {ledgerAmount.format(row.perReturn)}</span>
                  <span className={row.agrees ? "text-success-subtle" : "text-warning-subtle"}>
                    {row.agrees ? "Agrees" : `Off by ${ledgerAmount.format(Math.abs(row.difference))}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Figure</TableHead>
                <TableHead className="w-40 text-right">Per your books</TableHead>
                <TableHead className="w-40 text-right">Per the return</TableHead>
                <TableHead className="w-40 text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliation.rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(row.perBooks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(row.perReturn)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      row.agrees ? "text-muted-foreground" : "font-medium text-warning-subtle",
                    )}
                  >
                    {row.agrees ? "—" : ledgerAmount.format(row.difference)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {causes.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            {/* Questions, not conclusions: this cannot know which side is wrong, and
                asserting a cause it can't prove sends people to fix the wrong thing. */}
            <p className="font-medium">Worth checking, in this order</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              {causes.map((cause) => (
                <li key={cause}>{cause}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">By component</h2>
        <div className="rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Output tax</TableHead>
                <TableHead className="text-right">Input credit</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GST_COMPONENTS.filter((c) => output[c] !== 0 || input[c] !== 0).map((component) => (
                <TableRow key={component}>
                  <TableCell className="font-medium">{component}</TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(output[component])}</TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(input[component])}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {ledgerAmount.format(output[component] - input[component])}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(output.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(input.total)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(netPayable)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
