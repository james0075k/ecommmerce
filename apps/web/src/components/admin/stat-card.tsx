'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { EASE_OUT_EXPO } from '@bazaar/ui';
import type { MetricDelta } from '@bazaar/shared';

import { AnimatedNumber } from '@/components/admin/animated-number';
import { Skeleton } from '@/components/ui/skeleton';
import { changeTone, formatChange } from '@/lib/admin';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  format?: (value: number) => string;
  delta?: MetricDelta | null;
  /** True where a fall is the good outcome - refunds, cancellations. */
  invertedDelta?: boolean;
  caption?: string;
  icon?: LucideIcon;
  /** Position in the row, used only to stagger the entrance. */
  index?: number;
  className?: string;
}

/**
 * One figure, its trend, and what it is.
 *
 * The comparison line is the part that earns its place: a revenue number on its
 * own tells an operator nothing they can act on, and the same number against
 * last week tells them whether to worry. When there is no previous period to
 * compare against the card says "New" rather than "+100%", which would be both
 * meaningless and encouraging.
 */
export function StatCard({
  label,
  value,
  format,
  delta,
  invertedDelta = false,
  caption,
  icon: Icon,
  index = 0,
  className,
}: StatCardProps) {
  const tone = delta ? changeTone(delta.changePct, invertedDelta) : 'flat';
  const TrendIcon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO, delay: index * 0.05 }}
      className={cn(
        'rounded-lg border border-border bg-card p-4 shadow-card sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {Icon ? (
          <span className="rounded-md bg-accent p-1.5 text-accent-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>

      <p className="numeric mt-3 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
        <AnimatedNumber value={value} format={format} />
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
              tone === 'up' && 'bg-success/10 text-ok',
              tone === 'down' && 'bg-destructive/10 text-destructive',
              tone === 'flat' && 'bg-muted text-muted-foreground',
            )}
          >
            <TrendIcon className="size-3" aria-hidden />
            {formatChange(delta.changePct)}
          </span>
        ) : null}

        {caption ? <span className="text-muted-foreground">{caption}</span> : null}
      </div>
    </motion.div>
  );
}

/** The same footprint as StatCard, so the grid does not reflow on load. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-4 w-20" />
    </div>
  );
}
