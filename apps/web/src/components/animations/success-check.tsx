'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * The confirmation tick, drawn rather than faded in.
 *
 * `pathLength` is a Framer shorthand for animating `stroke-dashoffset` against
 * the measured length of the path, which is what makes the circle sweep and the
 * tick write themselves at a constant speed regardless of the size it renders
 * at.
 */
export function SuccessCheck({
  className,
  size = 64,
  strokeWidth = 2.5,
  /** Draw the ring before the tick, or just the tick. */
  withCircle = true,
}: {
  className?: string;
  size?: number;
  strokeWidth?: number;
  withCircle?: boolean;
}) {
  const reduced = useReducedMotion();
  const draw = (delay: number, duration: number) =>
    reduced
      ? { pathLength: 1, opacity: 1 }
      : {
          pathLength: 1,
          opacity: 1,
          transition: {
            pathLength: { delay, duration, ease: [0.22, 1, 0.36, 1] as const },
            opacity: { delay, duration: 0.01 },
          },
        };

  return (
    <svg
      role="img"
      aria-label="Success"
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-ok', className)}
    >
      {withCircle ? (
        <motion.circle
          cx="26"
          cy="26"
          r="23"
          stroke="currentColor"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={draw(0, 0.5)}
        />
      ) : null}

      <motion.path
        d="M15 26.5 L23 34 L37.5 19"
        stroke="currentColor"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={draw(withCircle ? 0.35 : 0, 0.35)}
      />
    </svg>
  );
}
