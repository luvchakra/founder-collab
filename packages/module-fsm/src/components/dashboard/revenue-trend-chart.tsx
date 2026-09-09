"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@cofounderai/core/ui/chart";
import { inr } from "@cofounderai/core/lib/format";
import type { RevenueTrendPoint } from "../../lib/dashboard/aggregate";

const chartConfig = {
  total: { label: "Invoiced", color: "var(--primary)" },
} satisfies ChartConfig;

/** Daily invoiced total, same Bar/ChartContainer pattern as inventory's stock-movement
 * chart and discovery's prospect trend -- one shared visual language for "trend over
 * the last N days" across the platform's dashboards. */
export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  const isEmpty = data.every((d) => d.total === 0);

  if (isEmpty) {
    return <p className="text-sm text-muted-foreground">No invoices in this window yet.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
      <BarChart data={data} margin={{ left: -20 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} tickMargin={6} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => inr.format(Number(value))} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
