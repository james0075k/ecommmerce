'use client';

import * as React from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Counts from 0 up to `value` when the element first scrolls into view.
 *
 * The count is written straight to `textContent` rather than through state:
 * a 1.6s ease at 60fps is ~96 renders, and re-rendering a React tree 96 times
 * to change one string is how a stat row ends up costing more than the section
 * around it.
 */
export function NumberCounter({
  value,
  duration = 1.6,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  format,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Overrides the default locale formatting, e.g. to render a price. */
  format?: (value: number) => string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();

  const render = React.useCallback(
    (current: number) =>
      format
        ? format(current)
        : current.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }),
    [decimals, format],
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!inView) {
      // Start at zero so the jump to the final value reads as a count, not a
      // swap - but only until it is on screen.
      node.textContent = `${prefix}${render(0)}${suffix}`;
      return;
    }

    if (reduced) {
      node.textContent = `${prefix}${render(value)}${suffix}`;
      return;
    }

    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (current) => {
        node.textContent = `${prefix}${render(current)}${suffix}`;
      },
    });

    return () => controls.stop();
  }, [duration, inView, prefix, reduced, render, suffix, value]);

  return (
    <span ref={ref} className={cn('numeric tabular-nums', className)}>
      {/* Server-rendered and pre-hydration content: the final value, so the
          number is correct with JavaScript disabled and never reads as 0. */}
      {`${prefix}${render(value)}${suffix}`}
    </span>
  );
}
