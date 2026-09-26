import Link from "next/link";
import { cn } from "@cofounderai/core/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import type { DimensionKey, DimensionReportRow, DimensionSetting } from "../../lib/dimensions/derive";
import { ledgerAmount } from "../accounting/labels";

/** FIN-9: one tab per enabled dimension — links, so a report is shareable as read. */
export function DimensionTabs({
  settings,
  active,
  hrefFor,
}: {
  settings: DimensionSetting[];
  active: DimensionKey;
  hrefFor: (key: DimensionKey) => string;
}) {
  return (
    <nav aria-label="Dimension" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
      {settings.map((s) => (
        <Link
          key={s.key}
          href={hrefFor(s.key)}
          aria-current={s.key === active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            s.key === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

/** FIN-9: income, costs and profit per value of one dimension, "Unassigned" last. */
export function DimensionReport({ label, rows }: { label: string; rows: DimensionReportRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
        Nothing was posted to income or cost accounts in this period.
      </p>
    );
  }
  const total = (f: (r: DimensionReportRow) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100;
  const money = (n: number) => ledgerAmount.format(n);

  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.value ?? "unassigned"} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
            <span className={cn("min-w-0 break-words", r.value === null && "text-muted-foreground")}>{r.name}</span>
            <span className="shrink-0 text-right tabular-nums">
              {money(r.profit)}
              <span className="block text-xs text-muted-foreground">
                {money(r.income)} in · {money(r.costs)} costs
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead className="w-40 text-right">Income</TableHead>
            <TableHead className="w-40 text-right">Costs</TableHead>
            <TableHead className="w-40 text-right">Profit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.value ?? "unassigned"}>
              <TableCell className={cn(r.value === null && "text-muted-foreground")}>{r.name}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.income)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.costs)}</TableCell>
              <TableCell className={cn("text-right tabular-nums", r.profit < 0 && "text-destructive-subtle")}>{money(r.profit)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{money(total((r) => r.income))}</TableCell>
            <TableCell className="text-right tabular-nums">{money(total((r) => r.costs))}</TableCell>
            <TableCell className="text-right tabular-nums">{money(total((r) => r.profit))}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
