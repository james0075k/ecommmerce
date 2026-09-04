'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatPrice } from '@bazaar/ui';

import { cn } from '@/lib/utils';

/**
 * The series palette.
 *
 * Read from the CSS custom properties the design tokens already define, so a
 * chart follows the theme the way everything else does - including the light/
 * dark switch, which changes `--chart-1` under the same variable name. Recharts
 * needs a concrete colour string rather than a `var()`, so these are resolved
 * from the document once the component mounts.
 */
const CHART_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

function useChartColors(): string[] {
  const [colors, setColors] = React.useState<string[]>(FALLBACK_COLORS);

  React.useEffect(() => {
    const read = () => {
      const styles = getComputedStyle(document.documentElement);
      const resolved = CHART_VARS.map((name, index) => {
        const value = styles.getPropertyValue(name).trim();
        return value || FALLBACK_COLORS[index]!;
      });
      setColors(resolved);
    };

    read();

    // The theme toggle swaps a class on <html>, which changes every one of
    // these variables without unmounting the chart.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return colors;
}

/** Used before mount and if a variable is ever missing - never a blank chart. */
const FALLBACK_COLORS = ['#8b5cf6', '#ff6b35', '#00c48c', '#f59e0b', '#38bdf8'];

/* -------------------------------------------------------------------------- */
/*  Shared chrome                                                             */
/* -------------------------------------------------------------------------- */

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--muted-foreground)',
} as const;

/**
 * The tooltip.
 *
 * Recharts' default renders raw values with no formatting and no theme, which
 * on a revenue chart shows "48213.5" where an operator expects "Rs 48,214".
 * A custom one is the only way to control both.
 */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormat,
}: TooltipProps<number, string> & {
  /** Named `valueFormat` rather than `formatter`: Recharts already declares a
   *  `formatter` on TooltipProps with a different signature, and intersecting
   *  the two produces a parameter type neither side can satisfy. */
  valueFormat?: (name: string, value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-float">
      <p className="mb-1.5 font-semibold text-popover-foreground">{formatLabel(label)}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.name)} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="numeric ml-auto font-semibold text-popover-foreground">
              {valueFormat
                ? valueFormat(String(entry.name), Number(entry.value ?? 0))
                : Number(entry.value ?? 0).toLocaleString('en-NP')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Axis labels are ISO days; shown as "2 Sep" so the axis stays readable. */
function formatLabel(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  return new Intl.DateTimeFormat('en-NP', { day: 'numeric', month: 'short' }).format(
    new Date(`${value}T00:00:00`),
  );
}

/** "Rs 48k" - compact, because an axis has no room for the full figure. */
function compactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `Rs ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `Rs ${Math.round(value / 1000)}k`;
  return `Rs ${Math.round(value)}`;
}

/* -------------------------------------------------------------------------- */
/*  Revenue                                                                   */
/* -------------------------------------------------------------------------- */

export interface RevenueDatum {
  date: string;
  revenue: number;
  orders: number;
  refunds?: number;
}

/**
 * Revenue over time, with orders on a second axis.
 *
 * Two axes rather than two charts because the question an operator asks is
 * whether revenue moved *because* order count moved or because basket size
 * did - and that comparison only reads on one set of gridlines. The scales are
 * genuinely different (rupees against a count of ten), so a single axis would
 * flatten the order line into the baseline.
 */
export function RevenueChart({
  data,
  className,
  height = 300,
}: {
  data: RevenueDatum[];
  className?: string;
  height?: number;
}) {
  const colors = useChartColors();

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="bz-revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatLabel}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            yAxisId="money"
            tickFormatter={compactMoney}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormat={(name, value) =>
                  name === 'Revenue' ? formatPrice(value) : value.toLocaleString('en-NP')
                }
              />
            }
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          />

          <Area
            yAxisId="money"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={colors[0]}
            strokeWidth={2}
            fill="url(#bz-revenue-fill)"
            // Dots on a 30-point series are noise; the tooltip is the affordance.
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            yAxisId="count"
            type="monotone"
            dataKey="orders"
            name="Orders"
            stroke={colors[2]}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="transparent"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Conversion                                                                */
/* -------------------------------------------------------------------------- */

export interface ConversionDatum {
  date: string;
  visitors: number;
  orders: number;
  conversionRate: number;
}

export function ConversionChart({
  data,
  height = 260,
}: {
  data: ConversionDatum[];
  height?: number;
}) {
  const colors = useChartColors();

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatLabel}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            yAxisId="visitors"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormat={(name, value) =>
                  name === 'Conversion' ? `${value.toFixed(2)}%` : value.toLocaleString('en-NP')
                }
              />
            }
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
          />

          <Line
            yAxisId="visitors"
            type="monotone"
            dataKey="visitors"
            name="Visitors"
            stroke={colors[4]}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="conversionRate"
            name="Conversion"
            stroke={colors[1]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Orders per bucket                                                         */
/* -------------------------------------------------------------------------- */

export function OrdersBarChart({
  data,
  height = 260,
}: {
  data: Array<{ date: string; orders: number }>;
  height?: number;
}) {
  const colors = useChartColors();

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatLabel}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
          <Bar dataKey="orders" name="Orders" fill={colors[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Traffic sources                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Traffic sources as a donut.
 *
 * Capped at six slices with the rest folded into "Other": a pie with fourteen
 * segments is a colour-matching exercise, not a chart, and the long tail of
 * one-visit referrers is exactly what nobody is looking for.
 */
export function TrafficPieChart({
  data,
  height = 280,
}: {
  data: Array<{ source: string; visits: number }>;
  height?: number;
}) {
  const colors = useChartColors();

  const slices = React.useMemo(() => {
    const sorted = [...data].sort((a, b) => b.visits - a.visits);
    if (sorted.length <= 6) return sorted;

    const head = sorted.slice(0, 5);
    const tail = sorted.slice(5).reduce((sum, entry) => sum + entry.visits, 0);

    return [...head, { source: 'Other', visits: tail }];
  }, [data]);

  const total = slices.reduce((sum, slice) => sum + slice.visits, 0) || 1;

  if (slices.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No traffic recorded in this range yet.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="visits"
            nameKey="source"
            innerRadius="52%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.source} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip
                valueFormat={(_name, value) =>
                  `${value.toLocaleString('en-NP')} (${((value / total) * 100).toFixed(1)}%)`
                }
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
