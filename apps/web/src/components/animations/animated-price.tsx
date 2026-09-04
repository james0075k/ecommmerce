'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { formatPrice } from '@bazaar/ui';

import { cn } from '@/lib/utils';

/**
 * A price that morphs when it changes: the old figure scrolls up and out, the
 * new one arrives from below.
 *
 * The direction follows the change - a price going up moves up - so a shopper
 * changing quantity or picking a pricier variant sees which way it went before
 * they have read the number.
 *
 * The value is keyed, so an unchanged price never re-animates on a re-render.
 */
export function AnimatedPrice({
  value,
  currency = 'NPR',
  className,
}: {
  value: number;
  currency?: 'NPR' | 'USD';
  className?: string;
}) {
  const reduced = useReducedMotion();

  // The previous value is kept in state and adjusted during render rather than
  // in a ref: a ref read while rendering is not a value React can be trusted to
  // have kept in sync, and this has to be right on the render that swaps them.
  const [track, setTrack] = React.useState({ value, direction: 1 });
  if (track.value !== value) {
    setTrack({ value, direction: value > track.value ? 1 : -1 });
  }

  const direction = track.direction;
  const formatted = formatPrice(value, currency);

  if (reduced) {
    return <span className={cn('numeric', className)}>{formatted}</span>;
  }

  return (
    // `grid` with both children in the same cell lets the outgoing and incoming
    // figures overlap instead of the row growing to fit two lines mid-swap.
    <span
      className={cn('numeric relative grid overflow-hidden', className)}
      aria-live="polite"
      aria-atomic
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={formatted}
          className="col-start-1 row-start-1"
          initial={{ y: direction * 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: direction * -18, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {formatted}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
