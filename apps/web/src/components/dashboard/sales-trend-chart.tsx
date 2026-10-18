"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@steward/ui/components/chart";

import { peso, pesoShort } from "@/lib/format";

interface Point {
  label: string;
  current: number;
  previous: number;
}

/** Current period as a filled orange area, previous period as a dashed grey line (mockup AreaChart). */
export function SalesTrendChart({ data, currentLabel }: { data: Point[]; currentLabel: string }) {
  const config = {
    current: { label: currentLabel, color: "var(--chart-1)" },
    previous: { label: "Previous", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-[260px] w-full"
      aria-label="Sales trend chart"
    >
      <AreaChart data={data} margin={{ top: 12, right: 24, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={24}
          fontSize={11.5}
        />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11.5}
          tickFormatter={(value: number) => pesoShort(value)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--ring)", strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || payload.length === 0) return null;
            const point = payload[0]?.payload as Point | undefined;
            if (!point) return null;
            return (
              <div className="min-w-[150px] rounded-lg border border-border bg-popover px-2.5 py-2 text-xs shadow-lg">
                <div className="mb-1.5 font-medium">{String(label)}</div>
                <TipLine color="var(--chart-2)" name="Previous" value={point.previous} />
                <TipLine color="var(--chart-1)" name={currentLabel} value={point.current} />
              </div>
            );
          }}
        />
        <Area
          dataKey="previous"
          type="monotone"
          stroke="var(--chart-2)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill="none"
          dot={false}
          activeDot={{ r: 3.5, fill: "var(--background)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Area
          dataKey="current"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={2.25}
          fill="url(#trend-fill)"
          dot={false}
          activeDot={{ r: 4.5, fill: "var(--background)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function TipLine({ color, name, value }: { color: string; name: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <i className="inline-block size-2 rounded-[2px]" style={{ background: color }} />
      {name}
      <b className="num ml-auto font-medium text-foreground">{peso(value)}</b>
    </div>
  );
}
