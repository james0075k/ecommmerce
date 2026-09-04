'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Star rating. The filled layer is clipped to the exact fraction, so 4.3 shows
 * as 4.3 rather than rounding to a whole or half star.
 *
 * H2: the fill sweeps in left to right on first paint, with a soft glow behind
 * the filled stars. Animating the clip width rather than each star keeps it to
 * one animated element regardless of the rating.
 */
export function StarRating({
  rating,
  count,
  size = 'md',
  showValue = false,
  /** Set false inside a list that already staggers its own entry. */
  animate = true,
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  animate?: boolean;
}) {
  const reduced = useReducedMotion();
  const starSize = { sm: 'size-3', md: 'size-4', lg: 'size-5' }[size];
  const textSize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size];
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));

  const shouldAnimate = animate && !reduced;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="relative inline-flex"
        role="img"
        aria-label={`Rated ${rating.toFixed(1)} out of 5`}
      >
        <span className="flex" aria-hidden>
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(starSize, 'text-border')} />
          ))}
        </span>

        <motion.span
          className="absolute inset-0 flex overflow-hidden"
          initial={shouldAnimate ? { width: '0%' } : false}
          animate={{ width: `${percent}%` }}
          transition={{
            // 100ms per star (H2), so a five-star rating takes half a second.
            duration: shouldAnimate ? (percent / 100) * 0.5 : 0,
            ease: 'linear',
          }}
          aria-hidden
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star
              key={index}
              className={cn(
                starSize,
                // Filled with the text token rather than the fill one: a star
                // is a graphic that carries meaning, so WCAG 1.4.11 asks for
                // 3:1 against the page and #F59E0B manages 2.15:1 on white.
                // The stroke and the fill match, so the shape stays solid.
                'shrink-0 fill-caution text-caution drop-shadow-[0_0_3px_color-mix(in_srgb,var(--bz-warning)_55%,transparent)]',
              )}
            />
          ))}
        </motion.span>
      </span>

      {showValue ? (
        <span className={cn('numeric font-medium', textSize)}>{rating.toFixed(1)}</span>
      ) : null}

      {count !== undefined ? (
        <span className={cn('numeric text-muted-foreground', textSize)}>({count})</span>
      ) : null}
    </div>
  );
}
