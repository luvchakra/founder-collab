"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@cofounderai/core/ui/chart";
import type { TrendPoint } from "../../lib/dashboard/aggregate";

const chartConfig = {
  count: { label: "New prospects", color: "var(--primary)" },
} satisfies ChartConfig;

/** Daily new-prospect counts, same Bar/ChartContainer pattern as inventory's own
 * 14-day stock-movement chart (dashboard-view.tsx) -- one shared visual language for
 * "trend over the last N days" across the platform's dashboards. */
export function ProspectTrendChart({ data }: { data: TrendPoint[] }) {
  const isEmpty = data.every((d) => d.count === 0);

  if (isEmpty) {
    return <p className="text-sm text-muted-foreground">No prospects added in this window yet.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
      <BarChart data={data} margin={{ left: -20 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={4} tickMargin={6} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
