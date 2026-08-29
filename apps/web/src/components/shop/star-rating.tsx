'use client';

import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Star rating. The filled layer is clipped to the exact fraction, so 4.3 shows
 * as 4.3 rather than rounding to a whole or half star.
 */
export function StarRating({
  rating,
  count,
  size = 'md',
  showValue = false,
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
}) {
  const starSize = { sm: 'size-3', md: 'size-4', lg: 'size-5' }[size];
  const textSize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size];
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));

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
        <span
          className="absolute inset-0 flex overflow-hidden"
          style={{ width: `${percent}%` }}
          aria-hidden
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(starSize, 'shrink-0 fill-warning text-warning')} />
          ))}
        </span>
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
