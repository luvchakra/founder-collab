import { formatAmount, type Figure, type FigureKind } from "../../lib/funding/metrics";

const KIND_LABEL: Record<FigureKind, string> = {
  actual: "Actual",
  projected: "Projected",
  user_entered: "User-entered",
  ai_suggested: "AI-suggested",
};

/**
 * A Funding KPI tile. Every figure is labelled with what kind of number it is (§20.2) and
 * carries its definition behind "How calculated" (§73). Unavailable shows "—".
 */
export function FigureTile({
  label,
  figure,
  money,
  currency,
  format,
}: {
  label: string;
  figure: Figure;
  money?: boolean;
  currency?: string | null;
  format?: (v: number) => string;
}) {
  const value =
    figure.value === null ? "—" : money ? formatAmount(figure.value, currency ?? null) : format ? format(figure.value) : figure.value.toLocaleString("en-IN");
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{KIND_LABEL[figure.kind]}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">How calculated</summary>
        <p className="mt-1">{figure.definition}</p>
      </details>
    </div>
  );
}
